import { TFile, MarkdownView } from 'obsidian';
import type MCPBridgePlugin from '../main';

export async function renderNote(plugin: MCPBridgePlugin, filepath: string): Promise<string> {
	// Get the file
	const file = plugin.app.vault.getAbstractFileByPath(filepath);

	if (!file) {
		throw new Error(`File not found: ${filepath}`);
	}

	if (!(file instanceof TFile)) {
		throw new Error(`Not a file: ${filepath}`);
	}

	// Open in background leaf (not visible to user) and force preview mode
	const leaf = plugin.app.workspace.getLeaf(false);
	await leaf.setViewState({
		type: 'markdown',
		state: {
			file: filepath,
			mode: 'preview'
		},
		active: false
	});

	// Wait for plugins to render (Dataview, etc.)
	// Based on Digital Garden's approach: wait up to 2 seconds for Dataview
	await waitForRender(leaf, 2000);

	// Extract rendered HTML
	const view = leaf.view;
	if (!(view instanceof MarkdownView)) {
		leaf.detach();
		throw new Error('Failed to open markdown view');
	}

	const previewEl =
		view.previewMode?.containerEl ??
		(view.contentEl.querySelector('.markdown-reading-view') as HTMLElement | null) ??
		view.contentEl;
	const html = previewEl.innerHTML;

	// Cleanup - detach the leaf
	leaf.detach();

	return html;
}

/**
 * Wait for content to render, especially Dataview queries
 * Uses Digital Garden's strategy: check for Dataview indicators
 */
async function waitForRender(leaf: any, maxWaitMs: number): Promise<void> {
	const startTime = Date.now();
	const checkInterval = 100; // Check every 100ms

	while (Date.now() - startTime < maxWaitMs) {
		const view = leaf.view;
		if (view instanceof MarkdownView) {
			const contentEl =
				view.previewMode?.containerEl ??
				(view.contentEl.querySelector('.markdown-reading-view') as HTMLElement | null) ??
				view.contentEl;

			// Check if Dataview has rendered (look for data-tag-name attribute)
			const dataviewElements = contentEl.querySelectorAll('[data-tag-name]');

			// If Dataview elements exist and have content, we're done
			if (dataviewElements.length > 0) {
				// Give it a bit more time to fully render
				await sleep(500);
				return;
			}
		}

		await sleep(checkInterval);
	}

	// Max wait time reached - return what we have
	// This handles cases where there's no Dataview or it rendered quickly
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

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
