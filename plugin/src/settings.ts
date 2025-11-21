import { App, PluginSettingTab, Setting } from 'obsidian';
import type MCPBridgePlugin from './main';
import { randomUUID } from 'crypto';

export interface MCPBridgeSettings {
	host: string;
	port: number;
	apiKey: string;
	requireAuth: boolean;
}

export const DEFAULT_SETTINGS: MCPBridgeSettings = {
	host: '127.0.0.1',
	port: 27125,
	apiKey: '',
	requireAuth: true,
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

		containerEl.createEl('h2', { text: 'MCP Bridge Settings (Minimal)' });
		containerEl.createEl('h3', { text: 'Connection Settings' });

		new Setting(containerEl)
			.setName('Host')
			.setDesc('127.0.0.1 for localhost only')
			.addText(text => text.setValue(this.plugin.settings.host)
				.onChange(async (value) => {
					this.plugin.settings.host = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Port')
			.setDesc('WebSocket server port')
			.addText(text => text.setValue(String(this.plugin.settings.port))
				.onChange(async (value) => {
					this.plugin.settings.port = parseInt(value) || 27125;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'Security Settings' });

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Required for all connections')
			.addText(text => {
				text.setValue(this.plugin.settings.apiKey);
				text.inputEl.type = 'password';
			})
			.addButton(button => button.setButtonText('Regenerate').onClick(async () => {
				this.plugin.settings.apiKey = randomUUID();
				await this.plugin.saveSettings();
				this.display();
			}))
			.addButton(button => button.setButtonText('Copy').onClick(() => {
				navigator.clipboard.writeText(this.plugin.settings.apiKey);
			}));

		new Setting(containerEl)
			.setName('Require Authentication')
			.addToggle(toggle => toggle.setValue(this.plugin.settings.requireAuth)
				.onChange(async (value) => {
					this.plugin.settings.requireAuth = value;
					await this.plugin.saveSettings();
				}));
	}
}
