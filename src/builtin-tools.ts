import { App, TFile } from 'obsidian';
import { MetadataExtractor } from './metadata-extractor';

/**
 * Implementations of the plugin's built-in tools (as opposed to user-defined
 * tools loaded from YAML+handler pairs - see tool-registry.ts). Kept separate
 * from main.ts so the plugin lifecycle/request-routing file doesn't also have
 * to carry every tool's implementation.
 */
export class BuiltinTools {
	constructor(private app: App, private metadataExtractor: MetadataExtractor) {}

	/**
	 * Dispatches one of this class's tools by name. Does not handle `ping`,
	 * `run_dataview_block`, or `extract_dataview_blocks` - those stay in
	 * main.ts's handleBuiltinTool() since they need the full plugin instance.
	 */
	async execute(method: string, params: Record<string, unknown>): Promise<unknown> {
		// Params arrive as untyped JSON from the WebSocket request - these casts
		// reflect that boundary (no runtime schema validation happens here, matching
		// existing behavior; the JSON Schema in each tool's YAML is documentation
		// for the calling AI client, not enforced server-side).
		switch (method) {
			case 'search_files':
				return this.searchFiles(params as unknown as { pattern: string });
			case 'get_note_raw':
				return this.getNoteRaw(params as unknown as { filepath: string });
			case 'get_note_metadata':
				return this.getNoteMetadata(params as unknown as GetNoteMetadataParams);
			case 'get_note_links':
				return this.getNoteLinks(params as unknown as GetNoteLinksParams);
			case 'resolve_wiki_links':
				return this.resolveWikiLinks(params as unknown as ResolveWikiLinksParams);
			case 'list_vault_files':
				return this.listVaultFiles(params as unknown as { folder?: string });
			default:
				throw new Error(`Unknown builtin tool: ${method}`);
		}
	}

	/**
	 * Search for files using glob patterns
	 */
	private async searchFiles(params: { pattern: string }): Promise<Record<string, unknown>> {
		const { pattern } = params;

		// Simple glob matching (could be enhanced with proper glob library)
		const files = this.app.vault.getMarkdownFiles();
		const regex = globToRegex(pattern);

		const matches = files
			.filter(f => regex.test(f.path))
			.map(f => f.path);

		return {
			pattern: pattern,
			matches: matches.length,
			files: matches
		};
	}

	/**
	 * Get raw markdown content of a note
	 */
	private async getNoteRaw(params: { filepath: string }): Promise<string> {
		const { filepath } = params;

		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filepath}`);
		}

		return this.app.vault.read(file);
	}

	/**
	 * List all markdown files in vault or folder
	 */
	private async listVaultFiles(params: { folder?: string }): Promise<Record<string, unknown>> {
		const { folder = '' } = params;

		const files = this.app.vault.getMarkdownFiles();

		const filtered = folder
			? files.filter(f => f.path.startsWith(folder))
			: files;

		return {
			folder: folder || 'vault root',
			count: filtered.length,
			files: filtered.map(f => ({
				path: f.path,
				name: f.name,
				basename: f.basename,
				extension: f.extension,
				stat: {
					ctime: f.stat.ctime,
					mtime: f.stat.mtime,
					size: f.stat.size
				}
			}))
		};
	}

	/**
	 * Get structured metadata for a note
	 */
	private async getNoteMetadata(params: GetNoteMetadataParams): Promise<unknown> {
		const { filepath, includeLinks, includeBacklinks, maxLinks, resolvePaths } = params;

		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filepath}`);
		}

		return this.metadataExtractor.extractNoteMetadata(file, {
			includeLinks,
			includeBacklinks,
			maxLinks,
			resolvePaths
		});
	}

	/**
	 * Get paginated links (outgoing and backlinks) for a note
	 */
	private async getNoteLinks(params: GetNoteLinksParams): Promise<Record<string, unknown>> {
		const {
			filepath,
			includeOutgoing = true,
			includeBacklinks = true,
			resolvePaths = true,
			limit = 100,
			offset = 0
		} = params;

		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filepath}`);
		}

		const links = await this.metadataExtractor.getPaginatedLinks(file, {
			includeOutgoing,
			includeBacklinks,
			resolvePaths,
			limit,
			offset
		});

		return {
			filepath,
			...links
		};
	}

	/**
	 * Resolve wiki links to file paths (batch operation)
	 */
	private async resolveWikiLinks(params: ResolveWikiLinksParams): Promise<Record<string, unknown>> {
		const { links, sourcePath = '' } = params;

		if (!Array.isArray(links)) {
			throw new Error('links parameter must be an array');
		}

		const resolved = await this.metadataExtractor.resolveWikiLinks(links, sourcePath);

		return {
			count: links.length,
			resolved
		};
	}
}

interface GetNoteMetadataParams {
	filepath: string;
	includeLinks?: boolean;
	includeBacklinks?: boolean;
	maxLinks?: number;
	resolvePaths?: boolean;
}

interface GetNoteLinksParams {
	filepath: string;
	includeOutgoing?: boolean;
	includeBacklinks?: boolean;
	resolvePaths?: boolean;
	limit?: number;
	offset?: number;
}

interface ResolveWikiLinksParams {
	links: string[];
	sourcePath?: string;
}

/**
 * Convert a glob pattern to a RegExp.
 * ** -> .*   * -> [^/]*   ? -> .
 */
function globToRegex(pattern: string): RegExp {
	const regex = pattern
		.replace(/\*\*/g, '___DOUBLESTAR___')
		.replace(/\*/g, '[^/]*')
		.replace(/___DOUBLESTAR___/g, '.*')
		.replace(/\?/g, '.');

	return new RegExp(`^${regex}$`);
}
