import { Plugin, Notice, TFile } from 'obsidian';
import { randomUUID } from 'crypto';
import { MCPBridgeSettings, DEFAULT_SETTINGS, MCPBridgeSettingsTab } from './settings';
import { MCPWebSocketServer, MCPRequest } from './websocket-server';
import { ToolRegistry } from './tool-registry';
import * as path from 'path';
import { RenderedContentCacheManager, CacheSettings } from './cache-manager';
import { runDataviewBlock, extractDataviewBlocks } from './handlers/dataview-block';
import { MetadataExtractor } from './metadata-extractor';

export default class MCPBridgePlugin extends Plugin {
	settings: MCPBridgeSettings;
	server: MCPWebSocketServer;
	toolRegistry: ToolRegistry;
	cacheManager: RenderedContentCacheManager;
	metadataExtractor: MetadataExtractor;

	async onload() {
		await this.loadSettings();

		// Initialize cache manager
		const vaultBasePath = (this.app.vault.adapter as any).basePath;
		const cacheSettings: CacheSettings = {
			cacheDir: path.join(vaultBasePath, this.settings.cacheDirPath),
			vaultBasePath: vaultBasePath,
			maxSizeMB: this.settings.cacheMaxSizeMB
		};
		this.cacheManager = new RenderedContentCacheManager(this.app.vault, cacheSettings);

		// Initialize metadata extractor
		this.metadataExtractor = new MetadataExtractor(
			this.app,
			this.app.metadataCache,
			this.app.vault
		);

		// Generate API key if not set
		if (!this.settings.apiKey) {
			this.settings.apiKey = randomUUID();
			await this.saveSettings();

			new Notice(
				'MCP Bridge: API key generated. Copy it from settings to configure MCP server.',
				10000
			);
		}

		// Initialize tool registry
		const pluginDir = path.join(vaultBasePath, '.obsidian', 'plugins', this.manifest.id);
		this.toolRegistry = new ToolRegistry(this.app, pluginDir);

		try {
			await this.toolRegistry.initialize();
			const stats = this.toolRegistry.getStats();
			console.log(`MCP Bridge: Tool registry initialized (${stats.total} tools: ${stats.builtin} builtin, ${stats.user} user)`);
		} catch (error) {
			console.error('MCP Bridge: Failed to initialize tool registry:', error);
			new Notice('MCP Bridge: Failed to initialize tool registry - see console', 5000);
		}

		// Initialize WebSocket server
		this.server = new MCPWebSocketServer(this);

		// Start server
		try {
			this.server.start();
			new Notice(`MCP Bridge: Server started on ${this.settings.host}:${this.settings.port}`);
		} catch (error) {
			console.error('MCP Bridge: Failed to start server:', error);
			new Notice('MCP Bridge: Failed to start server. Check console for details.', 5000);
		}

		// Add settings tab
		this.addSettingTab(new MCPBridgeSettingsTab(this.app, this));

		// Add status bar item
		const statusBarItem = this.addStatusBarItem();
		const stats = this.toolRegistry.getStats();
		statusBarItem.setText(`MCP Bridge: ${stats.total} tools`);
		statusBarItem.addClass('mcp-bridge-status');

		// Add command to copy API key
		this.addCommand({
			id: 'copy-api-key',
			name: 'Copy API Key',
			callback: () => {
				navigator.clipboard.writeText(this.settings.apiKey);
				new Notice('MCP Bridge: API key copied to clipboard');
			}
		});

		// Add command to restart server
		this.addCommand({
			id: 'restart-server',
			name: 'Restart WebSocket Server',
			callback: () => {
				this.server.stop();
				this.server.start();
				new Notice('MCP Bridge: Server restarted');
			}
		});

		// Add command to reload tool registry
		this.addCommand({
			id: 'reload-tools',
			name: 'Reload Tool Registry',
			callback: async () => {
				await this.toolRegistry.reload();
				const stats = this.toolRegistry.getStats();
				statusBarItem.setText(`MCP Bridge: ${stats.total} tools`);
			}
		});

		console.log('MCP Bridge plugin loaded - extensible tool registry');
	}

