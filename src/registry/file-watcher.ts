import chokidar, { FSWatcher } from 'chokidar';
import { logger } from '../logger';

/**
 * Watches the plugin defaults file and the vault config directory for
 * changes that should trigger a tool registry reload, debounced so a burst
 * of writes (e.g. an editor doing several saves) only triggers one reload.
 *
 * Replaces a previous implementation built on Node's native `fs.watch()`,
 * which is platform-dependent, can silently miss rapid changes, and doesn't
 * debounce - see docs/development/eval-20260831.md for the original findings.
 */
export class ToolFileWatcher {
	private watcher: FSWatcher | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly debounceMs: number;
	private readyPromise: Promise<void> | null = null;

	constructor(debounceMs = 300) {
		this.debounceMs = debounceMs;
	}

	/** Resolves once the initial directory scan completes (mainly useful in tests). */
	async ready(): Promise<void> {
		await this.readyPromise;
	}

	/**
	 * Start watching. `paths` are watched recursively; only changes to
	 * `.yaml`/`.yml`/`.js` files trigger `onChange` (chokidar's own add/change/
	 * unlink events on those extensions - other file types are ignored).
	 */
	start(paths: string[], onChange: () => void | Promise<void>): void {
		this.stop();

		this.watcher = chokidar.watch(paths, {
			ignoreInitial: true,
			persistent: true,
			awaitWriteFinish: {
				stabilityThreshold: 100,
				pollInterval: 50
			}
		});

		this.readyPromise = new Promise((resolve) => this.watcher!.once('ready', resolve));

		const scheduleReload = (changedPath: string) => {
			if (!/\.(ya?ml|js)$/i.test(changedPath)) return;

			logger.info(`Tool file changed (${changedPath}), reloading...`);
			if (this.debounceTimer) clearTimeout(this.debounceTimer);
			this.debounceTimer = setTimeout(() => {
				this.debounceTimer = null;
				void onChange();
			}, this.debounceMs);
		};

		this.watcher
			.on('add', scheduleReload)
			.on('change', scheduleReload)
			.on('unlink', scheduleReload)
			.on('error', (error) => logger.error('File watcher error:', error));

		logger.debug(`File watcher active for: ${paths.join(', ')}`);
	}

	async stop(): Promise<void> {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		if (this.watcher) {
			await this.watcher.close();
			this.watcher = null;
		}
	}
}
