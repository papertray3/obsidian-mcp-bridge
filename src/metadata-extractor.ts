import { App, TFile, MetadataCache, Vault, CachedMetadata, HeadingCache, LinkCache, TagCache } from 'obsidian';

/**
 * Options for controlling what metadata to extract
 */
export interface MetadataOptions {
  includeLinks?: boolean;
  includeBacklinks?: boolean;
  maxLinks?: number;
  includeMetadata?: boolean;
  resolvePaths?: boolean;
}

/**
 * Information about a single link
 */
export interface LinkReference {
  link: string;           // Original link text (e.g., "My Note" from [[My Note]])
  displayText?: string;   // Display text if different from link
  resolvedPath?: string;  // Resolved file path if resolvePaths is true
  exists?: boolean;       // Whether the target file exists
}

/**
 * Link information for a note
 */
export interface LinkInfo {
  outgoing: LinkReference[];
  count: number;
  hasMore?: boolean;
  nextOffset?: number;
}

/**
 * Backlink information for a note
 */
export interface BacklinkInfo {
  incoming: LinkReference[];
  count: number;
  hasMore?: boolean;
  nextOffset?: number;
}

/**
 * Tag information for a note
 */
export interface TagInfo {
  frontmatter: string[];  // Tags from frontmatter
  inline: string[];       // Tags from content
  all: string[];          // All unique tags
}

/**
 * Complete structured metadata for a note
 */
export interface StructuredMetadata {
  filepath: string;
  exists: boolean;
  stat: {
    ctime: number;
    mtime: number;
    size: number;
  };
  frontmatter: Record<string, any>;
  tags: TagInfo;
  links?: LinkInfo;
  backlinks?: BacklinkInfo;
  headings: Array<{
    level: number;
    heading: string;
    position: { start: { line: number; col: number }; end: { line: number; col: number } };
  }>;
  wordCount: number;
}

/**
 * MetadataExtractor - Core class for extracting structured metadata from notes
 *
 * This class uses Obsidian's MetadataCache API to efficiently extract and structure
 * metadata from vault notes without manual parsing.
 */
export class MetadataExtractor {
  constructor(
    private app: App,
    private metadataCache: MetadataCache,
    private vault: Vault
  ) {}

  /**
   * Extract complete structured metadata for a note
   */
  async extractNoteMetadata(
    file: TFile,
    options: MetadataOptions = {}
  ): Promise<StructuredMetadata> {
    const cache = this.metadataCache.getFileCache(file);

    const metadata: StructuredMetadata = {
      filepath: file.path,
      exists: true,
      stat: {
        ctime: file.stat.ctime,
        mtime: file.stat.mtime,
        size: file.stat.size
      },
      frontmatter: this.extractFrontmatter(cache),
      tags: this.extractTags(cache),
      headings: this.extractHeadings(cache),
      wordCount: await this.countWords(file)
    };

    // Conditionally include links and backlinks
    if (options.includeLinks) {
      metadata.links = await this.extractLinks(file, cache, options);
    }

    if (options.includeBacklinks) {
      metadata.backlinks = await this.extractBacklinks(file, options);
    }

    return metadata;
  }

  /**
   * Extract frontmatter as a clean object
   */
  private extractFrontmatter(cache: CachedMetadata | null): Record<string, any> {
    if (!cache?.frontmatter) {
      return {};
    }

    // Clone frontmatter and remove Obsidian's internal properties
    const frontmatter = { ...cache.frontmatter };
    delete frontmatter.position;

    return frontmatter;
  }