	onunload() {
		// Stop WebSocket server
		this.server.stop();

		// Cleanup tool registry
		this.toolRegistry.destroy();

		console.log('MCP Bridge plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	isServerRunning(): boolean {
		return this.server?.isRunning() ?? false;
	}

	/**
	 * Handle incoming MCP requests
	 */
	async handleRequest(request: MCPRequest): Promise<any> {
		const { method, params = {} } = request;

		console.log(`MCP Bridge: Handling request: ${method}`, params);
		console.log(`MCP Bridge: Method name length: ${method.length}, method bytes: ${method.split('').map(c => c.charCodeAt(0)).join(',')}`);

		try {
			// Check if this is a tool in the registry
			console.log(`MCP Bridge: Checking if '${method}' is a registered tool...`);
			const tool = this.toolRegistry.getTool(method);

			if (tool) {
				console.log(`MCP Bridge: Found tool '${method}', handler type: ${tool.handler}`);
				// Route to appropriate handler
				if (tool.handler === 'builtin') {
					return this.handleBuiltinTool(method, params);
				} else {
					// Execute user script
					return await this.toolRegistry.executeTool(method, params);
				}
			}

			console.log(`MCP Bridge: '${method}' not a tool, checking fallback methods...`);
			console.log(`MCP Bridge: Method string comparison - is it 'tools/list'? ${method === 'tools/list'}`);
			console.log(`MCP Bridge: Method string comparison - is it 'ping'? ${method === 'ping'}`);

			// Fallback for special methods
			console.log(`MCP Bridge: About to switch on method: '${method}' (type: ${typeof method})`);
			switch (method) {
				case 'ping':
					console.log(`MCP Bridge: Handling ping request`);
					return {
						status: 'ok',
						timestamp: Date.now(),
						version: '2.0.0-extensible'
					};

				case 'broadcast':
					this.server.broadcast({
						type: params.type || 'event',
						timestamp: Date.now(),
						...params
					});
					return {
						status: 'broadcast_sent',
						clients: this.server['clients'].size
					};

				case 'tools/list':
					// Return all available tools
					console.log(`MCP Bridge: Matched tools/list case`);
					try {
						console.log(`MCP Bridge: Listing tools...`);
						const allTools = this.toolRegistry?.getAllTools() || [];
						console.log(`MCP Bridge: Found ${allTools.length} tools`);
						
						// Build response incrementally to avoid blocking
						const toolsArray: any[] = [];
						for (const t of allTools) {
							const toolDef = {
								name: t.name,
								description: t.description,
								inputSchema: t.inputSchema,
								...(t.outputSchema && { outputSchema: t.outputSchema }),
								...(t.category && { category: t.category }),
								...(t.tags && { tags: t.tags })
							};
							
							// Log first tool to debug schema format
							if (toolsArray.length === 0) {
								console.log(`MCP Bridge: First tool schema:`, JSON.stringify(toolDef, null, 2));
							}
							
							toolsArray.push(toolDef);
						}
						
						console.log(`MCP Bridge: Returning ${toolsArray.length} tools with schemas`);
						return {
							tools: toolsArray
						};
					} catch (error) {
						console.error('Error listing tools:', error);
						return {
							tools: [],
							error: `Failed to list tools: ${error instanceof Error ? error.message : 'Unknown error'}`
						};
					}

				default:
					console.log(`MCP Bridge: Unknown method: '${method}'`);
					throw new Error(`Unknown method: ${method}`);
			}
		} catch (error) {
			console.error(`MCP Bridge: Error in handleRequest for '${method}':`, error);
			throw error;
		}
	}

	/**
	 * Handle built-in tools
	 */
	private async handleBuiltinTool(method: string, params: any): Promise<any> {
		switch (method) {
			case 'ping':
				return {
					status: 'ok',
					timestamp: Date.now(),
					version: '2.0.0-extensible'
				};

			case 'search_files':
				return this.searchFiles(params);

			case 'get_note_raw':
				return this.getNoteRaw(params);

			case 'get_note_metadata':
				return this.getNoteMetadata(params);

			case 'get_note_links':
				return this.getNoteLinks(params);

			case 'resolve_wiki_links':
				return this.resolveWikiLinks(params);

			case 'list_vault_files':
				return this.listVaultFiles(params);

			case 'run_dataview_block':
				return await runDataviewBlock(this, params);

			case 'extract_dataview_blocks':
				return await extractDataviewBlocks(this, params.filepath);

			default:
				throw new Error(`Unknown builtin tool: ${method}`);
		}
	}

	/**
	 * Built-in: Search for files using glob patterns
	 */
	private async searchFiles(params: { pattern: string }): Promise<any> {
		const { pattern } = params;

		// Simple glob matching (could be enhanced with proper glob library)
		const files = this.app.vault.getMarkdownFiles();
		const regex = this.globToRegex(pattern);

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
	 * Built-in: Get raw markdown content of a note
	 */
	private async getNoteRaw(params: { filepath: string }): Promise<string> {
		const { filepath } = params;

		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filepath}`);
		}

		const content = await this.app.vault.read(file);

		return content;
	}

	/**
	 * Built-in: List all markdown files in vault or folder
	 */
	private async listVaultFiles(params: { folder?: string }): Promise<any> {
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
	 * Built-in: Get structured metadata for a note
	 */
	private async getNoteMetadata(params: {
		filepath: string;
		includeLinks?: boolean;
		includeBacklinks?: boolean;
		maxLinks?: number;
		resolvePaths?: boolean;
	}): Promise<any> {
		const { filepath, includeLinks, includeBacklinks, maxLinks, resolvePaths } = params;

		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filepath}`);
		}

		const metadata = await this.metadataExtractor.extractNoteMetadata(file, {
			includeLinks,
			includeBacklinks,
			maxLinks,
			resolvePaths
		});

		return metadata;
	}

	/**
	 * Built-in: Get paginated links (outgoing and backlinks) for a note
	 */
	private async getNoteLinks(params: {
		filepath: string;
		includeOutgoing?: boolean;
		includeBacklinks?: boolean;
		resolvePaths?: boolean;
		limit?: number;
		offset?: number;
	}): Promise<any> {
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
	 * Built-in: Resolve wiki links to file paths (batch operation)
	 */
	private async resolveWikiLinks(params: {
		links: string[];
		sourcePath?: string;
	}): Promise<any> {
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

	/**
	 * Convert glob pattern to regex
	 */
	private globToRegex(pattern: string): RegExp {
		// Simple glob to regex conversion
		// ** → .*
		// * → [^/]*
		// ? → .
		let regex = pattern
			.replace(/\*\*/g, '___DOUBLESTAR___')
			.replace(/\*/g, '[^/]*')
			.replace(/___DOUBLESTAR___/g, '.*')
			.replace(/\?/g, '.');

		return new RegExp(`^${regex}$`);
	}
}
