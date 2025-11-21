import { Plugin, Notice } from 'obsidian';
import { randomUUID } from 'crypto';
import { MCPBridgeSettings, DEFAULT_SETTINGS, MCPBridgeSettingsTab } from './settings';
import { MCPWebSocketServer, MCPRequest } from './websocket-server';

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

		console.log('MCP Bridge plugin loaded - minimal WebSocket server');
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
	 *
	 * This is the minimal handler - only supports ping and broadcast
	 * Tools will be added via the dynamic tool registry
	 */
	async handleRequest(request: MCPRequest): Promise<any> {
		const { method, params = {} } = request;

		console.log(`MCP Bridge: Handling request: ${method}`, params);

		switch (method) {
			case 'ping':
				// Basic connectivity test
				return {
					status: 'ok',
					timestamp: Date.now(),
					version: '2.0.0-minimal'
				};

			case 'broadcast':
				// Broadcast a message to all connected WebSocket clients
				// Used for real-time event notifications (e.g., agent status updates)
				this.server.broadcast({
					type: params.type || 'event',
					timestamp: Date.now(),
					...params
				});
				return {
					status: 'broadcast_sent',
					clients: this.server['clients'].size
				};

			default:
				throw new Error(`Unknown method: ${method}. This is the minimal WebSocket server - tools should be added via the tool registry.`);
		}
	}
}
