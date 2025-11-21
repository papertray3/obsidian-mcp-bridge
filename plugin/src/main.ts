import { Plugin, Notice, TFile, PluginManifest, Command, Hotkey } from 'obsidian';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { MCPBridgeSettings, DEFAULT_SETTINGS, MCPBridgeSettingsTab } from './settings';
import { MCPWebSocketServer, MCPRequest } from './websocket-server';
import { getRawNote } from './handlers/render-note';
import { renderNoteDGCompiled } from './handlers/dg-compiled-render';
import { runDataviewBlock, extractDataviewBlocks } from './handlers/dataview-block';
import { RenderedContentCacheManager, CacheSettings } from './cache-manager';

export default class MCPBridgePlugin extends Plugin {
	settings: MCPBridgeSettings;
	server: MCPWebSocketServer;
	cacheManager: RenderedContentCacheManager;

	async onload() {
		await this.loadSettings();

		// Generate API key if not set
		if (!this.settings.apiKey) {
			this.settings.apiKey = randomUUID();
			await this.saveSettings();

			new Notice(
				'MCP Bridge: API key generated. Copy it from settings to configure MCP server.',
				10000
			);
		}

		// Initialize cache manager
		const vaultBasePath = (this.app.vault.adapter as any).basePath;
		const cacheSettings: CacheSettings = {
			cacheDir: path.join(vaultBasePath, this.settings.cacheDirPath),
			vaultBasePath: vaultBasePath,
			maxSizeMB: this.settings.cacheMaxSizeMB
		};
		this.cacheManager = new RenderedContentCacheManager(this.app.vault, cacheSettings);

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
		statusBarItem.setText('MCP Bridge: Active');
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

		console.log('MCP Bridge plugin loaded');
	}

	onunload() {
		// Stop WebSocket server
		this.server.stop();
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

		switch (method) {
			case 'get_note_raw':
				return await getRawNote(this, params.filepath);

			case 'render_note_dg_compiled':
				return await renderNoteDGCompiled(this, params.filepath);

			case 'run_dataview_block':
				return await runDataviewBlock(this, {
					filepath: params.filepath,
					flavor: params.flavor,
					source: params.source,
					input: params.input
				});

			case 'extract_dataview_blocks':
				return await extractDataviewBlocks(this, params.filepath);

			case 'list_vault_files':
				return await this.listVaultFiles(params.folder);

			case 'list_plugins':
				return this.listPlugins();

			case 'get_plugin_info':
				return this.getPluginInfo(params.pluginId ?? params.plugin_id);

			case 'dataview_query':
				return await this.runDataviewQuery(params.query, params.context ?? params.contextPath);

			case 'search_vault':
				return this.searchVault(params.query, params.folder);

			case 'ping':
				return { status: 'ok', timestamp: Date.now() };

			case 'broadcast':
				// Broadcast a message to all connected WebSocket clients
				// Used for real-time event notifications (e.g., agent status updates)
				this.server.broadcast({
					type: params.type || 'event',
					timestamp: Date.now(),
					...params
				});
				return { status: 'broadcast_sent', clients: this.server['clients'].size };

			default:
				throw new Error(`Unknown method: ${method}`);
		}
	}

	/**
	 * List files in vault or specific folder
	 */
	private async listVaultFiles(folder?: string): Promise<string[]> {
		const files = this.app.vault.getMarkdownFiles();

		if (folder) {
			const normalizedFolder = folder.trim();
			return files
				.filter(f => f.path.startsWith(normalizedFolder))
				.map(f => f.path);
		}

		return files.map(f => f.path);
	}

	private listPlugins(): PluginSummary[] {
		const pluginSystem = this.getPluginSystem();
		return Object.values(pluginSystem.manifests).map(manifest => {
			const instance = pluginSystem.plugins[manifest.id];
			return {
				id: manifest.id,
				name: manifest.name,
				author: manifest.author,
				description: manifest.description,
				version: manifest.version,
				enabled: pluginSystem.enabledPlugins.has(manifest.id),
				hasApi: Boolean(instance?.api),
				dir: manifest.dir ?? ''
			};
		});
	}

	private getPluginInfo(pluginId?: string): PluginDetails {
		if (!pluginId) {
			throw new Error('get_plugin_info requires pluginId');
		}

		const pluginSystem = this.getPluginSystem();
		const manifest = pluginSystem.manifests[pluginId];

		if (!manifest) {
			throw new Error(`Plugin not found: ${pluginId}`);
		}

		const instance = pluginSystem.plugins[pluginId];
		const api = (instance as PluginWithOptionalApi | undefined)?.api as Record<string, unknown> | undefined;

		return {
			id: manifest.id,
			name: manifest.name,
			author: manifest.author,
			description: manifest.description,
			version: manifest.version,
			enabled: pluginSystem.enabledPlugins.has(pluginId),
			hasApi: Boolean(api),
			dir: manifest.dir ?? '',
			manifest,
			apiMethods: this.extractApiMethodNames(api),
			commands: this.getCommandsForPlugin(pluginId)
		};
	}

