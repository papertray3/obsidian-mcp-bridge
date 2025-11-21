import { App, TFile, Vault, Notice } from 'obsidian';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tool definition from YAML
 */
export interface ToolDefinition {
	name: string;
	description: string;
	handler: string;  // "builtin" or path to script (e.g., "user/my_tool.js")
	category?: string;
	tags?: string[];
	inputSchema: {
		type: string;
		properties: Record<string, any>;
		required?: string[];
	};
	outputSchema?: {
		type: string;
		properties: Record<string, any>;
	};
}

/**
 * Tools YAML structure
 */
export interface ToolsConfig {
	version: string;
	config: {
		auto_reload: boolean;
		sandbox_user_scripts: boolean;
		enable_auto_generation: boolean;
	};
	tools: {
		builtin: ToolDefinition[];
		user: ToolDefinition[];
		auto: ToolDefinition[];
	};
}

/**
 * Handler context provided to user scripts
 */
export interface HandlerContext {
	app: App;
	vault: Vault;
	workspace: any;
	metadataCache: any;
	fileManager: any;
	plugins: Record<string, any>;
}

/**
 * Handler execution result
 */
export interface HandlerResult {
	[key: string]: any;
}

/**
 * Tool Registry - Manages tool definitions and handlers
 */
export class ToolRegistry {
	private app: App;
	private configPath: string;
	private handlersPath: string;
	private generatedPath: string;
	private config: ToolsConfig | null = null;
	private handlers: Map<string, any> = new Map();
	private fileWatcher: any = null;

	constructor(app: App, pluginDir: string) {
		this.app = app;
		this.configPath = path.join(pluginDir, '.mcp-bridge', 'tools.yaml');
		this.handlersPath = path.join(pluginDir, '.mcp-bridge', 'handlers');
		this.generatedPath = path.join(pluginDir, '.mcp-bridge', 'generated');
	}

	/**
	 * Initialize the registry
	 */
	async initialize(): Promise<void> {
		console.log('MCP Bridge: Initializing tool registry...');

		// Ensure directories exist
		await this.ensureDirectories();

		// Load tools.yaml
		await this.loadConfig();

		// Load handlers
		await this.loadHandlers();

		// Generate MCP config
		await this.generateMCPConfig();

		// Setup file watcher if auto_reload enabled
		if (this.config?.config.auto_reload) {
			this.setupFileWatcher();
		}

		console.log(`MCP Bridge: Tool registry initialized with ${this.getAllTools().length} tools`);
	}

	/**
	 * Ensure required directories exist
	 */
	private async ensureDirectories(): Promise<void> {
		const dirs = [
			path.join(this.handlersPath, 'core'),
			path.join(this.handlersPath, 'user'),
			this.generatedPath
		];

		for (const dir of dirs) {
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
		}
	}

	/**
	 * Load and parse tools.yaml
	 */
	private async loadConfig(): Promise<void> {
		try {
			if (!fs.existsSync(this.configPath)) {
				throw new Error(`tools.yaml not found at ${this.configPath}`);
			}

			const content = fs.readFileSync(this.configPath, 'utf8');
			this.config = yaml.load(content) as ToolsConfig;

			// Validate config
			this.validateConfig();

			console.log('MCP Bridge: tools.yaml loaded successfully');
		} catch (error) {
			console.error('MCP Bridge: Failed to load tools.yaml:', error);
			new Notice('MCP Bridge: Failed to load tools.yaml - see console for details', 5000);
			throw error;
		}
	}

	/**
	 * Validate tools configuration
	 */
	private validateConfig(): void {
		if (!this.config) {
			throw new Error('Config is null');
		}

		// Check version
		if (!this.config.version) {
			throw new Error('tools.yaml missing version field');
		}

		// Check required sections
		if (!this.config.tools) {
			throw new Error('tools.yaml missing tools section');
		}

		// Validate each tool
		const allTools = [
			...(this.config.tools.builtin || []),
			...(this.config.tools.user || []),
			...(this.config.tools.auto || [])
		];

		const seen = new Set<string>();
		for (const tool of allTools) {
			// Check required fields
			if (!tool.name) {
				throw new Error('Tool missing name field');
			}
			if (!tool.description) {
				throw new Error(`Tool ${tool.name} missing description`);
			}
			if (!tool.handler) {
				throw new Error(`Tool ${tool.name} missing handler`);
			}
			if (!tool.inputSchema) {
				throw new Error(`Tool ${tool.name} missing inputSchema`);
			}

			// Check for duplicates
			if (seen.has(tool.name)) {
				throw new Error(`Duplicate tool name: ${tool.name}`);
			}
			seen.add(tool.name);
		}
	}

	/**
	 * Load handler scripts
	 */
	private async loadHandlers(): Promise<void> {
		if (!this.config) return;

		const allTools = [
			...(this.config.tools.builtin || []),
			...(this.config.tools.user || []),
			...(this.config.tools.auto || [])
		];

		for (const tool of allTools) {
			if (tool.handler === 'builtin') {
				// Built-in handlers are in the plugin code
				this.handlers.set(tool.name, 'builtin');
			} else {
				// Load user script
				try {
					const handlerPath = path.join(this.handlersPath, tool.handler);
					if (fs.existsSync(handlerPath)) {
						// Clear require cache to allow hot-reload
						delete require.cache[require.resolve(handlerPath)];
						const handler = require(handlerPath);
						this.handlers.set(tool.name, handler);
						console.log(`MCP Bridge: Loaded handler for ${tool.name}`);
					} else {
						console.warn(`MCP Bridge: Handler not found for ${tool.name}: ${handlerPath}`);
					}
				} catch (error) {
					console.error(`MCP Bridge: Failed to load handler for ${tool.name}:`, error);
				}
			}
		}
	}

