import { Plugin, Notice } from 'obsidian';
import { randomUUID } from 'crypto';
import { MCPBridgeSettings, DEFAULT_SETTINGS, MCPBridgeSettingsTab } from './settings';
import { MCPWebSocketServer, MCPRequest } from './websocket-server';
import { renderNote, getRawNote } from './handlers/render-note';

export default class MCPBridgePlugin extends Plugin {
	settings: MCPBridgeSettings;
	server: MCPWebSocketServer;

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
		const { method, params } = request;

		console.log(`MCP Bridge: Handling request: ${method}`, params);

		switch (method) {
			case 'render_note':
				return await renderNote(this, params.filepath);

			case 'get_note_raw':
				return await getRawNote(this, params.filepath);

			case 'list_vault_files':
				return await this.listVaultFiles(params.folder);

			case 'ping':
				return { status: 'ok', timestamp: Date.now() };

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
			return files
				.filter(f => f.path.startsWith(folder))
				.map(f => f.path);
		}

		return files.map(f => f.path);
	}
}
