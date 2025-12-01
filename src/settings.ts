import { App, PluginSettingTab, Setting, Notice, Modal, TextComponent, TextAreaComponent } from 'obsidian';
import type MCPBridgePlugin from './main';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

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

	// Tool discovery settings
	toolSearchPaths: string[];
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
	toolSearchPaths: ['.obsidian/mcp-bridge/tools'],
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

		// === Custom Tools ===
		containerEl.createEl('h3', { text: 'Custom Tools' });

		const userToolsDir = path.join(
			(this.app.vault.adapter as any).basePath,
			'.obsidian',
			'mcp-bridge',
			'tools'
		);

		// Load user tools
		let userTools: any[] = [];
		if (fs.existsSync(userToolsDir)) {
			const files = fs.readdirSync(userToolsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
			userTools = files.map(f => ({
				filename: f,
				name: path.basename(f, path.extname(f))
			}));
		}

		// Add new tool button
		new Setting(containerEl)
			.setName('Add Custom Tool')
			.setDesc('Create a new custom tool definition or import from YAML file')
			.addButton(button => button
				.setButtonText('Add Tool')
				.setCta()
				.onClick(() => {
					new ToolEditorModal(this.app, this.plugin, null, () => {
						this.display(); // Refresh settings
					}).open();
				}))
			.addButton(button => button
				.setButtonText('Import Tool')
				.onClick(() => {
					this.importTool(userToolsDir);
				}));

		// List existing tools
		if (userTools.length > 0) {
			const toolsList = containerEl.createDiv({ cls: 'mcp-tools-list' });
			toolsList.createEl('h4', { text: 'Your Custom Tools' });

			for (const tool of userTools) {
				new Setting(toolsList)
					.setName(tool.name)
					.setDesc(`File: ${tool.filename}`)
					.addButton(button => button
						.setButtonText('Edit')
						.onClick(() => {
							new ToolEditorModal(this.app, this.plugin, tool.filename, () => {
								this.display(); // Refresh settings
							}).open();
						}))
					.addButton(button => button
						.setButtonText('Delete')
						.setWarning()
						.onClick(() => {
							const confirmed = confirm(`Are you sure you want to delete ${tool.name}?`);
							if (confirmed) {
								const filePath = path.join(userToolsDir, tool.filename);
								fs.unlinkSync(filePath);
								new Notice(`Tool ${tool.name} deleted`);
								this.plugin.toolRegistry.reload();
								this.display(); // Refresh settings
							}
						}));
			}
		} else {
			containerEl.createDiv().setText('No custom tools yet. Click "Add Tool" to create one.');
		}
	}

	/**
	 * Import a tool from a YAML file
	 */
	private async importTool(userToolsDir: string): Promise<void> {
		// Create file input element
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.yaml,.yml';

		input.onchange = async (e: Event) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			try {
				// Read file contents
				const content = await file.text();
				const toolDef: any = yaml.load(content);

				// Validate required fields
				if (!toolDef || typeof toolDef !== 'object') {
					new Notice('Invalid YAML file');
					return;
				}

				if (!toolDef.name || !toolDef.description || !toolDef.handler || !toolDef.inputSchema) {
					new Notice('Invalid tool definition - missing required fields (name, description, handler, inputSchema)');
					return;
				}

				// Ensure directory exists
				if (!fs.existsSync(userToolsDir)) {
					fs.mkdirSync(userToolsDir, { recursive: true });
				}

				// Check if tool already exists
				const filename = `${toolDef.name}.yaml`;
				const filePath = path.join(userToolsDir, filename);

				if (fs.existsSync(filePath)) {
					const overwrite = confirm(`Tool "${toolDef.name}" already exists. Overwrite?`);
					if (!overwrite) return;
				}

				// Save the tool
				fs.writeFileSync(filePath, yaml.dump(toolDef, { indent: 2 }));
				new Notice(`Tool "${toolDef.name}" imported successfully`);

				// Reload tool registry
				await this.plugin.toolRegistry.reload();

				// Refresh settings display
				this.display();
			} catch (error) {
				new Notice(`Failed to import tool: ${error.message}`);
				console.error('Error importing tool:', error);
			}
		};

		// Trigger file picker
		input.click();
	}
}

/**
 * Modal for adding/editing custom tools
 */
class ToolEditorModal extends Modal {
	plugin: MCPBridgePlugin;
	filename: string | null;
	onSave: () => void;
	toolData: any;

	constructor(app: App, plugin: MCPBridgePlugin, filename: string | null, onSave: () => void) {
		super(app);
		this.plugin = plugin;
		this.filename = filename;
		this.onSave = onSave;
		this.toolData = this.loadTool();
	}

