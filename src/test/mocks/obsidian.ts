/**
 * Minimal runtime stand-in for the 'obsidian' package.
 *
 * The real 'obsidian' npm package ships type declarations only (its "main"
 * is empty - Obsidian injects the real implementation at plugin load time),
 * so it can't be resolved when tests run under Node/vitest. This mock
 * supplies just enough runtime surface for the classes our tests exercise
 * (currently: `Notice`, constructed for user-facing error toasts).
 *
 * Wired in via vitest.config.ts's `resolve.alias` - it only affects test
 * runs, not the real build (esbuild.config.mjs keeps 'obsidian' external so
 * Obsidian's own implementation is used at runtime in the app), and not
 * type-checking (tsc still resolves the real obsidian.d.ts from node_modules).
 */

export class Notice {
	constructor(_message: string, _timeout?: number) {}
}
