import * as fs from 'fs';
import { logger } from '../logger';
import { ToolDefinition, ToolsConfig } from './types';

/**
 * Writes the MCP-facing config (name/description/schema only - no internal
 * `_sourcePath`/`_sourceDir` metadata) that MCP servers read to advertise tools.
 */
export function writeMcpConfig(config: ToolsConfig, allTools: ToolDefinition[], outputPath: string): void {
	const mcpConfig = {
		version: config.version,
		tools: allTools.map(tool => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema,
			...(tool.outputSchema && { outputSchema: tool.outputSchema }),
			...(tool.category && { category: tool.category }),
			...(tool.tags && { tags: tool.tags })
		}))
	};

	fs.writeFileSync(outputPath, JSON.stringify(mcpConfig, null, 2));
	logger.debug(`Generated MCP config at ${outputPath}`);
}
