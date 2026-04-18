import type { Client as NotionClient } from '@notionhq/client';
import { describe, expect, it, vi } from 'vitest';
import {
  appendBodyBlocks,
  cleanupPreImportEntries,
  getPageTitle,
  notionCall,
} from '../scripts/notionSync/notionWrites';

describe('notionWrites helpers', () => {
  it('notionCall retries transient notion errors then succeeds', async () => {
    const sleepFn = vi.fn(async () => {});
    const log = vi.fn();
    let tries = 0;
    const fn = vi.fn(async () => {
      tries += 1;
      if (tries < 3) {
        const err = new Error('timeout') as Error & { code?: string };
        err.code = 'notionhq_client_request_timeout';
        throw err;
      }
      return 'ok';
    });

    const result = await notionCall(fn, { sleepFn, log });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenNthCalledWith(1, 350);
    expect(sleepFn).toHaveBeenNthCalledWith(2, 2000);
    expect(sleepFn).toHaveBeenNthCalledWith(3, 4000);
  });

  it('notionCall does not retry non-transient errors', async () => {
    const sleepFn = vi.fn(async () => {});
    const fn = vi.fn(async () => {
      throw new Error('boom');
    });

    await expect(notionCall(fn, { sleepFn, log: vi.fn() })).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledTimes(1);
  });

  it('appendBodyBlocks chunks writes in batches of 100', async () => {
    const append = vi.fn(async () => ({}));
    const notion = {
      blocks: { children: { append } },
    } as unknown as NotionClient;
    const blocks = Array.from({ length: 205 }, (_, i) => ({ object: 'block', id: `b-${i}` }));

    await appendBodyBlocks(notion, 'page-1', blocks, async (fn) => fn());

    expect(append).toHaveBeenCalledTimes(3);
    expect(append.mock.calls[0][0].children).toHaveLength(100);
    expect(append.mock.calls[1][0].children).toHaveLength(100);
    expect(append.mock.calls[2][0].children).toHaveLength(5);
  });

  it('getPageTitle extracts title from notion-like properties', () => {
    expect(getPageTitle({
      Name: {
        type: 'title',
        title: [{ plain_text: 'Alpha' }, { plain_text: ' Beta' }],
      },
    })).toBe('Alpha Beta');
    expect(getPageTitle({ Other: { type: 'rich_text', rich_text: [] } })).toBe('(untitled)');
  });

  it('cleanupPreImportEntries archives only non-sync pages', async () => {
    const query = vi.fn(async () => ({
      results: [
        {
          object: 'page',
          id: 'keep-1',
          properties: {
            Source: { select: { name: 'discord-sync' } },
            Name: { type: 'title', title: [{ plain_text: 'Keep' }] },
          },
        },
        {
          object: 'page',
          id: 'old-1',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Archive me' }] },
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    }));
    const update = vi.fn(async () => ({}));
    const notion = {
      databases: { query },
      pages: { update },
    } as unknown as NotionClient;
    const log = vi.fn();

    await cleanupPreImportEntries(notion, {
      databaseIds: { TEST_DB: 'db-1' },
      dryRun: false,
      call: async (fn) => fn(),
      log,
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ page_id: 'old-1', archived: true });
    expect(log).toHaveBeenCalledWith('  [TEST_DB] archive: "Archive me"');
  });

  it('cleanupPreImportEntries does not archive in dry-run mode', async () => {
    const notion = {
      databases: {
        query: vi.fn(async () => ({
          results: [
            {
              object: 'page',
              id: 'old-1',
              properties: {
                Name: { type: 'title', title: [{ plain_text: 'Archive me' }] },
              },
            },
          ],
          has_more: false,
          next_cursor: null,
        })),
      },
      pages: { update: vi.fn(async () => ({})) },
    } as unknown as NotionClient;

    await cleanupPreImportEntries(notion, {
      databaseIds: { TEST_DB: 'db-1' },
      dryRun: true,
      call: async (fn) => fn(),
      log: vi.fn(),
    });

    expect(notion.pages.update).not.toHaveBeenCalled();
  });
});
