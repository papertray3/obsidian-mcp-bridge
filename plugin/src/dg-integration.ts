import { TFile, App } from 'obsidian';

/**
 * Digital Garden plugin interface (minimal typing for what we need)
 * We can't import the actual types since it's an external plugin
 */
interface DigitalGardenPlugin {
	settings?: any;
	publishModal?: {
		publisher?: any;
		close?: () => void;
	};
	// Constructor references (if exposed)
	Publisher?: any;
	GardenPageCompiler?: any;
}

interface PublishFileConstructor {
	new (params: {
		file: TFile;
		compiler: any;
		metadataCache: any;
		vault: any;
		settings: any;
	}): any;
}

/**
 * Result from Digital Garden compilation
 */
export interface DGCompiledResult {
	markdown: string;
	assets: {
		images: Array<{
			path: string;
			content: string;
		}>;
	};
}

/**
 * Error thrown when Digital Garden plugin is not available
 */
export class DigitalGardenNotAvailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DigitalGardenNotAvailableError';
	}
}

/**
 * Helper class to integrate with Digital Garden plugin
 */
export class DigitalGardenIntegration {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Check if Digital Garden plugin is available and enabled
	 */
	isAvailable(): boolean {
		const dgPlugin = this.getDigitalGardenPlugin();
		// Plugin just needs to be installed and enabled
		// We don't require publisher to be configured (GitHub credentials, etc.)
		return dgPlugin !== null;
	}

	/**
	 * Initialize Digital Garden by triggering the Publication Center command
	 * This creates the publishModal and publisher objects needed for compilation
	 */
	private async initializeDigitalGarden(): Promise<void> {
		try {
			console.log('MCP Bridge: Initializing Digital Garden compiler...');

			// Execute the "Open Publication Center" command
			// This triggers DG to create its publishModal and publisher
			await (this.app as any).commands.executeCommandById('digitalgarden:dg-open-publish-modal');

			// Give DG a moment to initialize
			await new Promise(resolve => setTimeout(resolve, 100));

			// Close the modal (we don't need to show it to the user)
			const dgPlugin = this.getDigitalGardenPlugin();
			if (dgPlugin?.publishModal) {
				const modal = dgPlugin.publishModal as any;

				// Try different close methods
				if (typeof modal.close === 'function') {
					modal.close();
				} else if (modal.modal && typeof modal.modal.close === 'function') {
					modal.modal.close();
				} else {
					// Fallback: click close button
					const modals = (this.app.workspace as any).modalContainers || [];
					for (const container of modals) {
						if (container.win && container.win.document) {
							const closeBtn = container.win.document.querySelector('.modal-close-button');
							if (closeBtn) {
								(closeBtn as HTMLElement).click();
								break;
							}
						}
					}
				}
			}

			console.log('MCP Bridge: Digital Garden compiler initialized successfully');
		} catch (error) {
			console.error('MCP Bridge: Failed to initialize DG:', error);
		}
	}

	/**
	 * Get Digital Garden plugin instance
	 */
	private getDigitalGardenPlugin(): DigitalGardenPlugin | null {
		// Access installed plugins
		// @ts-ignore - accessing internal API
		const plugins = this.app.plugins?.plugins;

		if (!plugins) {
			return null;
		}

		const dgPlugin = plugins['digitalgarden'] as DigitalGardenPlugin;
		return dgPlugin || null;
	}

	/**
	 * Get PublishFile class from Digital Garden
	 * We need to access it dynamically since it's an external plugin
	 */
	private getPublishFileClass(): PublishFileConstructor | null {
		const dgPlugin = this.getDigitalGardenPlugin();
		if (!dgPlugin) {
			return null;
		}

		// Try to get PublishFile from the plugin's exports
		// This is a bit hacky but necessary since we can't import it directly
		// @ts-ignore
		const PublishFile = window.DigitalGardenPublishFile;

		if (PublishFile) {
			return PublishFile as PublishFileConstructor;
		}

		// If not available in window, we'll create a minimal wrapper ourselves
		return null;
	}

