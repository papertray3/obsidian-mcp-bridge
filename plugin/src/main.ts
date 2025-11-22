import { Plugin, Notice, TFile } from 'obsidian';
import { randomUUID } from 'crypto';
import { MCPBridgeSettings, DEFAULT_SETTINGS, MCPBridgeSettingsTab } from './settings';
import { MCPWebSocketServer, MCPRequest } from './websocket-server';
import { ToolRegistry } from './tool-registry';
import * as path from 'path';
import { RenderedContentCacheManager, CacheSettings } from './cache-manager';
import { runDataviewBlock, extractDataviewBlocks } from './handlers/dataview-block';

export default class MCPBridgePlugin extends Plugin {
	settings: MCPBridgeSettings;
	server: MCPWebSocketServer;
	toolRegistry: ToolRegistry;
	cacheManager: RenderedContentCacheManager;

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
		debugger;
		const pluginDir = (this.manifest as any).dir || this.app.vault.configDir;
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

		// Check if this is a tool in the registry
		const tool = this.toolRegistry.getTool(method);

		if (tool) {
			// Route to appropriate handler
			if (tool.handler === 'builtin') {
				return this.handleBuiltinTool(method, params);
			} else {
				// Execute user script
				return await this.toolRegistry.executeTool(method, params);
			}
		}

		// Fallback for special methods
		switch (method) {
			case 'ping':
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
				return {
					tools: this.toolRegistry.getAllTools().map(t => ({
						name: t.name,
						description: t.description,
						inputSchema: t.inputSchema,
						category: t.category,
						tags: t.tags
					}))
				};

			default:
				throw new Error(`Unknown method: ${method}`);
		}
	}

	/**
	 * Handle built-in tools
	 */
	private async handleBuiltinTool(method: string, params: any): Promise<any> {
		switch (method) {
			case 'search_files':
				return this.searchFiles(params);

			case 'get_note_raw':
				return this.getNoteRaw(params);

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
	private async getNoteRaw(params: { filepath: string }): Promise<any> {
		const { filepath } = params;

		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${filepath}`);
		}

		const content = await this.app.vault.read(file);

		return {
			filepath: filepath,
			content: content,
			size: content.length
		};
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
