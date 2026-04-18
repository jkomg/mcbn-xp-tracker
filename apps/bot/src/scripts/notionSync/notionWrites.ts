import type { Client as NotionClient } from '@notionhq/client';

export const SOURCE_TAG = 'discord-sync';

type SleepFn = (ms: number) => Promise<void>;
type LogFn = (message: string) => void;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function notionCall<T>(
  fn: () => Promise<T>,
  opts: {
    sleepFn?: SleepFn;
    log?: LogFn;
  } = {},
): Promise<T> {
  const sleepFn = opts.sleepFn ?? sleep;
  const log = opts.log ?? console.log;

  await sleepFn(350);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'notionhq_client_request_timeout' || code === 'notionhq_client_response_error') {
        if (attempt < 2) {
          const retryDelayMs = (attempt + 1) * 2000;
          log(`  [retry] Notion timeout/error, waiting ${(attempt + 1) * 2}s…`);
          await sleepFn(retryDelayMs);
          continue;
        }
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export async function appendBodyBlocks(
  notion: NotionClient,
  pageId: string,
  blocks: object[],
  call: <T>(fn: () => Promise<T>) => Promise<T> = notionCall,
): Promise<void> {
  for (const chunk of chunks(blocks, 100)) {
    await call(() =>
      notion.blocks.children.append({
        block_id: pageId,
        children: chunk as Parameters<typeof notion.blocks.children.append>[0]['children'],
      }),
    );
  }
}

export function getPageTitle(properties: Record<string, unknown>): string {
  for (const val of Object.values(properties)) {
    const v = val as { type?: string; title?: { plain_text: string }[] };
    if (v.type === 'title' && Array.isArray(v.title)) {
      return v.title.map((t) => t.plain_text).join('') || '(untitled)';
    }
  }
  return '(untitled)';
}

export async function cleanupPreImportEntries(
  notion: NotionClient,
  opts: {
    databaseIds: Record<string, string>;
    dryRun: boolean;
    call?: <T>(fn: () => Promise<T>) => Promise<T>;
    log?: LogFn;
    sourceTag?: string;
  },
): Promise<void> {
  const call = opts.call ?? notionCall;
  const log = opts.log ?? console.log;
  const sourceTag = opts.sourceTag ?? SOURCE_TAG;

  log('\n[cleanup] Archiving pre-import entries from all databases…');
  for (const [dbName, dbId] of Object.entries(opts.databaseIds)) {
    let cursor: string | undefined;
    let removed = 0;
    let kept = 0;
    for (;;) {
      const result = await call(() =>
        notion.databases.query({
          database_id: dbId,
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      );
      for (const page of result.results) {
        if (page.object !== 'page' || !('properties' in page)) continue;
        const props = page.properties as Record<string, unknown>;
        const source = (props.Source as { select?: { name: string } } | undefined)?.select?.name;
        if (source === sourceTag) {
          kept++;
        } else {
          const title = getPageTitle(props);
          log(`  [${dbName}] archive: "${title}"`);
          if (!opts.dryRun) {
            await call(() => notion.pages.update({ page_id: page.id, archived: true }));
          }
          removed++;
        }
      }
      if (!result.has_more) break;
      cursor = result.next_cursor ?? undefined;
    }
    log(`  [${dbName}] kept: ${kept}, archived: ${removed}${opts.dryRun ? ' (dry-run)' : ''}`);
  }
}
