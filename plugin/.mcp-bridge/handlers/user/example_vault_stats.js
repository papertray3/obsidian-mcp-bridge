/**
 * Example user handler: Get vault statistics
 *
 * This demonstrates how to create a custom tool handler.
 * To enable this tool, uncomment the corresponding section in tools.yaml
 */

module.exports = {
	/**
	 * Execute the vault statistics tool
	 *
	 * @param {Object} params - Parameters from inputSchema
	 * @param {Object} context - Handler context with Obsidian APIs
	 * @returns {Promise<Object>} - Tool result
	 */
	async execute(params, context) {
		const { includeArchived = false } = params;
		const { vault, metadataCache } = context;

		// Get all markdown files
		const files = vault.getMarkdownFiles();

		let totalNotes = 0;
		let totalWords = 0;
		let totalLinks = 0;
		let totalTags = new Set();

		for (const file of files) {
			// Skip archived if needed
			if (!includeArchived && file.path.includes('Archive')) {
				continue;
			}

			totalNotes++;

			// Read content
			const content = await vault.read(file);
			const words = content.split(/\s+/).filter(w => w.length > 0);
			totalWords += words.length;

			// Get metadata
			const cache = metadataCache.getFileCache(file);
			if (cache) {
				// Count links
				totalLinks += (cache.links || []).length;

				// Collect tags
				(cache.tags || []).forEach(tag => totalTags.add(tag.tag));
			}
		}

		return {
			totalNotes: totalNotes,
			totalWords: totalWords,
			averageWordsPerNote: totalNotes > 0 ? Math.round(totalWords / totalNotes) : 0,
			totalLinks: totalLinks,
			uniqueTags: totalTags.size,
			tags: Array.from(totalTags).sort()
		};
	}
};
