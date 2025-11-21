import { TFile } from 'obsidian';
import type MCPBridgePlugin from '../main';

/**
 * Get raw markdown content (no rendering)
 */
export async function getRawNote(plugin: MCPBridgePlugin, filepath: string): Promise<string> {
	const file = plugin.app.vault.getAbstractFileByPath(filepath);

	if (!file) {
		throw new Error(`File not found: ${filepath}`);
	}

	if (!(file instanceof TFile)) {
		throw new Error(`Not a file: ${filepath}`);
	}

	return await plugin.app.vault.read(file);
}
