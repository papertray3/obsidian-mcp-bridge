import { logger } from '../logger';

// Keep test output focused on assertion failures, not the plugin's own
// info/debug logging (which the tests intentionally trigger via real code paths).
logger.setLevel('error');
