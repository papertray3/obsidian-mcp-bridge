import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type MCPBridgePlugin from './main';
import { randomUUID } from 'crypto';

export interface MCPBridgeSettings {
	// Connection settings
	host: string;
	port: number;
	enableRemote: boolean;

	// Security settings
	apiKey: string;
	requireAuth: boolean;

	// SSL/TLS settings (future)
	enableSSL: boolean;
	certPath: string;
	keyPath: string;

	// Remote access control (future)
	allowedOrigins: string[];

	// Digital Garden integration
	digitalGardenRepoPath: string;

	// Cache settings
	cacheDirPath: string;
	cacheMaxSizeMB: number;
}

export const DEFAULT_SETTINGS: MCPBridgeSettings = {
	host: '127.0.0.1',
	port: 27125,
	enableRemote: false,
	apiKey: '',
	requireAuth: true,
	enableSSL: false,
	certPath: '',
	keyPath: '',
	allowedOrigins: [],
	digitalGardenRepoPath: '',
	cacheDirPath: '.obsidian/cache/mcp-bridge-render',
	cacheMaxSizeMB: 100,
};

export class MCPBridgeSettingsTab extends PluginSettingTab {
	plugin: MCPBridgePlugin;

	constructor(app: App, plugin: MCPBridgePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'MCP Bridge Settings' });

		// === Connection Settings ===
		containerEl.createEl('h3', { text: 'Connection Settings' });

		new Setting(containerEl)
			.setName('Host')
			.setDesc('127.0.0.1 for localhost only, 0.0.0.0 for network access')
			.addText(text => text
				.setPlaceholder('127.0.0.1')
				.setValue(this.plugin.settings.host)
				.onChange(async (value) => {
					this.plugin.settings.host = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Port')
			.setDesc('WebSocket server port')
			.addText(text => text
				.setPlaceholder('27125')
				.setValue(String(this.plugin.settings.port))
				.onChange(async (value) => {
					this.plugin.settings.port = parseInt(value) || 27125;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Remote Access')
			.setDesc('⚠️ Warning: Only enable if you understand the security implications')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRemote)
				.onChange(async (value) => {
					this.plugin.settings.enableRemote = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide SSL options
				}));

		// === Security Settings ===

		// === Testing & Development ===
		containerEl.createEl('h3', { text: 'Testing & Development' });

		new Setting(containerEl)
			.setName('Test Harness')
			.setDesc('Open the HTML test harness in your default browser to test tools')
			.addButton(button => button
				.setButtonText('Open Test Harness')
				.setCta()
				.onClick(async () => {
					const { shell } = require('electron');
					const path = require('path');
					const fs = require('fs');

					// Get plugin directory using vault adapter
					const vaultBasePath = (this.app.vault.adapter as any).basePath;
					const pluginDir = path.join(vaultBasePath, '.obsidian', 'plugins', this.plugin.manifest.id);
					const testHarnessPath = path.join(pluginDir, 'test-harness.html');

					// Check if file exists
					if (!fs.existsSync(testHarnessPath)) {
						new Notice('Test harness not found. Please ensure test-harness.html is in the plugin directory.');
						return;
					}

					// Open in default browser
					try {
						await shell.openPath(testHarnessPath);
						new Notice('Test harness opened in browser');
					} catch (error) {
						console.error('Failed to open test harness:', error);
						new Notice('Failed to open test harness - see console for details');
					}
				}));
		containerEl.createEl('h3', { text: 'Security Settings' });

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Required for all connections')
			.addText(text => {
				text.setPlaceholder('Auto-generated')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'password';
			})
			.addButton(button => button
				.setButtonText('Regenerate')
				.onClick(async () => {
					this.plugin.settings.apiKey = randomUUID();
					await this.plugin.saveSettings();
					this.display();
				}))
			.addButton(button => button
				.setButtonText('Copy')
				.onClick(() => {
					navigator.clipboard.writeText(this.plugin.settings.apiKey);
					// TODO: Show notice
					console.log('API key copied to clipboard');
				}));

		new Setting(containerEl)
			.setName('Require Authentication')
			.setDesc('Enforce API key validation (recommended)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.requireAuth)
				.onChange(async (value) => {
					this.plugin.settings.requireAuth = value;
					await this.plugin.saveSettings();
				}));

		// === SSL/TLS Settings (only show if remote enabled) ===
		if (this.plugin.settings.enableRemote) {
			containerEl.createEl('h3', { text: 'SSL/TLS Settings' });

			new Setting(containerEl)
				.setName('Enable SSL')
				.setDesc('Required for secure remote access')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.enableSSL)
					.onChange(async (value) => {
						this.plugin.settings.enableSSL = value;
						await this.plugin.saveSettings();
						this.display();
					}));

			if (this.plugin.settings.enableSSL) {
				new Setting(containerEl)
					.setName('Certificate Path')
					.setDesc('Path to SSL certificate (cert.pem)')
					.addText(text => text
						.setPlaceholder('/path/to/cert.pem')
						.setValue(this.plugin.settings.certPath)
						.onChange(async (value) => {
							this.plugin.settings.certPath = value;
							await this.plugin.saveSettings();
						}));

				new Setting(containerEl)
					.setName('Private Key Path')
					.setDesc('Path to SSL private key (key.pem)')
					.addText(text => text
						.setPlaceholder('/path/to/key.pem')
						.setValue(this.plugin.settings.keyPath)
						.onChange(async (value) => {
							this.plugin.settings.keyPath = value;
							await this.plugin.saveSettings();
						}));
			}

			// Allowed Origins
			containerEl.createEl('h3', { text: 'Remote Access Control' });

			new Setting(containerEl)
				.setName('Allowed Origins')
				.setDesc('Comma-separated list of allowed origins (leave empty to allow all)')
				.addTextArea(text => text
					.setPlaceholder('https://my-server.com, https://another-server.com')
					.setValue(this.plugin.settings.allowedOrigins.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.allowedOrigins = value
							.split(',')
							.map(s => s.trim())
							.filter(s => s.length > 0);
						await this.plugin.saveSettings();
					}));
		}

		// === Cache Settings ===
		containerEl.createEl('h3', { text: 'Cache Settings' });

		new Setting(containerEl)
			.setName('Cache Directory')
			.setDesc('Directory for storing compiled note cache (relative to vault root)')
			.addText(text => text
				.setPlaceholder('.obsidian/cache/mcp-bridge-render')
				.setValue(this.plugin.settings.cacheDirPath)
				.onChange(async (value) => {
					this.plugin.settings.cacheDirPath = value || '.obsidian/cache/mcp-bridge-render';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Cache Size Limit')
			.setDesc('Maximum cache size in MB (older entries evicted when limit reached)')
			.addText(text => text
				.setPlaceholder('100')
				.setValue(String(this.plugin.settings.cacheMaxSizeMB))
				.onChange(async (value) => {
					this.plugin.settings.cacheMaxSizeMB = parseInt(value) || 100;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Clear Cache')
			.setDesc('Delete all cached compiled notes')
			.addButton(button => button
				.setButtonText('Clear Cache')
				.setWarning()
				.onClick(async () => {
					await this.plugin.cacheManager.clear();
					console.log('Cache cleared');
				}));

		// Cache stats
		const cacheStats = this.plugin.cacheManager.getStats();
		const statsDiv = containerEl.createDiv();
		statsDiv.innerHTML = `
			<p><strong>Cache Statistics:</strong></p>
			<ul>
				<li>Entries: ${cacheStats.entries}</li>
				<li>Total Size: ${cacheStats.totalSizeMB.toFixed(2)} MB / ${cacheStats.maxSizeMB} MB</li>
			</ul>
		`;

		// === Help Text ===
		containerEl.createEl('h3', { text: 'Quick Setup Guide' });

		const guide = containerEl.createDiv();
		guide.innerHTML = `
			<p><strong>Local Access (default):</strong></p>
			<ul>
				<li>Host: 127.0.0.1</li>
				<li>Enable Remote: OFF</li>
				<li>Copy API key and set OBSIDIAN_MCP_KEY environment variable</li>
			</ul>

			<p><strong>Remote Access (future):</strong></p>
			<ul>
				<li>Host: 0.0.0.0</li>
				<li>Enable Remote: ON</li>
				<li>Enable SSL: ON</li>
				<li>Configure certificate paths</li>
				<li>Add allowed origins</li>
				<li>Set up firewall rules</li>
			</ul>

			<p><em>⚠️ Remote access exposes your vault to the network. Only enable if you understand the security implications and have proper SSL certificates.</em></p>
		`;

		// Status indicator
		containerEl.createEl('h3', { text: 'Server Status' });
		const statusDiv = containerEl.createDiv();
		statusDiv.innerHTML = `
			<p>WebSocket Server: <strong>${this.plugin.isServerRunning() ? '🟢 Running' : '🔴 Stopped'}</strong></p>
			<p>Listening on: <strong>${this.plugin.settings.host}:${this.plugin.settings.port}</strong></p>
		`;
	}
}
