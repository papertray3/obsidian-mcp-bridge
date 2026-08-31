import Ajv, { ValidateFunction } from 'ajv';
import { logger } from '../logger';

/**
 * Enforces each tool's `inputSchema` (from its YAML definition) as the single
 * real source of truth for what params it accepts, instead of that schema
 * being purely descriptive metadata shown to AI clients while hand-written
 * TS parameter types (see builtin-tools.ts) separately - and silently -
 * encode the actual contract. Call assertValidParams() once, at the single
 * point every tool call passes through (main.ts's handleRequest), and both
 * builtin and user-defined tools get the same enforcement for free.
 */

const ajv = new Ajv({ allErrors: true, strict: false });
const compiledCache = new WeakMap<object, ValidateFunction>();

export class ParamsValidationError extends Error {
	constructor(toolName: string, public readonly issues: string[]) {
		super(`Invalid params for tool "${toolName}": ${issues.join('; ')}`);
		this.name = 'ParamsValidationError';
	}
}

/**
 * Throws ParamsValidationError if `params` doesn't satisfy `inputSchema`.
 * A malformed schema itself is logged and skipped (not blocking) rather than
 * thrown - a broken schema shouldn't take down an otherwise-working tool.
 */
export function assertValidParams(toolName: string, inputSchema: object, params: unknown): void {
	let validate = compiledCache.get(inputSchema);

	if (!validate) {
		try {
			validate = ajv.compile(inputSchema);
		} catch (err) {
			logger.warn(`Tool "${toolName}" has an invalid inputSchema - skipping param validation:`, err);
			return;
		}
		compiledCache.set(inputSchema, validate);
	}

	if (!validate(params)) {
		const issues = (validate.errors ?? []).map(e => `${e.instancePath || '(root)'} ${e.message}`);
		throw new ParamsValidationError(toolName, issues);
	}
}
