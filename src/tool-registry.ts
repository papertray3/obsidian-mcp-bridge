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
	// Internal metadata (not part of YAML definition)
	_sourcePath?: string;  // Which search path this tool was discovered from
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
	private pluginDir: string;
	private defaultsPath: string;
	private vaultConfigDir: string;
	private overridesPath: string;
	private userToolsDir: string;
	private generatedPath: string;
	private config: ToolsConfig | null = null;
	private handlers: Map<string, any> = new Map();
	private fileWatcher: any = null;
	private initialized: boolean = false;
	private cachedAllTools: ToolDefinition[] = [];
	private toolSearchPaths: string[];
	private vaultBasePath: string;

	constructor(app: App, pluginDir: string, toolSearchPaths: string[] = []) {
		this.app = app;
		this.pluginDir = pluginDir;
		this.vaultBasePath = (app.vault.adapter as any).basePath;
		this.toolSearchPaths = toolSearchPaths;

		// Plugin defaults (read-only, shipped with plugin)
		this.defaultsPath = path.join(pluginDir, 'mcp-bridge', 'defaults', 'tools.defaults.yaml');

		// Vault-level user config (preserved across updates)
		this.vaultConfigDir = path.join(this.vaultBasePath, '.obsidian', 'mcp-bridge');
		this.overridesPath = path.join(this.vaultConfigDir, 'overrides.yaml');
		this.userToolsDir = path.join(this.vaultConfigDir, 'tools');

		// Generated output (in plugin directory)
		this.generatedPath = path.join(pluginDir, 'mcp-bridge', 'generated');
	}

	/**
	 * Initialize the registry
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			console.log('MCP Bridge: Tool registry already initialized, skipping');
			return;
		}

		console.log('MCP Bridge: Initializing tool registry...');

		// Ensure directories exist
		await this.ensureDirectories();
		console.log('MCP Bridge: Directories ensured');

		// Load tools.yaml
		await this.loadConfig();
		console.log('MCP Bridge: Config loaded');

		// Load handlers
		await this.loadHandlers();
		console.log('MCP Bridge: Handlers loaded');

		// Generate MCP config
		await this.generateMCPConfig();
		console.log('MCP Bridge: MCP config generated');

		// Setup file watcher if auto_reload enabled
		if (this.config?.config.auto_reload) {
			this.setupFileWatcher();
		}

		this.initialized = true;
		console.log(`MCP Bridge: Tool registry initialized with ${this.getAllTools().length} tools`);
	}

	/**
	 * Ensure required directories exist
	 */
	private async ensureDirectories(): Promise<void> {
		const dirs = [
			this.generatedPath,           // Plugin generated files
			this.vaultConfigDir,          // Vault-level config directory
			this.userToolsDir             // User tools directory
		];

		for (const dir of dirs) {
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
				console.log(`MCP Bridge: Created directory: ${dir}`);
			}
		}
	}

	/**
	 * Load and parse configurations
	 */
	private async loadConfig(): Promise<void> {
		try {
			console.log('MCP Bridge: Loading tool configurations...');

			// 1. Load plugin defaults (always present)
			const defaults = await this.loadYaml(this.defaultsPath);
			if (!defaults) {
				throw new Error('Plugin defaults not found - corrupted installation');
			}
			console.log(`Loaded ${defaults.tools.builtin?.length || 0} builtin tools from defaults`);

			// 2. Discover user-defined tools
			const userTools = await this.discoverUserTools();
			console.log(`Discovered ${userTools.length} user tools`);

			// 3. Merge configurations
			this.config = {
				version: defaults.version,
				config: defaults.config,
				tools: {
					builtin: defaults.tools.builtin || [],
					user: userTools,
					auto: []   // Reserved for future use
				}
			};

			// 4. Validate final configuration
			this.validateConfig();

			console.log(`MCP Bridge: Tool registry loaded - ${this.getStats().total} total tools`);
		} catch (error) {
			console.error('MCP Bridge: Failed to load configuration:', error);
			new Notice('MCP Bridge: Failed to load tool configuration - see console for details', 5000);
			throw error;
		}
	}

	/**
	 * Load and parse a YAML file
	 */
	private async loadYaml(filePath: string): Promise<any> {
		if (!fs.existsSync(filePath)) {
			return null;
		}

		try {
			const content = fs.readFileSync(filePath, 'utf8');
			return yaml.load(content);
		} catch (error) {
			console.error(`Failed to parse YAML file ${filePath}:`, error);
			return null;
		}
	}

	/**
	 * Discover user-defined tools from all configured search paths
	 */
	private async discoverUserTools(): Promise<ToolDefinition[]> {
		const userTools: ToolDefinition[] = [];
		const seenToolNames = new Set<string>();

		// Search all configured paths
		for (const searchPath of this.toolSearchPaths) {
			// Resolve path relative to vault root
			const absolutePath = path.isAbsolute(searchPath)
				? searchPath
				: path.join(this.vaultBasePath, searchPath);

			// Check if directory exists
			if (!fs.existsSync(absolutePath)) {
				console.log(`MCP Bridge: Tool search path does not exist: ${searchPath} (${absolutePath})`);
				continue;
			}

			// Check if it's a directory
			const stats = fs.statSync(absolutePath);
			if (!stats.isDirectory()) {
				console.warn(`MCP Bridge: Tool search path is not a directory: ${searchPath}`);
				continue;
			}

			try {
				// Scan for .yaml files in directory
				const files = fs.readdirSync(absolutePath)
					.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

				console.log(`MCP Bridge: Searching ${searchPath} - found ${files.length} YAML files`);

				for (const file of files) {
					const filePath = path.join(absolutePath, file);
					const toolDef = await this.loadYaml(filePath);

					if (!toolDef) {
						console.warn(`MCP Bridge: Failed to load user tool: ${file} from ${searchPath}`);
						continue;
					}

					// Validate required fields
					if (!toolDef.name || !toolDef.description || !toolDef.handler || !toolDef.inputSchema) {
						console.warn(`MCP Bridge: Invalid tool definition in ${file} - missing required fields`);
						continue;
					}

					// Check for duplicate tool names across all search paths
					if (seenToolNames.has(toolDef.name)) {
						console.warn(`MCP Bridge: Duplicate tool name "${toolDef.name}" found in ${searchPath}/${file} - skipping`);
						continue;
					}

					seenToolNames.add(toolDef.name);
					// Add source path metadata for display purposes
					const toolWithSource = toolDef as ToolDefinition;
					toolWithSource._sourcePath = searchPath;
					userTools.push(toolWithSource);
					console.log(`MCP Bridge: Discovered user tool: ${toolDef.name} from ${searchPath}/${file}`);
				}
			} catch (error) {
				console.error(`MCP Bridge: Error discovering tools in ${searchPath}:`, error);
			}
		}

		return userTools;
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
				// User handler - resolve path relative to vault config directory
				try {
					// Try several candidate paths so handler definitions can be vault-relative,
					// plugin-relative, or absolute. This makes it easier to install handlers
					// via the KANTS installer (e.g. into `_kants/...`) or place them under
					// the vault config directory (`.obsidian/mcp-bridge`).
					const candidates: string[] = [];
					// If handler is absolute, try it first
					if (path.isAbsolute(tool.handler)) candidates.push(tool.handler);

					// Relative to vault config directory (.obsidian/mcp-bridge)
					candidates.push(path.join(this.vaultConfigDir, tool.handler));

					// Relative to vault root (e.g. _kants/...)
					try {
						const vaultBase = (this.app.vault.adapter as any).basePath;
						if (vaultBase) candidates.push(path.join(vaultBase, tool.handler));
					} catch (e) {
						// ignore
					}

					// Relative to plugin directory (for bundled handlers)
					candidates.push(path.join(this.pluginDir, tool.handler));

					// Also try common handler locations under the plugin/vault
					candidates.push(path.join(this.vaultConfigDir, 'handlers', 'user', tool.handler));
					candidates.push(path.join(this.pluginDir, '.mcp-bridge', 'handlers', 'user', tool.handler));

					let loaded = false;
					for (const candidate of candidates) {
						try {
							if (!candidate) continue;
							const resolved = path.resolve(candidate);
							if (!fs.existsSync(resolved)) continue;
							// Clear require cache to allow hot-reload
							try {
								delete require.cache[require.resolve(resolved)];
							} catch (_e) {}
							const handler = require(resolved);
							if (handler && typeof handler.execute === 'function') {
								this.handlers.set(tool.name, handler);
								console.log(`MCP Bridge: Loaded handler for user tool: ${tool.name} from ${resolved}`);
								loaded = true;
								break;
							} else {
								console.error(`MCP Bridge: Handler found at ${resolved} but missing execute() function`);
								loaded = true; // don't try other candidates for this one
								break;
							}
						} catch (err) {
							console.error(`MCP Bridge: Error loading handler candidate ${candidate} for ${tool.name}:`, err);
						}
					}

					if (!loaded) {
						console.warn(`MCP Bridge: Handler not found for ${tool.name}. Tried: ${candidates.join(', ')}`);
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
			// Watch plugin defaults
			if (fs.existsSync(this.defaultsPath)) {
				fs.watch(this.defaultsPath, async (eventType) => {
					if (eventType === 'change') {
						console.log('MCP Bridge: Plugin defaults changed, reloading...');
						await this.reload();
					}
				});
			}

			// Watch vault config directory (user tools and overrides)
			if (fs.existsSync(this.vaultConfigDir)) {
				fs.watch(this.vaultConfigDir, { recursive: true }, async (eventType, filename) => {
					if (filename && (filename.endsWith('.yaml') || filename.endsWith('.js'))) {
						console.log(`MCP Bridge: Vault config changed (${filename}), reloading...`);
						await this.reload();
					}
				});
			}

			console.log('MCP Bridge: File watcher active');
		} catch (error) {
			console.error('MCP Bridge: Failed to setup file watcher:', error);
		}
	}

	/**
	 * Update tool search paths and reload
	 */
	async updateSearchPaths(searchPaths: string[]): Promise<void> {
		this.toolSearchPaths = searchPaths;
		await this.reload();
	}

	/**
	 * Reload configuration and handlers
	 */
	async reload(): Promise<void> {
		try {
			await this.loadConfig();
			await this.loadHandlers();
			await this.generateMCPConfig();
			this.cachedAllTools = []; // Invalidate cache
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
	 * Get all tool definitions (cached for fast access)
	 */
	getAllTools(): ToolDefinition[] {
		if (!this.config) {
			console.warn('MCP Bridge: getAllTools() called but config is null - registry may not be initialized');
			return [];
		}

		// Return cached version for speed
		if (this.cachedAllTools.length === 0 || !this.config) {
			this.cachedAllTools = [
				...(this.config.tools.builtin || []),
				...(this.config.tools.user || []),
				...(this.config.tools.auto || [])
			];
		}

		return this.cachedAllTools;
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
	 * Programmatically add a custom tool (for installation scripts, etc.)
	 * @param toolDefinition - Tool definition object
	 * @param options - Options for adding the tool
	 * @returns Promise that resolves when tool is added
	 */
	async addTool(toolDefinition: ToolDefinition, options?: { overwrite?: boolean }): Promise<void> {
		// Validate required fields
		if (!toolDefinition.name) {
			throw new Error('Tool definition missing required field: name');
		}
		if (!toolDefinition.description) {
			throw new Error('Tool definition missing required field: description');
		}
		if (!toolDefinition.handler) {
			throw new Error('Tool definition missing required field: handler');
		}
		if (!toolDefinition.inputSchema) {
			throw new Error('Tool definition missing required field: inputSchema');
		}

		// Ensure user tools directory exists
		if (!fs.existsSync(this.userToolsDir)) {
			fs.mkdirSync(this.userToolsDir, { recursive: true });
			console.log(`MCP Bridge: Created user tools directory: ${this.userToolsDir}`);
		}

		// Determine filename
		const filename = `${toolDefinition.name}.yaml`;
		const filePath = path.join(this.userToolsDir, filename);

		// Check if tool already exists
		if (fs.existsSync(filePath) && !options?.overwrite) {
			throw new Error(`Tool "${toolDefinition.name}" already exists. Use overwrite option to replace.`);
		}

		// Build YAML structure
		const toolYaml: any = {
			name: toolDefinition.name,
			description: toolDefinition.description,
			handler: toolDefinition.handler,
			inputSchema: toolDefinition.inputSchema
		};

		if (toolDefinition.category) {
			toolYaml.category = toolDefinition.category;
		}

		if (toolDefinition.tags && toolDefinition.tags.length > 0) {
			toolYaml.tags = toolDefinition.tags;
		}

		if (toolDefinition.outputSchema) {
			toolYaml.outputSchema = toolDefinition.outputSchema;
		}

		// Write to file
		try {
			fs.writeFileSync(filePath, yaml.dump(toolYaml, { indent: 2 }));
			console.log(`MCP Bridge: Tool "${toolDefinition.name}" added successfully at ${filePath}`);

			// Reload tool registry to pick up the new tool
			await this.reload();
		} catch (error) {
			console.error(`MCP Bridge: Failed to add tool "${toolDefinition.name}":`, error);
			throw error;
		}
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
