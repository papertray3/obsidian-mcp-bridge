import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { App } from 'obsidian';
import { ToolRegistry, ToolDefinition } from './tool-registry';

const DEFAULTS_YAML = {
	version: '2.0',
	config: {
		auto_reload: false, // keep tests fast and avoid dangling fs.watch handles
		sandbox_user_scripts: true,
		enable_auto_generation: false,
	},
	tools: {
		builtin: [
			{
				name: 'ping',
				description: 'Test connectivity',
				handler: 'builtin',
				inputSchema: { type: 'object', properties: {} },
			},
			{
				name: 'search_files',
				description: 'Search for files',
				handler: 'builtin',
				inputSchema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
			},
		],
		user: [],
		auto: [],
	},
};

function makeFakeApp(vaultBasePath: string): App {
	return {
		vault: { adapter: { basePath: vaultBasePath } },
		workspace: {},
		metadataCache: {},
		fileManager: {},
		plugins: { plugins: {} },
	} as unknown as App;
}

function writeYaml(filePath: string, data: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, yaml.dump(data));
}

describe('ToolRegistry', () => {
	let pluginDir: string;
	let vaultBasePath: string;

	beforeEach(() => {
		pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-bridge-plugin-'));
		vaultBasePath = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-bridge-vault-'));
		writeYaml(path.join(pluginDir, 'mcp-bridge', 'defaults', 'tools.defaults.yaml'), DEFAULTS_YAML);
	});

	afterEach(() => {
		fs.rmSync(pluginDir, { recursive: true, force: true });
		fs.rmSync(vaultBasePath, { recursive: true, force: true });
	});

	describe('initialize', () => {
		it('loads builtin tools from defaults and reports stats', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			const stats = registry.getStats();
			expect(stats.total).toBe(2);
			expect(stats.builtin).toBe(2);
			expect(stats.user).toBe(0);
			expect(registry.getTool('ping')?.description).toBe('Test connectivity');
			expect(registry.getTool('does-not-exist')).toBeUndefined();
		});

		it('creates the vault config and user tools directories', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			expect(fs.existsSync(path.join(vaultBasePath, '.obsidian', 'mcp-bridge'))).toBe(true);
			expect(fs.existsSync(path.join(vaultBasePath, '.obsidian', 'mcp-bridge', 'tools'))).toBe(true);
		});

		it('is idempotent - a second call is a no-op', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();
			await registry.initialize();

			expect(registry.getStats().total).toBe(2);
		});

		it('throws if plugin defaults are missing', async () => {
			fs.rmSync(path.join(pluginDir, 'mcp-bridge', 'defaults', 'tools.defaults.yaml'));
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);

			await expect(registry.initialize()).rejects.toThrow('Plugin defaults not found');
		});

		it('rejects a user tool whose name collides with a builtin tool', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			writeYaml(path.join(searchDir, 'ping.yaml'), {
				name: 'ping', // collides with the builtin "ping"
				description: 'A rogue duplicate',
				handler: 'user/rogue.js',
				inputSchema: { type: 'object', properties: {} },
			});

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);

			await expect(registry.initialize()).rejects.toThrow('Duplicate tool name: ping');
		});
	});

	describe('discoverUserTools', () => {
		it('discovers valid user tools from a configured search path', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			writeYaml(path.join(searchDir, 'count_notes.yaml'), {
				name: 'count_notes',
				description: 'Count total notes in vault',
				handler: 'user/count_notes.js',
				inputSchema: { type: 'object', properties: {} },
			});

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			expect(registry.getStats().user).toBe(1);
			expect(registry.getTool('count_notes')?.handler).toBe('user/count_notes.js');
		});

		it('skips a user tool definition missing required fields', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			writeYaml(path.join(searchDir, 'broken.yaml'), {
				name: 'broken_tool',
				// missing description/handler/inputSchema
			});

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			expect(registry.getTool('broken_tool')).toBeUndefined();
			expect(registry.getStats().user).toBe(0);
		});

		it('skips a duplicate user tool name found in a later file', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			const toolDef = {
				name: 'dupe_tool',
				description: 'First one wins',
				handler: 'user/dupe.js',
				inputSchema: { type: 'object', properties: {} },
			};
			writeYaml(path.join(searchDir, 'a_dupe.yaml'), toolDef);
			writeYaml(path.join(searchDir, 'b_dupe.yaml'), { ...toolDef, description: 'Second one loses' });

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await registry.initialize();

			expect(registry.getStats().user).toBe(1);
			expect(registry.getTool('dupe_tool')?.description).toBe('First one wins');
		});

		it('ignores a search path that does not exist', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['nonexistent-path']);
			await registry.initialize();

			expect(registry.getStats().user).toBe(0);
		});

		it('tolerates malformed YAML without throwing', async () => {
			const searchDir = path.join(vaultBasePath, 'custom-tools');
			fs.mkdirSync(searchDir, { recursive: true });
			fs.writeFileSync(path.join(searchDir, 'malformed.yaml'), '{ not: valid: yaml: [');

			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, ['custom-tools']);
			await expect(registry.initialize()).resolves.not.toThrow();
			expect(registry.getStats().user).toBe(0);
		});
	});

	describe('addTool', () => {
		// addTool() always writes into `.obsidian/mcp-bridge/tools` (userToolsDir), but
		// discovery only rediscovers tools from `toolSearchPaths` - they're only the same
		// tools by convention (DEFAULT_SETTINGS.toolSearchPaths includes this path), so the
		// registry must be configured with that search path for a written tool to reappear.
		const userToolsSearchPath = ['.obsidian/mcp-bridge/tools'];

		it('writes a new tool definition and makes it available after reload', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, userToolsSearchPath);
			await registry.initialize();

			const newTool: ToolDefinition = {
				name: 'new_tool',
				description: 'Added at runtime',
				handler: 'user/new_tool.js',
				inputSchema: { type: 'object', properties: {} },
			};
			await registry.addTool(newTool);

			expect(registry.getTool('new_tool')).toBeDefined();
			const written = fs.readFileSync(
				path.join(vaultBasePath, '.obsidian', 'mcp-bridge', 'tools', 'new_tool.yaml'),
				'utf8'
			);
			expect(written).toContain('name: new_tool');
		});

		it('refuses to overwrite an existing tool without the overwrite option', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, userToolsSearchPath);
			await registry.initialize();

			const tool: ToolDefinition = {
				name: 'dup',
				description: 'first',
				handler: 'user/dup.js',
				inputSchema: { type: 'object', properties: {} },
			};
			await registry.addTool(tool);

			await expect(registry.addTool({ ...tool, description: 'second' })).rejects.toThrow('already exists');
		});
	});

	describe('executeTool', () => {
		it('runs a loaded user handler and returns its result', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			const toolDef: ToolDefinition = {
				name: 'echo',
				description: 'Echoes params back',
				handler: 'user/echo.js',
				inputSchema: { type: 'object', properties: {} },
			};
			// Inject directly rather than round-tripping through the filesystem/require cache.
			(registry as any).config.tools.user.push(toolDef);
			(registry as any).cachedAllTools = [];
			(registry as any).handlers.set('echo', {
				execute: async (params: any, context: any) => ({
					echoed: params,
					hasApp: context.app !== undefined,
				}),
			});

			const result = await registry.executeTool('echo', { hello: 'world' });
			expect(result).toEqual({ echoed: { hello: 'world' }, hasApp: true });
		});

		it('throws for an unknown tool name', async () => {
			const registry = new ToolRegistry(makeFakeApp(vaultBasePath), pluginDir, []);
			await registry.initialize();

			await expect(registry.executeTool('nope', {})).rejects.toThrow('Tool not found: nope');
		});
	});
});
