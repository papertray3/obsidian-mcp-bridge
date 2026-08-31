import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts'],
		setupFiles: ['src/test/setup.ts'],
	},
	resolve: {
		alias: {
			// The real 'obsidian' package has no runtime JS (types only) -
			// see src/test/mocks/obsidian.ts for why this is safe.
			obsidian: path.resolve(__dirname, 'src/test/mocks/obsidian.ts'),
		},
	},
});
