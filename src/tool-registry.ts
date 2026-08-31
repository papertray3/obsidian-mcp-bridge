import { App, TFile, Vault, Notice } from 'obsidian';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

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
	_sourcePath?: string;  // Which search path this tool was discovered from (display label)
	_sourceDir?: string;   // Absolute directory containing this tool's YAML file (used to resolve a relative `handler` path)
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
			logger.debug('Tool registry already initialized, skipping');
			return;
		}

		logger.info('Initializing tool registry...');

		// Ensure directories exist
		await this.ensureDirectories();
		logger.debug('Directories ensured');

		// Load tools.yaml
		await this.loadConfig();
		logger.debug('Config loaded');

		// Load handlers
		await this.loadHandlers();
		logger.debug('Handlers loaded');

		// Generate MCP config
		await this.generateMCPConfig();
		logger.debug('MCP config generated');

		// Setup file watcher if auto_reload enabled
		if (this.config?.config.auto_reload) {
			this.setupFileWatcher();
		}

		this.initialized = true;
		logger.info(`Tool registry initialized with ${this.getAllTools().length} tools`);
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
				logger.debug(`Created directory: ${dir}`);
			}
		}
	}

	/**
	 * Load and parse configurations
	 */
	private async loadConfig(): Promise<void> {
		try {
			logger.info('Loading tool configurations...');

			// 1. Load plugin defaults (always present)
			const defaults = await this.loadYaml(this.defaultsPath);
			if (!defaults) {
				throw new Error('Plugin defaults not found - corrupted installation');
			}
			logger.debug(`Loaded ${defaults.tools.builtin?.length || 0} builtin tools from defaults`);

			// 2. Discover user-defined tools
			const userTools = await this.discoverUserTools();
			logger.debug(`Discovered ${userTools.length} user tools`);

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

			logger.info(`Tool registry loaded - ${this.getStats().total} total tools`);
		} catch (error) {
			logger.error('Failed to load configuration:', error);
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
			logger.error(`Failed to parse YAML file ${filePath}:`, error);
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
				logger.debug(`Tool search path does not exist: ${searchPath} (${absolutePath})`);
				continue;
			}

			// Check if it's a directory
			const stats = fs.statSync(absolutePath);
			if (!stats.isDirectory()) {
				logger.warn(`Tool search path is not a directory: ${searchPath}`);
				continue;
			}

			try {
				// Scan for .yaml files in directory
				const files = fs.readdirSync(absolutePath)
					.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

				logger.debug(`Searching ${searchPath} - found ${files.length} YAML files`);

				for (const file of files) {
					const filePath = path.join(absolutePath, file);
					const toolDef = await this.loadYaml(filePath);

					if (!toolDef) {
						logger.warn(`Failed to load user tool: ${file} from ${searchPath}`);
						continue;
					}

					// Validate required fields
					if (!toolDef.name || !toolDef.description || !toolDef.handler || !toolDef.inputSchema) {
						logger.warn(`Invalid tool definition in ${file} - missing required fields`);
						continue;
					}

					// Check for duplicate tool names across all search paths
					if (seenToolNames.has(toolDef.name)) {
						logger.warn(`Duplicate tool name "${toolDef.name}" found in ${searchPath}/${file} - skipping`);
						continue;
					}

					seenToolNames.add(toolDef.name);
					// Record where this definition came from: `_sourcePath` is a display label
					// (the configured search path, possibly relative); `_sourceDir` is the
					// resolved absolute directory, used to resolve a relative `handler` path.
					const toolWithSource = toolDef as ToolDefinition;
					toolWithSource._sourcePath = searchPath;
					toolWithSource._sourceDir = absolutePath;
					userTools.push(toolWithSource);
					logger.debug(`Discovered user tool: ${toolDef.name} from ${searchPath}/${file}`);
				}
			} catch (error) {
				logger.error(`Error discovering tools in ${searchPath}:`, error);
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
				this.loadUserHandler(tool);
			}
		}
	}

	/**
	 * Resolve and load a single user tool's handler script.
	 *
	 * Resolution rule (deliberately just one, not a list of guesses):
	 *   - An absolute `handler` path is used as-is.
	 *   - Otherwise it's resolved relative to the directory containing the tool's own
	 *     YAML file (`tool._sourceDir`, set by discoverUserTools()) - i.e. handler scripts
	 *     are expected to live alongside the YAML that references them.
	 */
	private loadUserHandler(tool: ToolDefinition): void {
		let resolved: string;
		if (path.isAbsolute(tool.handler)) {
			resolved = tool.handler;
		} else if (tool._sourceDir) {
			resolved = path.join(tool._sourceDir, tool.handler);
		} else {
			// Tools loaded via addTool() are always rediscovered (with _sourceDir set)
			// by the reload() at the end of that method, so this should be unreachable
			// in practice - but fail loudly rather than guessing at a location.
			logger.error(`Cannot resolve handler for "${tool.name}": no source directory known for handler "${tool.handler}"`);
			return;
		}

		try {
			if (!fs.existsSync(resolved)) {
				logger.warn(`Handler not found for "${tool.name}": ${resolved}`);
				return;
			}

			// Clear require cache to allow hot-reload
			try {
				delete require.cache[require.resolve(resolved)];
			} catch (_e) {}

			const handler = require(resolved);
			if (handler && typeof handler.execute === 'function') {
				this.handlers.set(tool.name, handler);
				logger.debug(`Loaded handler for "${tool.name}" from ${resolved}`);
			} else {
				logger.error(`Handler for "${tool.name}" at ${resolved} is missing an execute() function`);
			}
		} catch (err) {
			logger.error(`Failed to load handler for "${tool.name}" from ${resolved}:`, err);
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
						logger.info('Plugin defaults changed, reloading...');
						await this.reload();
					}
				});
			}

			// Watch vault config directory (user tools and overrides)
			if (fs.existsSync(this.vaultConfigDir)) {
				fs.watch(this.vaultConfigDir, { recursive: true }, async (eventType, filename) => {
					if (filename && (filename.endsWith('.yaml') || filename.endsWith('.js'))) {
						logger.info(`Vault config changed (${filename}), reloading...`);
						await this.reload();
					}
				});
			}

			logger.debug('File watcher active');
		} catch (error) {
			logger.error('Failed to setup file watcher:', error);
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
			logger.info('Tool registry reloaded successfully');
		} catch (error) {
			logger.error('Failed to reload:', error);
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

		logger.debug(`Generated MCP config at ${outputPath}`);
	}

	/**
	 * Get all tool definitions (cached for fast access)
	 */
	getAllTools(): ToolDefinition[] {
		if (!this.config) {
			logger.warn('getAllTools() called but config is null - registry may not be initialized');
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
			logger.error(`Error executing ${name}:`, error);
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
			logger.debug(`Created user tools directory: ${this.userToolsDir}`);
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
			logger.info(`Tool "${toolDefinition.name}" added successfully at ${filePath}`);

			// Reload tool registry to pick up the new tool
			await this.reload();
		} catch (error) {
			logger.error(`Failed to add tool "${toolDefinition.name}":`, error);
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