	private loadTool(): any {
		if (!this.filename) {
			// New tool - return defaults
			return {
				name: '',
				description: '',
				handler: '',
				category: 'custom',
				tags: [],
				inputSchema: {
					type: 'object',
					properties: {},
					required: []
				},
				outputSchema: null
			};
		}

		// Load existing tool
		const userToolsDir = path.join(
			(this.app.vault.adapter as any).basePath,
			'.obsidian',
			'mcp-bridge',
			'tools'
		);
		const filePath = path.join(userToolsDir, this.filename);
		const content = fs.readFileSync(filePath, 'utf8');
		return yaml.load(content);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.filename ? 'Edit Tool' : 'Add New Tool' });

		// Tool Name
		new Setting(contentEl)
			.setName('Tool Name')
			.setDesc('Unique identifier for the tool (lowercase, underscores allowed)')
			.addText(text => text
				.setPlaceholder('my_custom_tool')
				.setValue(this.toolData.name)
				.onChange(value => {
					this.toolData.name = value;
				}));

		// Description
		new Setting(contentEl)
			.setName('Description')
			.setDesc('Clear description of what the tool does')
			.addTextArea(text => {
				text.setPlaceholder('Does something useful...')
					.setValue(this.toolData.description)
					.onChange(value => {
						this.toolData.description = value;
					});
				text.inputEl.rows = 3;
			});

		// Handler Path
		new Setting(contentEl)
			.setName('Handler Path')
			.setDesc('Path to the JavaScript handler file (can be vault-relative or absolute)')
			.addText(text => text
				.setPlaceholder('_kants/System/src/my_handler.js')
				.setValue(this.toolData.handler)
				.onChange(value => {
					this.toolData.handler = value;
				}));

		// Category
		new Setting(contentEl)
			.setName('Category')
			.setDesc('Tool category (e.g., custom, automation, helper)')
			.addText(text => text
				.setPlaceholder('custom')
				.setValue(this.toolData.category || 'custom')
				.onChange(value => {
					this.toolData.category = value;
				}));

		// Tags
		new Setting(contentEl)
			.setName('Tags')
			.setDesc('Comma-separated tags')
			.addText(text => text
				.setPlaceholder('automation, helper')
				.setValue((this.toolData.tags || []).join(', '))
				.onChange(value => {
					this.toolData.tags = value.split(',').map(t => t.trim()).filter(t => t);
				}));

		// Input Schema (YAML)
		new Setting(contentEl)
			.setName('Input Schema (YAML)')
			.setDesc('JSON Schema for tool inputs')
			.addTextArea(text => {
				text.setPlaceholder('type: object\nproperties:\n  input:\n    type: string')
					.setValue(yaml.dump(this.toolData.inputSchema))
					.onChange(value => {
						try {
							this.toolData.inputSchema = yaml.load(value);
						} catch (e) {
							// Invalid YAML, keep old value
						}
					});
				text.inputEl.rows = 8;
				text.inputEl.style.fontFamily = 'monospace';
			});

		// Output Schema (YAML, optional)
		new Setting(contentEl)
			.setName('Output Schema (YAML) - Optional')
			.setDesc('JSON Schema for tool outputs')
			.addTextArea(text => {
				text.setPlaceholder('type: object\nproperties:\n  result:\n    type: string')
					.setValue(this.toolData.outputSchema ? yaml.dump(this.toolData.outputSchema) : '')
					.onChange(value => {
						if (value.trim()) {
							try {
								this.toolData.outputSchema = yaml.load(value);
							} catch (e) {
								// Invalid YAML, keep old value
							}
						} else {
							this.toolData.outputSchema = null;
						}
					});
				text.inputEl.rows = 8;
				text.inputEl.style.fontFamily = 'monospace';
			});

		// Save/Cancel buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.marginTop = '20px';

		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.onclick = () => this.close();

		const saveButton = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveButton.onclick = () => this.saveTool();
	}

	private saveTool() {
		// Validate required fields
		if (!this.toolData.name) {
			new Notice('Tool name is required');
			return;
		}
		if (!this.toolData.description) {
			new Notice('Description is required');
			return;
		}
		if (!this.toolData.handler) {
			new Notice('Handler path is required');
			return;
		}

		const userToolsDir = path.join(
			(this.app.vault.adapter as any).basePath,
			'.obsidian',
			'mcp-bridge',
			'tools'
		);

		// Ensure directory exists
		if (!fs.existsSync(userToolsDir)) {
			fs.mkdirSync(userToolsDir, { recursive: true });
		}

		// Determine filename
		const filename = this.filename || `${this.toolData.name}.yaml`;
		const filePath = path.join(userToolsDir, filename);

		// Build final YAML structure
		const toolYaml: any = {
			name: this.toolData.name,
			description: this.toolData.description,
			handler: this.toolData.handler,
			category: this.toolData.category,
			inputSchema: this.toolData.inputSchema
		};

		if (this.toolData.tags && this.toolData.tags.length > 0) {
			toolYaml.tags = this.toolData.tags;
		}

		if (this.toolData.outputSchema) {
			toolYaml.outputSchema = this.toolData.outputSchema;
		}

		// Write to file
		try {
			fs.writeFileSync(filePath, yaml.dump(toolYaml, { indent: 2 }));
			new Notice(`Tool ${this.toolData.name} saved successfully`);

			// Reload tool registry
			this.plugin.toolRegistry.reload();

			this.onSave();
			this.close();
		} catch (error) {
			new Notice(`Failed to save tool: ${error.message}`);
			console.error('Error saving tool:', error);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
