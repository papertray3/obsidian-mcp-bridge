import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { loadYamlFile } from './yaml-loader';
import { ToolDefinition } from './types';

function isToolDefinitionShaped(value: unknown): value is ToolDefinition {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return Boolean(v.name && v.description && v.handler && v.inputSchema);
}

/**
 * Scan every configured search path for `.yaml`/`.yml` tool definitions (one
 * tool per file). Each discovered tool is tagged with where it came from:
 * `_sourcePath` (the configured search path, for display) and `_sourceDir`
 * (the resolved absolute directory, used later to resolve its `handler`).
 */
export async function discoverUserTools(toolSearchPaths: string[], vaultBasePath: string): Promise<ToolDefinition[]> {
	const userTools: ToolDefinition[] = [];
	const seenToolNames = new Set<string>();

	for (const searchPath of toolSearchPaths) {
		const absolutePath = path.isAbsolute(searchPath)
			? searchPath
			: path.join(vaultBasePath, searchPath);

		if (!fs.existsSync(absolutePath)) {
			logger.debug(`Tool search path does not exist: ${searchPath} (${absolutePath})`);
			continue;
		}

		const stats = fs.statSync(absolutePath);
		if (!stats.isDirectory()) {
			logger.warn(`Tool search path is not a directory: ${searchPath}`);
			continue;
		}

		try {
			const files = fs.readdirSync(absolutePath)
				.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

			logger.debug(`Searching ${searchPath} - found ${files.length} YAML files`);

			for (const file of files) {
				const filePath = path.join(absolutePath, file);
				const toolDef = loadYamlFile(filePath);

				if (!toolDef) {
					logger.warn(`Failed to load user tool: ${file} from ${searchPath}`);
					continue;
				}

				if (!isToolDefinitionShaped(toolDef)) {
					logger.warn(`Invalid tool definition in ${file} - missing required fields`);
					continue;
				}

				if (seenToolNames.has(toolDef.name)) {
					logger.warn(`Duplicate tool name "${toolDef.name}" found in ${searchPath}/${file} - skipping`);
					continue;
				}

				seenToolNames.add(toolDef.name);
				toolDef._sourcePath = searchPath;
				toolDef._sourceDir = absolutePath;
				userTools.push(toolDef);
				logger.debug(`Discovered user tool: ${toolDef.name} from ${searchPath}/${file}`);
			}
		} catch (error) {
			logger.error(`Error discovering tools in ${searchPath}:`, error);
		}
	}

	return userTools;
}
