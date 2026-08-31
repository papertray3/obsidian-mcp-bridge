import * as yaml from 'js-yaml';
import * as fs from 'fs';
import { logger } from '../logger';

/**
 * Load and parse a YAML file. Returns null (never throws) if the file is
 * missing or fails to parse - callers decide whether that's fatal.
 */
export function loadYamlFile(filePath: string): unknown | null {
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
