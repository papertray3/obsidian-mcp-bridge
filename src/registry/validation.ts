import { ToolsConfig, getAllToolDefinitions } from './types';

/**
 * Validates a merged tools configuration. Throws on the first problem found.
 */
export function validateToolsConfig(config: ToolsConfig): void {
	if (!config.version) {
		throw new Error('tools.yaml missing version field');
	}

	if (!config.tools) {
		throw new Error('tools.yaml missing tools section');
	}

	const allTools = getAllToolDefinitions(config);

	const seen = new Set<string>();
	for (const tool of allTools) {
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

		if (seen.has(tool.name)) {
			throw new Error(`Duplicate tool name: ${tool.name}`);
		}
		seen.add(tool.name);
	}
}