  /**
   * Extract outgoing links with optional resolution
   */
  private async extractLinks(
    file: TFile,
    cache: CachedMetadata | null,
    options: MetadataOptions
  ): Promise<LinkInfo> {
    const links: LinkReference[] = [];

    if (cache?.links) {
      for (const linkCache of cache.links) {
        const linkRef: LinkReference = {
          link: linkCache.link,
          displayText: linkCache.displayText
        };

        // Resolve path if requested
        if (options.resolvePaths) {
          const targetFile = this.metadataCache.getFirstLinkpathDest(
            linkCache.link,
            file.path
          );

          if (targetFile) {
            linkRef.resolvedPath = targetFile.path;
            linkRef.exists = true;
          } else {
            linkRef.exists = false;
          }
        }

        links.push(linkRef);
      }
    }

    // Apply pagination if maxLinks is set
    const maxLinks = options.maxLinks || links.length;
    const hasMore = links.length > maxLinks;
    const paginatedLinks = links.slice(0, maxLinks);

    return {
      outgoing: paginatedLinks,
      count: links.length,
      hasMore,
      nextOffset: hasMore ? maxLinks : undefined
    };
  }

  /**
   * Extract backlinks with optional resolution
   */
  private async extractBacklinks(
    file: TFile,
    options: MetadataOptions
  ): Promise<BacklinkInfo> {
    const backlinks: LinkReference[] = [];

    // Find all files that link to this file
    const allFiles = this.vault.getMarkdownFiles();
    const targetPath = file.path;

    for (const sourceFile of allFiles) {
      if (sourceFile.path === targetPath) continue;

      const cache = this.metadataCache.getFileCache(sourceFile);
      if (!cache?.links) continue;

      for (const link of cache.links) {
        const resolvedFile = this.metadataCache.getFirstLinkpathDest(
          link.link,
          sourceFile.path
        );

        if (resolvedFile?.path === targetPath) {
          const linkRef: LinkReference = {
            link: sourceFile.path
          };

          if (options.resolvePaths) {
            linkRef.resolvedPath = sourceFile.path;
            linkRef.exists = true;
          }

          backlinks.push(linkRef);
          break; // Only add each source file once
        }
      }
    }

    // Apply pagination if maxLinks is set
    const maxLinks = options.maxLinks || backlinks.length;
    const hasMore = backlinks.length > maxLinks;
    const paginatedBacklinks = backlinks.slice(0, maxLinks);

    return {
      incoming: paginatedBacklinks,
      count: backlinks.length,
      hasMore,
      nextOffset: hasMore ? maxLinks : undefined
    };
  }

  /**
   * Extract all tags (frontmatter + inline)
   */
  private extractTags(cache: CachedMetadata | null): TagInfo {
    const frontmatterTags: string[] = [];
    const inlineTags: string[] = [];

    // Extract tags from frontmatter
    if (cache?.frontmatter?.tags) {
      const fmTags = cache.frontmatter.tags;
      if (Array.isArray(fmTags)) {
        frontmatterTags.push(...fmTags.map(t => String(t)));
      } else if (typeof fmTags === 'string') {
        frontmatterTags.push(fmTags);
      }
    }

    // Extract inline tags
    if (cache?.tags) {
      for (const tagCache of cache.tags) {
        inlineTags.push(tagCache.tag);
      }
    }

    // Combine and deduplicate
    const allTags = Array.from(new Set([...frontmatterTags, ...inlineTags]));

    return {
      frontmatter: frontmatterTags,
      inline: inlineTags,
      all: allTags
    };
  }

  /**
   * Extract headings with position information
   */
  private extractHeadings(cache: CachedMetadata | null) {
    if (!cache?.headings) {
      return [];
    }

    return cache.headings.map((h: HeadingCache) => ({
      level: h.level,
      heading: h.heading,
      position: h.position
    }));
  }

