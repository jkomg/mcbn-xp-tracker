import { describe, expect, it, vi } from 'vitest';
import { WebWikiClient } from '../scripts/notionSync/webWikiClient';

function response(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

describe('WebWikiClient', () => {
  it('upsertPage no-ops on dry-run', async () => {
    const fetchFn = vi.fn();
    const client = new WebWikiClient({
      webBase: 'https://example.test',
      writeToken: 'token',
      dryRun: true,
      fetchFn,
      log: vi.fn(),
    });

    await client.upsertPage({ slug: 'loc-test', title: 'Location Test' });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('upsertPage logs lock skips from 423', async () => {
    const fetchFn = vi.fn(async () => response(423));
    const log = vi.fn();
    const client = new WebWikiClient({
      webBase: 'https://example.test',
      writeToken: 'token',
      dryRun: false,
      fetchFn,
      log,
    });

    await client.upsertPage({ slug: 'loc-downtown', title: 'Downtown' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toBe('https://example.test/api/wiki/page');
    expect(log).toHaveBeenCalledWith('  [wiki] "loc-downtown" is sync-locked — skipped upsert.');
  });

  it('deletePage logs dry-run actions', async () => {
    const log = vi.fn();
    const client = new WebWikiClient({
      webBase: 'https://example.test',
      writeToken: 'token',
      dryRun: true,
      fetchFn: vi.fn(),
      log,
    });

    await client.deletePage('lore-night-12');

    expect(log).toHaveBeenCalledWith('  [wiki dry-run] would delete "lore-night-12"');
  });

  it('deletePage handles 404/423/200 statuses', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(423))
      .mockResolvedValueOnce(response(200));
    const log = vi.fn();
    const client = new WebWikiClient({
      webBase: 'https://example.test',
      writeToken: 'token',
      dryRun: false,
      fetchFn,
      log,
    });

    await client.deletePage('lore-a');
    await client.deletePage('lore-b');
    await client.deletePage('lore-c');

    expect(log).toHaveBeenNthCalledWith(1, '  [wiki] "lore-a" not found — already deleted or never created.');
    expect(log).toHaveBeenNthCalledWith(2, '  [wiki] "lore-b" is sync-locked — skipped delete.');
    expect(log).toHaveBeenNthCalledWith(3, '  [wiki] deleted "lore-c"');
  });

  it('setCharacterStatus warns on non-404 HTTP errors', async () => {
    const fetchFn = vi.fn(async () => response(500));
    const log = vi.fn();
    const client = new WebWikiClient({
      webBase: 'https://example.test',
      writeToken: 'token',
      dryRun: false,
      fetchFn,
      log,
    });

    await client.setCharacterStatus('Alice Voss', 'retired');

    expect(String(fetchFn.mock.calls[0][0])).toBe('https://example.test/api/character/Alice%20Voss/status');
    expect(log).toHaveBeenCalledWith('  [warn] Failed to set status for Alice Voss: 500');
  });

  it('setCharacterStatus logs fetch failures', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down');
    });
    const log = vi.fn();
    const client = new WebWikiClient({
      webBase: 'https://example.test',
      writeToken: 'token',
      dryRun: false,
      fetchFn,
      log,
    });

    await client.setCharacterStatus('Bob', 'retired');

    expect(log).toHaveBeenCalledWith('  [warn] wikiSetCharacterStatus error for Bob: Error: network down');
  });
});