	/**
	 * Setup file watcher for hot-reload
	 */
	private setupFileWatcher(): void {
		try {
			// Watch tools.yaml
			fs.watch(this.configPath, async (eventType) => {
				if (eventType === 'change') {
					console.log('MCP Bridge: tools.yaml changed, reloading...');
					await this.reload();
				}
			});

			// Watch handlers directory
			fs.watch(this.handlersPath, { recursive: true }, async (eventType, filename) => {
				if (filename && (filename.endsWith('.js') || filename.endsWith('.ts'))) {
					console.log(`MCP Bridge: Handler ${filename} changed, reloading...`);
					await this.reload();
				}
			});

			console.log('MCP Bridge: File watcher active');
		} catch (error) {
			console.error('MCP Bridge: Failed to setup file watcher:', error);
		}
	}

	/**
	 * Reload configuration and handlers
	 */
	async reload(): Promise<void> {
		try {
			await this.loadConfig();
			await this.loadHandlers();
			await this.generateMCPConfig();
			new Notice('MCP Bridge: Tool registry reloaded');
			console.log('MCP Bridge: Tool registry reloaded successfully');
		} catch (error) {
			console.error('MCP Bridge: Failed to reload:', error);
			new Notice('MCP Bridge: Failed to reload - see console for details', 5000);
		}
	}

	/**
	 * Generate MCP server configuration
	 */
	private async generateMCPConfig(): Promise<void> {
		if (!this.config) return;

		const allTools = this.getAllTools();

		// Convert to MCP format
		const mcpConfig = {
			version: this.config.version,
			tools: allTools.map(tool => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
				...(tool.outputSchema && { outputSchema: tool.outputSchema }),
				...(tool.category && { category: tool.category }),
				...(tool.tags && { tags: tool.tags })
			}))
		};

		// Write to generated/mcp-config.json
		const outputPath = path.join(this.generatedPath, 'mcp-config.json');
		fs.writeFileSync(outputPath, JSON.stringify(mcpConfig, null, 2));

		console.log(`MCP Bridge: Generated MCP config at ${outputPath}`);
	}

	/**
	 * Get all tool definitions
	 */
	getAllTools(): ToolDefinition[] {
		if (!this.config) return [];

		return [
			...(this.config.tools.builtin || []),
			...(this.config.tools.user || []),
			...(this.config.tools.auto || [])
		];
	}

	/**
	 * Get tool by name
	 */
	getTool(name: string): ToolDefinition | undefined {
		return this.getAllTools().find(t => t.name === name);
	}

	/**
	 * Execute a tool
	 */
	async executeTool(name: string, params: any): Promise<HandlerResult> {
		const tool = this.getTool(name);
		if (!tool) {
			throw new Error(`Tool not found: ${name}`);
		}

		const handler = this.handlers.get(name);
		if (!handler) {
			throw new Error(`Handler not loaded for tool: ${name}`);
		}

		// If builtin, it will be handled by the plugin's handleRequest method
		if (handler === 'builtin') {
			throw new Error(`Builtin tool ${name} should be handled by plugin`);
		}

		// Execute user handler
		const context = this.createContext();

		try {
			if (typeof handler.execute !== 'function') {
				throw new Error(`Handler for ${name} missing execute function`);
			}

			const result = await handler.execute(params, context);
			return result;
		} catch (error) {
			console.error(`MCP Bridge: Error executing ${name}:`, error);
			throw error;
		}
	}

	/**
	 * Create handler context
	 */
	private createContext(): HandlerContext {
		return {
			app: this.app,
			vault: this.app.vault,
			workspace: this.app.workspace,
			metadataCache: this.app.metadataCache,
			fileManager: this.app.fileManager,
			plugins: this.getPluginAPIs()
		};
	}

	/**
	 * Get available plugin APIs
	 */
	private getPluginAPIs(): Record<string, any> {
		const plugins: Record<string, any> = {};

		// @ts-ignore - accessing internal plugin registry
		const pluginRegistry = this.app.plugins?.plugins || {};

		// Expose common plugins
		const exposedPlugins = [
			'dataview',
			'metadata-menu',
			'smart-connections',
			'digital-garden',
			'templater'
		];

		for (const pluginId of exposedPlugins) {
			if (pluginRegistry[pluginId]) {
				plugins[pluginId] = pluginRegistry[pluginId];
			}
		}

		return plugins;
	}

	/**
	 * Get tool statistics
	 */
	getStats(): any {
		if (!this.config) {
			return { total: 0, builtin: 0, user: 0, auto: 0 };
		}

		return {
			total: this.getAllTools().length,
			builtin: (this.config.tools.builtin || []).length,
			user: (this.config.tools.user || []).length,
			auto: (this.config.tools.auto || []).length
		};
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		// Stop file watcher
		if (this.fileWatcher) {
			this.fileWatcher.close();
		}
	}
}