	private async runDataviewQuery(query?: string, contextPath?: string): Promise<string> {
		if (!query) {
			throw new Error('dataview_query requires a query string');
		}

		const pluginSystem = this.getPluginSystem();
		const dataviewPlugin = pluginSystem.plugins['dataview'] as DataviewPluginInstance | undefined;

		if (!dataviewPlugin?.api?.tryQueryMarkdown) {
			throw new Error('Dataview plugin is not installed or enabled');
		}

		const sourcePath = contextPath || this.app.workspace.getActiveFile()?.path || '';
		const markdown = await dataviewPlugin.api.tryQueryMarkdown(query, sourcePath);

		if (!markdown) {
			throw new Error('Dataview query returned no results');
		}

		return markdown;
	}

	private searchVault(query?: string, folder?: string): VaultSearchResult[] {
		if (!query) {
			throw new Error('search_vault requires a query string');
		}

		const normalizedQuery = query.toLowerCase();
		const normalizedFolder = folder?.trim();
		const files = this.app.vault.getMarkdownFiles();

		return files
			.filter(file => {
				if (normalizedFolder && !file.path.startsWith(normalizedFolder)) {
					return false;
				}
				const pathMatch = file.path.toLowerCase().includes(normalizedQuery);
				const nameMatch = file.basename.toLowerCase().includes(normalizedQuery);
				return pathMatch || nameMatch;
			})
			.map(file => {
				const pathMatch = file.path.toLowerCase().includes(normalizedQuery);
				const nameMatch = file.basename.toLowerCase().includes(normalizedQuery);
				return {
					path: file.path,
					name: file.basename,
					matchType: pathMatch && nameMatch ? 'path+name' : pathMatch ? 'path' : 'name',
					parent: file.parent?.path ?? '',
					tags: this.extractTags(file)
				};
			});
	}

	private extractTags(file: TFile): string[] {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.tags) {
			return [];
		}
		return cache.tags.map(tagCache => tagCache.tag);
	}

	private getPluginSystem(): PluginSystemRef {
		const appWithPlugins = this.app as unknown as AppWithPlugins;
		return appWithPlugins.plugins;
	}

	private getCommandsForPlugin(pluginId: string): PluginCommandInfo[] {
		const commandManager = (this.app as unknown as AppWithCommands).commands;
		const registry = (commandManager?.commands ?? {}) as Record<string, Command>;
		return Object.values(registry)
			.filter(command => command.id.startsWith(`${pluginId}:`))
			.map(command => ({
				id: command.id,
				name: command.name,
				hotkeys: this.formatHotkeys(command.hotkeys ?? [])
			}));
	}

	private extractApiMethodNames(api?: Record<string, unknown>): string[] {
		if (!api) {
			return [];
		}
		return Object.keys(api).filter(key => typeof (api as Record<string, unknown>)[key] === 'function');
	}

	private formatHotkeys(hotkeys: Hotkey[]): string[] {
		return hotkeys.map(hotkey => {
			const modifiers = hotkey.modifiers?.length ? `${hotkey.modifiers.join('+')}+` : '';
			return `${modifiers}${hotkey.key}`;
		});
	}

	/**
	 * Get the cache manager instance
	 */
	getCacheManager(): RenderedContentCacheManager {
		return this.cacheManager;
	}

	/**
	 * Clear the entire cache
	 */
	async clearCache(): Promise<void> {
		await this.cacheManager.clear();
		new Notice('MCP Bridge: Cache cleared');
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { entries: number; totalSizeMB: number; maxSizeMB: number } {
		return this.cacheManager.getStats();
	}
}

interface PluginSummary {
	id: string;
	name: string;
	version: string;
	description: string;
	author: string;
	enabled: boolean;
	hasApi: boolean;
	dir: string;
}

interface PluginDetails extends PluginSummary {
	manifest: PluginManifest;
	apiMethods: string[];
	commands: PluginCommandInfo[];
}

interface PluginCommandInfo {
	id: string;
	name: string;
	hotkeys: string[];
}

interface VaultSearchResult {
	path: string;
	name: string;
	matchType: 'path' | 'name' | 'path+name';
	parent: string;
	tags: string[];
}

type PluginWithOptionalApi = Plugin & { api?: Record<string, unknown> };

type PluginSystemRef = {
	manifests: Record<string, PluginManifest>;
	enabledPlugins: Set<string>;
	plugins: Record<string, PluginWithOptionalApi>;
};

type DataviewPluginInstance = PluginWithOptionalApi & {
	api?: {
		tryQueryMarkdown: (query: string, sourcePath?: string) => Promise<string | null>;
	};
};

type AppWithCommands = {
	commands?: {
		commands?: Record<string, Command>;
	};
};

type AppWithPlugins = {
	plugins: PluginSystemRef;
};
