import { TFile, Vault } from 'obsidian';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

export interface CacheEntry {
	hash: string;
	filepath: string;
	mtime: number;
	size: number;
	lastAccess: number;
	cachedSize: number;
}

export interface CacheMetadata {
	entries: Record<string, CacheEntry>;
	totalSize: number;
}

export interface CacheSettings {
	cacheDir: string;
	vaultBasePath: string;
	maxSizeMB: number;
}

export class RenderedContentCacheManager {
	private vault: Vault;
	private settings: CacheSettings;
	private metadata: CacheMetadata;
	private metadataPath: string;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	// Debounced rather than immediate: metadata.entries already lives in memory as the
	// source of truth for reads (get()/set() never re-read from disk), so the only cost
	// of coalescing writes is a slightly stale metadata.json if the process crashes -
	// flush() (called on plugin unload) covers the normal shutdown path.
	private readonly saveDebounceMs = 500;

	constructor(vault: Vault, settings: CacheSettings) {
		this.vault = vault;
		this.settings = settings;
		this.metadataPath = path.join(settings.cacheDir, 'metadata.json');
		this.metadata = this.loadMetadata();
	}

	/**
	 * Generate cache key from file metadata
	 */
	private generateCacheKey(file: TFile): string {
		const input = `${file.path}|${file.stat.mtime}|${file.stat.size}`;
		return createHash('sha256').update(input).digest('hex');
	}

	/**
	 * Convert absolute path to vault-relative path
	 * This ensures paths work across different environments (Windows/WSL/Unix)
	 */
	private toVaultRelativePath(absolutePath: string): string {
		const vaultBase = this.settings.vaultBasePath;
		if (absolutePath.startsWith(vaultBase)) {
			// Remove vault base and normalize separators
			return absolutePath
				.substring(vaultBase.length)
				.replace(/^[/\\]+/, '')  // Remove leading slashes
				.replace(/\\/g, '/');    // Normalize to forward slashes
		}
		// If path doesn't start with vault base, return as-is (shouldn't happen)
		return absolutePath;
	}

	/**
	 * Get cached content if valid, otherwise return null
	 */
	async get(file: TFile): Promise<{ content: string; cachePath: string } | null> {
		const hash = this.generateCacheKey(file);
		const entry = this.metadata.entries[hash];

		if (!entry) {
			return null;
		}

		// Verify cache file exists
		const cachePath = path.join(this.settings.cacheDir, hash, 'note.html');
		if (!fs.existsSync(cachePath)) {
			// Cache entry exists but file is missing - clean up
			delete this.metadata.entries[hash];
			this.scheduleSave();
			return null;
		}

		// Update last access time
		entry.lastAccess = Date.now();
		this.scheduleSave();

		// Read cached content
		const content = fs.readFileSync(cachePath, 'utf-8');

		// Return vault-relative path for cross-environment compatibility
		return { content, cachePath: this.toVaultRelativePath(cachePath) };
	}

	/**
	 * Store compiled content in cache
	 */
	async set(file: TFile, content: string): Promise<string> {
		const hash = this.generateCacheKey(file);
		const cacheDir = path.join(this.settings.cacheDir, hash);
		const cachePath = path.join(cacheDir, 'note.html');

		// Create cache directory
		if (!fs.existsSync(cacheDir)) {
			fs.mkdirSync(cacheDir, { recursive: true });
		}

		// Write content
		fs.writeFileSync(cachePath, content, 'utf-8');

		// Get file size
		const stats = fs.statSync(cachePath);
		const cachedSize = stats.size;

		// Update metadata
		const entry: CacheEntry = {
			hash,
			filepath: file.path,
			mtime: file.stat.mtime,
			size: file.stat.size,
			lastAccess: Date.now(),
			cachedSize
		};

		this.metadata.entries[hash] = entry;
		this.metadata.totalSize += cachedSize;
		this.scheduleSave();

		// Enforce size limit
		this.enforceSizeLimit();

		// Return vault-relative path for cross-environment compatibility
		return this.toVaultRelativePath(cachePath);
	}

	/**
	 * Enforce cache size limit using LRU eviction
	 */
	private enforceSizeLimit(): void {
		const maxSizeBytes = this.settings.maxSizeMB * 1024 * 1024;
		let evicted = false;

		while (this.metadata.totalSize > maxSizeBytes) {
			// Find oldest entry by lastAccess
			let oldestEntry: CacheEntry | null = null;
			let oldestHash: string | null = null;

			for (const [hash, entry] of Object.entries(this.metadata.entries)) {
				if (!oldestEntry || entry.lastAccess < oldestEntry.lastAccess) {
					oldestEntry = entry;
					oldestHash = hash;
				}
			}

			if (!oldestHash || !oldestEntry) {
				break;
			}

			// Delete cached file
			const cacheDir = path.join(this.settings.cacheDir, oldestHash);
			if (fs.existsSync(cacheDir)) {
				fs.rmSync(cacheDir, { recursive: true });
			}

			// Update metadata
			this.metadata.totalSize -= oldestEntry.cachedSize;
			delete this.metadata.entries[oldestHash];
			evicted = true;
		}

		if (evicted) this.scheduleSave();
	}

	/**
	 * Load metadata from disk
	 */
	private loadMetadata(): CacheMetadata {
		if (!fs.existsSync(this.metadataPath)) {
			return { entries: {}, totalSize: 0 };
		}

		try {
			const data = fs.readFileSync(this.metadataPath, 'utf-8');
			return JSON.parse(data);
		} catch (error) {
			logger.error('Failed to load cache metadata:', error);
			return { entries: {}, totalSize: 0 };
		}
	}

	/**
	 * Debounce a metadata write: `get()`/`set()` mutate the in-memory
	 * `this.metadata` directly (reads never hit disk), so coalescing the
	 * writes behind a short delay avoids doing a full JSON serialize + file
	 * write on every single cache access. flush() (called on plugin unload)
	 * covers the shutdown path so a debounced write is never silently lost.
	 */
	private scheduleSave(): void {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			this.saveMetadataNow();
		}, this.saveDebounceMs);
	}

	/** Writes pending metadata to disk immediately, canceling any scheduled debounce. */
	flush(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		this.saveMetadataNow();
	}

	private saveMetadataNow(): void {
		// Ensure cache directory exists
		const cacheDir = path.dirname(this.metadataPath);
		if (!fs.existsSync(cacheDir)) {
			fs.mkdirSync(cacheDir, { recursive: true });
		}

		try {
			fs.writeFileSync(
				this.metadataPath,
				JSON.stringify(this.metadata, null, 2),
				'utf-8'
			);
		} catch (error) {
			logger.error('Failed to save cache metadata:', error);
		}
	}

	/**
	 * Clear entire cache
	 */
	async clear(): Promise<void> {
		if (fs.existsSync(this.settings.cacheDir)) {
			fs.rmSync(this.settings.cacheDir, { recursive: true });
		}

		this.metadata = { entries: {}, totalSize: 0 };
		this.flush();
	}

	/**
	 * Get cache statistics
	 */
	getStats(): { entries: number; totalSizeMB: number; maxSizeMB: number } {
		return {
			entries: Object.keys(this.metadata.entries).length,
			totalSizeMB: this.metadata.totalSize / (1024 * 1024),
			maxSizeMB: this.settings.maxSizeMB
		};
	}
}
