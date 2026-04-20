import { describe, expect, it } from 'vitest';
import { resolveSyncTargets } from '../scripts/notionSync/syncTargets';

describe('resolveSyncTargets', () => {
  it('enables both targets by default when both tokens are present', () => {
    const result = resolveSyncTargets({
      notionToken: 'notion-token',
      webWriteToken: 'wiki-token',
    });

    expect(result.notionEnabled).toBe(true);
    expect(result.wikiEnabled).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('supports notion-only runs', () => {
    const result = resolveSyncTargets({
      notionToken: 'notion-token',
      webWriteToken: 'wiki-token',
      syncToNotion: true,
      syncToWiki: false,
    });

    expect(result.notionEnabled).toBe(true);
    expect(result.wikiEnabled).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('supports wiki-only runs', () => {
    const result = resolveSyncTargets({
      notionToken: 'notion-token',
      webWriteToken: 'wiki-token',
      syncToNotion: false,
      syncToWiki: true,
    });

    expect(result.notionEnabled).toBe(false);
    expect(result.wikiEnabled).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('warns when requested target token is missing', () => {
    const result = resolveSyncTargets({
      syncToNotion: true,
      syncToWiki: true,
    });

    expect(result.notionEnabled).toBe(false);
    expect(result.wikiEnabled).toBe(false);
    expect(result.warnings).toContain('NOTION_TOKEN not set — Notion target disabled.');
    expect(result.warnings).toContain('WEB_APP_API_WRITE_TOKEN not set — Wiki target disabled.');
  });

  it('does not warn for explicitly disabled targets', () => {
    const result = resolveSyncTargets({
      syncToNotion: false,
      syncToWiki: false,
    });

    expect(result.warnings).toEqual([]);
  });
});