	/**
	 * Compile a file using Digital Garden's compiler
	 * Returns the compiled markdown and assets
	 *
	 * IMPORTANT: This compiles ANY file, regardless of dg-publish frontmatter.
	 * We bypass Publisher.shouldPublish() and call the compiler directly.
	 * This allows rendering notes for preview/reading without publishing them.
	 */
	async compileFile(file: TFile): Promise<DGCompiledResult> {
		const dgPlugin = this.getDigitalGardenPlugin();

		if (!dgPlugin) {
			throw new DigitalGardenNotAvailableError(
				'Digital Garden plugin is not available or not properly initialized'
			);
		}

		// If publisher not initialized, try to trigger DG initialization
		if (!dgPlugin.publishModal?.publisher) {
			await this.initializeDigitalGarden();

			// Check again after initialization attempt
			if (!dgPlugin.publishModal?.publisher) {
				console.warn('MCP Bridge: DG publisher still not available after initialization');
			}
		}

		// Get settings
		const settings = dgPlugin.settings;
		if (!settings) {
			throw new DigitalGardenNotAvailableError(
				'Digital Garden plugin settings not available. The plugin may not be fully loaded.'
			);
		}

		const vault = this.app.vault;
		const metadataCache = this.app.metadataCache;

		// Try to access Publisher constructor from the publishModal
		let Publisher: any;
		let GardenPageCompiler: any;

		// Option 1: Get from publishModal if it exists
		if (dgPlugin.publishModal?.publisher) {
			const publisherInstance = dgPlugin.publishModal.publisher;
			const compiler = publisherInstance.compiler;
			if (compiler) {
				try {
					return await this.compileWithCompiler(file, compiler, vault, metadataCache, settings);
				} catch (error) {
					console.error('MCP Bridge: Compilation failed:', error);
					// Fall through to try other options
				}
			}
		}

		// Option 2: Try to get constructors from plugin
		// @ts-ignore
		Publisher = dgPlugin.Publisher || (dgPlugin as any).constructor?.Publisher;
		// @ts-ignore
		GardenPageCompiler = dgPlugin.GardenPageCompiler || (dgPlugin as any).constructor?.GardenPageCompiler;

		// Option 3: Access via module/require (if DG exports them)
		// Note: This usually doesn't work in Obsidian, but try anyway
		if (!Publisher) {
			try {
				// @ts-ignore
				const dgModule = window.require?.('digitalgarden');
				if (dgModule) {
					Publisher = dgModule.Publisher;
					GardenPageCompiler = dgModule.GardenPageCompiler;
				}
			} catch (e) {
				// Require failed - this is expected, Obsidian plugins aren't requireable
				// Continue to next check
			}
		}

		if (!Publisher && !GardenPageCompiler) {
			throw new DigitalGardenNotAvailableError(
				'Cannot access Digital Garden compiler classes. The Digital Garden plugin may need to be opened or configured before its compiler becomes available. Try opening a note and using the Digital Garden "Publish Single Note" command, then retry.'
			);
		}

		// Create publisher and compiler
		try {
			const mockGetFiles = async () => ({ notes: [], images: [] });

			if (Publisher) {
				const publisher = new Publisher(vault, metadataCache, settings);
				const compiler = publisher.compiler;
				return await this.compileWithCompiler(file, compiler, vault, metadataCache, settings);
			} else if (GardenPageCompiler) {
				const compiler = new GardenPageCompiler(vault, settings, metadataCache, mockGetFiles);
				return await this.compileWithCompiler(file, compiler, vault, metadataCache, settings);
			}

			throw new DigitalGardenNotAvailableError(
				'Could not instantiate Digital Garden compiler'
			);
		} catch (error) {
			throw new DigitalGardenNotAvailableError(
				`Failed to create Digital Garden compiler: ${error.message}`
			);
		}
	}

	/**
	 * Compile file using a compiler instance
	 */
	private async compileWithCompiler(
		file: TFile,
		compiler: any,
		vault: any,
		metadataCache: any,
		settings: any
	): Promise<DGCompiledResult> {

		// Try to get PublishFile class
		const PublishFileClass = this.getPublishFileClass();
		let publishFile: any;

		if (PublishFileClass) {
			// Use the actual PublishFile class
			publishFile = new PublishFileClass({
				file,
				compiler,
				metadataCache,
				vault,
				settings
			});
		} else {
			// Create a minimal wrapper that the compiler can work with
			publishFile = {
				file,
				getPath: () => file.path,
				cachedRead: () => vault.cachedRead(file),
				getMetadata: () => metadataCache.getCache(file.path) ?? {},
				getBlock: (blockId: string) => {
					const metadata = metadataCache.getCache(file.path);
					return metadata?.blocks?.[blockId];
				},
				getFrontmatter: () => {
					const metadata = metadataCache.getCache(file.path);
					return metadata?.frontmatter ?? {};
				},
				getCompiledFrontmatter: () => {
					// This is more complex - would need FrontmatterCompiler
					// For now, return empty string and rely on DG's implementation
					return '';
				}
			};
		}

		// Call the compiler
		try {
			const result = await compiler.generateMarkdown(publishFile);

			// Handle different return formats
			let markdown: string;
			let assets: any;

			if (Array.isArray(result)) {
				[markdown, assets] = result;
			} else if (typeof result === 'string') {
				markdown = result;
				assets = { images: [] };
			} else {
				markdown = result?.markdown || result?.content || '';
				assets = result?.assets || { images: [] };
			}

			return {
				markdown,
				assets: assets || { images: [] }
			};
		} catch (error) {
			console.error('MCP Bridge: Digital Garden compilation error:', error);
			throw new Error(`Failed to compile file with Digital Garden: ${error.message}`);
		}
	}

	/**
	 * Get a user-friendly error message for when DG is not available
	 */
	getNotAvailableMessage(): string {
		const dgPlugin = this.getDigitalGardenPlugin();

		if (!dgPlugin) {
			return 'Digital Garden plugin is not installed or not enabled. Please install and enable the Digital Garden plugin to use this feature.';
		}

		if (!dgPlugin.settings) {
			return 'Digital Garden plugin is installed but not properly configured. Please configure the Digital Garden plugin settings.';
		}

		return 'Digital Garden plugin is not available for an unknown reason.';
	}
}
