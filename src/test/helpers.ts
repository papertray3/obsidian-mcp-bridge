import { TFile } from 'obsidian';

/**
 * Builds a TFile test fixture.
 *
 * `TFile`'s real .d.ts type doesn't declare a constructor plugin code can
 * call directly (Obsidian instantiates it internally), so `new TFile(...)`
 * doesn't type-check even though our mock's runtime class (see
 * src/test/mocks/obsidian.ts) would happily accept it. Building via
 * `Object.create(TFile.prototype)` sidesteps the constructor entirely: the
 * result is still `instanceof TFile` (satisfying runtime checks in code
 * under test), while the `as TFile` cast satisfies the real declared type.
 */
export function createTestFile(path: string, stat: Partial<{ ctime: number; mtime: number; size: number }> = {}): TFile {
	const file = Object.create(TFile.prototype) as TFile;
	(file as any).path = path;
	const name = path.split('/').pop() ?? path;
	(file as any).name = name;
	const dot = name.lastIndexOf('.');
	(file as any).basename = dot === -1 ? name : name.slice(0, dot);
	(file as any).extension = dot === -1 ? '' : name.slice(dot + 1);
	(file as any).stat = { ctime: stat.ctime ?? 0, mtime: stat.mtime ?? 0, size: stat.size ?? 0 };
	return file;
}
