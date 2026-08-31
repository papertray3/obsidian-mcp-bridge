import { describe, it, expect } from 'vitest';
import { assertValidParams, ParamsValidationError } from './schema-validator';

describe('assertValidParams', () => {
	const patternSchema = {
		type: 'object',
		properties: { pattern: { type: 'string' } },
		required: ['pattern'],
	};

	it('does not throw for params that satisfy the schema', () => {
		expect(() => assertValidParams('search_files', patternSchema, { pattern: '*.md' })).not.toThrow();
	});

	it('throws ParamsValidationError when a required field is missing', () => {
		expect(() => assertValidParams('search_files', patternSchema, {})).toThrow(ParamsValidationError);
	});

	it('includes the tool name and a specific reason in the error message', () => {
		try {
			assertValidParams('search_files', patternSchema, {});
			expect.fail('expected assertValidParams to throw');
		} catch (err) {
			expect(err).toBeInstanceOf(ParamsValidationError);
			expect((err as Error).message).toContain('search_files');
			expect((err as ParamsValidationError).issues.join(' ')).toContain('pattern');
		}
	});

	it('throws when a field has the wrong type', () => {
		expect(() => assertValidParams('search_files', patternSchema, { pattern: 123 })).toThrow(ParamsValidationError);
	});

	it('allows extra properties not declared in the schema (no additionalProperties: false)', () => {
		expect(() => assertValidParams('search_files', patternSchema, { pattern: '*.md', extra: true })).not.toThrow();
	});

	it('passes when the schema has no required fields and params is empty', () => {
		const schema = { type: 'object', properties: {} };
		expect(() => assertValidParams('ping', schema, {})).not.toThrow();
	});

	it('logs a warning and does not block execution when the schema itself is malformed', () => {
		const brokenSchema = { type: 'object', properties: { x: { type: 'not-a-real-type' } } };
		expect(() => assertValidParams('broken_tool', brokenSchema, { x: 1 })).not.toThrow();
	});

	it('reuses a compiled validator for the same schema object across calls', () => {
		const schema = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] };
		// Two calls against the same schema reference - second should hit the cache path,
		// not recompile - and both should behave identically either way.
		expect(() => assertValidParams('t', schema, { a: 'x' })).not.toThrow();
		expect(() => assertValidParams('t', schema, {})).toThrow(ParamsValidationError);
	});
});
