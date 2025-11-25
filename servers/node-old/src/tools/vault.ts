/**
 * Vault tools - File listing, raw content, search
 */

import type { ObsidianWebSocketClient } from '../websocket-client.js';

export async function handleListVaultFiles(
  client: ObsidianWebSocketClient,
  args: Record<string, unknown>
): Promise<string> {
  const folder = (args.folder as string) || '';
  const result = await client.call('list_vault_files', { folder });
  return JSON.stringify(result, null, 2);
}

export async function handleGetNoteRaw(
  client: ObsidianWebSocketClient,
  args: Record<string, unknown>
): Promise<string> {
  const filepath = args.filepath as string;
  if (!filepath) {
    throw new Error('get_note_raw requires filepath');
  }
  const result = await client.call('get_note_raw', { filepath });
  return result as string;
}

export async function handleSearchVault(
  client: ObsidianWebSocketClient,
  args: Record<string, unknown>
): Promise<string> {
  const query = args.query as string;
  if (!query) {
    throw new Error('search_vault requires query');
  }
  const folder = (args.folder as string) || '';
  const result = await client.call('search_vault', { query, folder });
  return JSON.stringify(result, null, 2);
}

export const vaultToolDefinitions = [
  {
    name: 'list_vault_files',
    description: 'List all markdown files in vault or specific folder',
    inputSchema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description: 'Optional: folder to list files from (relative to vault root)'
        }
      },
      required: []
    }
  },
  {
    name: 'get_note_raw',
    description: 'Get raw markdown content of a note (no rendering)',
    inputSchema: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: 'Path to the note file (relative to vault root)'
        }
      },
      required: ['filepath']
    }
  },
  {
    name: 'search_vault',
    description: 'Search markdown filenames/paths for a query string',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term'
        },
        folder: {
          type: 'string',
          description: 'Optional folder to scope search within'
        }
      },
      required: ['query']
    }
  }
];
