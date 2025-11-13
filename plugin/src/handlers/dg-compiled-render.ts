import { TFile } from 'obsidian';
import type MCPBridgePlugin from '../main';
import { DigitalGardenIntegration, DigitalGardenNotAvailableError } from '../dg-integration';
import { RenderedContentCacheManager } from '../cache-manager';
import * as path from 'path';

/**
 * Response structure for render_note_dg_compiled
 */
export interface DGCompiledResponse {
	success: boolean;
	cachePath?: string;
	length?: number;
	hash?: string;
	lastModified?: number;
	cacheHit?: boolean;
	error?: string;
	message?: string;
}

/**
 * Render a note using Digital Garden's compiler pipeline
 * Returns metadata about the cached file, not the content itself
 */
export async function renderNoteDGCompiled(
	plugin: MCPBridgePlugin,
	filepath: string
): Promise<DGCompiledResponse> {
	// Get the file
	const file = plugin.app.vault.getAbstractFileByPath(filepath);

	if (!file) {
		return {
			success: false,
			error: 'FileNotFound',
			message: `File not found: ${filepath}`
		};
	}

	if (!(file instanceof TFile)) {
		return {
			success: false,
			error: 'NotAFile',
			message: `Not a file: ${filepath}`
		};
	}

	// Check if Digital Garden is available
	const dgIntegration = new DigitalGardenIntegration(plugin.app);

	if (!dgIntegration.isAvailable()) {
		return {
			success: false,
			error: 'DigitalGardenNotAvailable',
			message: dgIntegration.getNotAvailableMessage()
		};
	}

	// Initialize cache manager
	const cacheManager = plugin.getCacheManager();

	// Check cache
	const cached = await cacheManager.get(file);

	if (cached) {
		// Cache hit
		return {
			success: true,
			cachePath: cached.cachePath,
			length: cached.content.length,
			hash: generateFileHash(file),
			lastModified: file.stat.mtime,
			cacheHit: true
		};
	}

	// Cache miss - compile with Digital Garden
	try {
		const result = await dgIntegration.compileFile(file);

		// Store in cache
		const cachePath = await cacheManager.set(file, result.markdown);

		return {
			success: true,
			cachePath,
			length: result.markdown.length,
			hash: generateFileHash(file),
			lastModified: file.stat.mtime,
			cacheHit: false
		};
	} catch (error) {
		if (error instanceof DigitalGardenNotAvailableError) {
			return {
				success: false,
				error: 'DigitalGardenNotAvailable',
				message: error.message
			};
		}

		return {
			success: false,
			error: 'CompilationError',
			message: `Failed to compile file: ${error.message}`
		};
	}
}

/**
 * Generate a hash for the file (used as cache key)
 */
function generateFileHash(file: TFile): string {
	const { createHash } = require('crypto');
	const input = `${file.path}|${file.stat.mtime}|${file.stat.size}`;
	return createHash('sha256').update(input).digest('hex');
}
