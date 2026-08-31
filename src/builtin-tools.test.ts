import { describe, it, expect, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { BuiltinTools } from './builtin-tools';
import { createTestFile } from './test/helpers';
import type { MetadataExtractor } from './metadata-extractor';

function makeFakeApp(files: TFile[]) {
	const byPath = new Map(files.map(f => [f.path, f]));
	return {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (p: string) => byPath.get(p) ?? null,
			read: vi.fn(async (f: TFile) => `content of ${f.path}`),
		},
	} as unknown as App;
}

function makeFakeMetadataExtractor(overrides: Partial<MetadataExtractor> = {}): MetadataExtractor {
	return {
		extractNoteMetadata: vi.fn(async () => ({ frontmatter: {} })),
		getPaginatedLinks: vi.fn(async () => ({ outgoing: [], backlinks: [] })),
		resolveWikiLinks: vi.fn(async (links: string[]) => links.map(l => ({ link: l, resolved: null }))),
		...overrides,
	} as unknown as MetadataExtractor;
}

describe('BuiltinTools', () => {
	describe('search_files', () => {
		it('matches files against a glob pattern', async () => {
			const files = [createTestFile('Notes/a.md'), createTestFile('Notes/b.md'), createTestFile('Other/c.md')];
			const tools = new BuiltinTools(makeFakeApp(files), makeFakeMetadataExtractor());

			const result = await tools.execute('search_files', { pattern: 'Notes/*.md' });
			expect(result).toEqual({ pattern: 'Notes/*.md', matches: 2, files: ['Notes/a.md', 'Notes/b.md'] });
		});

		it('supports ** for recursive matches under a directory', async () => {
			// Note: this glob implementation's `**/` requires at least one path
			// separator, so it matches nested files but not a root-level 'a.md'
			// (unlike bash globstar semantics) - documenting actual behavior here.
			const files = [createTestFile('a/b/c.md'), createTestFile('a.md')];
			const tools = new BuiltinTools(makeFakeApp(files), makeFakeMetadataExtractor());

			const result: any = await tools.execute('search_files', { pattern: '**/*.md' });
			expect(result.files).toEqual(['a/b/c.md']);
		});
	});

	describe('get_note_raw', () => {
		it('returns file content when the file exists', async () => {
			const file = createTestFile('note.md');
			const tools = new BuiltinTools(makeFakeApp([file]), makeFakeMetadataExtractor());

			const result = await tools.execute('get_note_raw', { filepath: 'note.md' });
			expect(result).toBe('content of note.md');
		});

		it('throws when the file does not exist', async () => {
			const tools = new BuiltinTools(makeFakeApp([]), makeFakeMetadataExtractor());

			await expect(tools.execute('get_note_raw', { filepath: 'missing.md' })).rejects.toThrow('File not found: missing.md');
		});
	});

	describe('list_vault_files', () => {
		it('lists all markdown files with stats when no folder given', async () => {
			const files = [createTestFile('a.md', { size: 10 }), createTestFile('b.md', { size: 20 })];
			const tools = new BuiltinTools(makeFakeApp(files), makeFakeMetadataExtractor());

			const result: any = await tools.execute('list_vault_files', {});
			expect(result.count).toBe(2);
			expect(result.files[0]).toMatchObject({ path: 'a.md', stat: { size: 10 } });
		});

		it('filters by folder prefix when given', async () => {
			const files = [createTestFile('Notes/a.md'), createTestFile('Archive/b.md')];
			const tools = new BuiltinTools(makeFakeApp(files), makeFakeMetadataExtractor());

			const result: any = await tools.execute('list_vault_files', { folder: 'Notes' });
			expect(result.count).toBe(1);
			expect(result.files[0].path).toBe('Notes/a.md');
		});
	});

	describe('get_note_metadata / get_note_links', () => {
		it('delegates to MetadataExtractor.extractNoteMetadata for an existing file', async () => {
			const file = createTestFile('note.md');
			const extractNoteMetadata = vi.fn(async () => ({ frontmatter: { title: 'Hi' } }));
			const tools = new BuiltinTools(makeFakeApp([file]), makeFakeMetadataExtractor({ extractNoteMetadata: extractNoteMetadata as any }));

			const result = await tools.execute('get_note_metadata', { filepath: 'note.md' });
			expect(extractNoteMetadata).toHaveBeenCalledWith(file, expect.any(Object));
			expect(result).toEqual({ frontmatter: { title: 'Hi' } });
		});

		it('throws for get_note_links when the file does not exist', async () => {
			const tools = new BuiltinTools(makeFakeApp([]), makeFakeMetadataExtractor());
			await expect(tools.execute('get_note_links', { filepath: 'missing.md' })).rejects.toThrow('File not found: missing.md');
		});
	});

	describe('resolve_wiki_links', () => {
		it('resolves an array of links', async () => {
			const tools = new BuiltinTools(makeFakeApp([]), makeFakeMetadataExtractor());

			const result = await tools.execute('resolve_wiki_links', { links: ['a', 'b'] });
			expect(result).toEqual({
				count: 2,
				resolved: [
					{ link: 'a', resolved: null },
					{ link: 'b', resolved: null },
				],
			});
		});

		it('rejects a non-array links parameter', async () => {
			const tools = new BuiltinTools(makeFakeApp([]), makeFakeMetadataExtractor());
			await expect(tools.execute('resolve_wiki_links', { links: 'not-an-array' })).rejects.toThrow('links parameter must be an array');
		});
	});

	it('throws for an unknown method', async () => {
		const tools = new BuiltinTools(makeFakeApp([]), makeFakeMetadataExtractor());
		await expect(tools.execute('nonexistent_tool', {})).rejects.toThrow('Unknown builtin tool: nonexistent_tool');
	});
});
