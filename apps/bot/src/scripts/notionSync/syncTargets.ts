export interface SyncTargetResolutionInput {
  notionToken?: string;
  webWriteToken?: string;
  syncToNotion?: boolean;
  syncToWiki?: boolean;
}

export interface SyncTargetResolution {
  notionEnabled: boolean;
  wikiEnabled: boolean;
  warnings: string[];
}

/**
 * Determine which downstream targets should run for this sync invocation.
 * Defaults keep current behavior: both targets are requested, gated by token presence.
 */
export function resolveSyncTargets(input: SyncTargetResolutionInput): SyncTargetResolution {
  const requestedNotion = input.syncToNotion ?? true;
  const requestedWiki = input.syncToWiki ?? true;
  const notionToken = (input.notionToken ?? '').trim();
  const wikiToken = (input.webWriteToken ?? '').trim();

  const notionEnabled = requestedNotion && notionToken.length > 0;
  const wikiEnabled = requestedWiki && wikiToken.length > 0;

  const warnings: string[] = [];
  if (requestedNotion && !notionToken) {
    warnings.push('NOTION_TOKEN not set — Notion target disabled.');
  }
  if (requestedWiki && !wikiToken) {
    warnings.push('WEB_APP_API_WRITE_TOKEN not set — Wiki target disabled.');
  }

  return { notionEnabled, wikiEnabled, warnings };
}