  /**
   * Count words in the note (excluding frontmatter)
   */
  private async countWords(file: TFile): Promise<number> {
    const content = await this.vault.read(file);

    // Remove frontmatter
    const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');

    // Remove markdown syntax and count words
    const plainText = withoutFrontmatter
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '')         // Remove inline code
      .replace(/!\[\[.*?\]\]/g, '')    // Remove image embeds
      .replace(/\[\[.*?\]\]/g, '')     // Remove wiki links
      .replace(/\[.*?\]\(.*?\)/g, '')  // Remove markdown links
      .replace(/[#*_~`]/g, '')         // Remove markdown formatting
      .trim();

    const words = plainText.split(/\s+/).filter(word => word.length > 0);
    return words.length;
  }

  /**
   * Resolve wiki links to file paths with alias support (batch operation)
   * Always searches both filenames and aliases for comprehensive link resolution
   */
  async resolveWikiLinks(
    links: string[],
    sourcePath: string = ''
  ): Promise<Array<{ link: string; resolvedPath?: string; exists: boolean; matchType?: string }>> {
    const results = [];

    for (const link of links) {
      // First try standard link resolution (filename match)
      let targetFile = this.metadataCache.getFirstLinkpathDest(link, sourcePath);
      let matchType = targetFile ? 'filename' : undefined;

      // If not found, search through all files' frontmatter for aliases
      if (!targetFile) {
        const allFiles = this.vault.getMarkdownFiles();
        for (const file of allFiles) {
          const cache = this.metadataCache.getFileCache(file);
          const frontmatter = cache?.frontmatter;
          
          if (frontmatter) {
            // Check if file has an alias matching the link
            const aliases = frontmatter.aliases || [];
            const aliasArray = typeof aliases === 'string' ? [aliases] : Array.isArray(aliases) ? aliases : [];
            
            if (aliasArray.some((a: string) => a.toLowerCase() === link.toLowerCase())) {
              targetFile = file;
              matchType = 'alias';
              break;
            }
          }
        }
      }

      results.push({
        link,
        resolvedPath: targetFile ? targetFile.path : undefined,
        exists: targetFile !== null,
        ...(matchType && { matchType })
      });
    }

    return results;
  }

  /**
   * Get paginated links (for get_note_links tool)
   */
  async getPaginatedLinks(
    file: TFile,
    options: {
      includeOutgoing?: boolean;
      includeBacklinks?: boolean;
      resolvePaths?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    outgoing?: LinkReference[];
    backlinks?: LinkReference[];
    total: { outgoing: number; backlinks: number };
    hasMore: boolean;
    nextOffset?: number;
  }> {
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const result: any = {
      total: { outgoing: 0, backlinks: 0 },
      hasMore: false
    };

    // Get outgoing links
    if (options.includeOutgoing !== false) {
      const cache = this.metadataCache.getFileCache(file);
      const allOutgoing: LinkReference[] = [];

      if (cache?.links) {
        for (const linkCache of cache.links) {
          const linkRef: LinkReference = {
            link: linkCache.link,
            displayText: linkCache.displayText
          };

          if (options.resolvePaths) {
            const targetFile = this.metadataCache.getFirstLinkpathDest(
              linkCache.link,
              file.path
            );
            linkRef.resolvedPath = targetFile?.path;
            linkRef.exists = targetFile !== null;
          }

          allOutgoing.push(linkRef);
        }
      }

      result.total.outgoing = allOutgoing.length;
      result.outgoing = allOutgoing.slice(offset, offset + limit);

      if (offset + limit < allOutgoing.length) {
        result.hasMore = true;
        result.nextOffset = offset + limit;
      }
    }

    // Get backlinks
    if (options.includeBacklinks !== false) {
      const allBacklinks: LinkReference[] = [];

      // Find all files that link to this file
      const allFiles = this.vault.getMarkdownFiles();
      const targetPath = file.path;

      for (const sourceFile of allFiles) {
        if (sourceFile.path === targetPath) continue;

        const cache = this.metadataCache.getFileCache(sourceFile);
        if (!cache?.links) continue;

        for (const link of cache.links) {
          const resolvedFile = this.metadataCache.getFirstLinkpathDest(
            link.link,
            sourceFile.path
          );

          if (resolvedFile?.path === targetPath) {
            const linkRef: LinkReference = {
              link: sourceFile.path
            };

            if (options.resolvePaths) {
              linkRef.resolvedPath = sourceFile.path;
              linkRef.exists = true;
            }

            allBacklinks.push(linkRef);
            break; // Only add each source file once
          }
        }
      }

      result.total.backlinks = allBacklinks.length;
      result.backlinks = allBacklinks.slice(offset, offset + limit);

      if (offset + limit < allBacklinks.length) {
        result.hasMore = true;
        result.nextOffset = offset + limit;
      }
    }

    return result;
  }
}
