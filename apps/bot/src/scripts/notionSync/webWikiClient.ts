export interface WikiPageData {
  slug: string;
  title: string;
  body_markdown?: string;
  category?: string;
  cover_image_url?: string;
  published?: boolean;
}

export type CharacterStatus = 'active' | 'deceased' | 'retired';

interface WebWikiClientOptions {
  webBase: string;
  writeToken: string;
  dryRun: boolean;
  fetchFn?: typeof fetch;
  log?: (line: string) => void;
}

/**
 * Minimal wrapper around web wiki/status write endpoints so sync orchestration
 * stays focused on Discord/Notion data flow.
 */
export class WebWikiClient {
  private readonly webBase: string;
  private readonly writeToken: string;
  private readonly dryRun: boolean;
  private readonly fetchFn: typeof fetch;
  private readonly log: (line: string) => void;

  constructor(opts: WebWikiClientOptions) {
    this.webBase = opts.webBase.replace(/\/+$/, '');
    this.writeToken = opts.writeToken;
    this.dryRun = opts.dryRun;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.log = opts.log ?? ((line: string) => console.log(line));
  }

  async setCharacterStatus(characterName: string, status: CharacterStatus): Promise<void> {
    if (this.dryRun || !this.writeToken) return;
    try {
      const res = await this.fetchFn(`${this.webBase}/api/character/${encodeURIComponent(characterName)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.writeToken}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok && res.status !== 404) {
        this.log(`  [warn] Failed to set status for ${characterName}: ${res.status}`);
      }
    } catch (err) {
      this.log(`  [warn] wikiSetCharacterStatus error for ${characterName}: ${err}`);
    }
  }

  async upsertPage(data: WikiPageData): Promise<void> {
    if (this.dryRun || !this.writeToken) return;
    try {
      const res = await this.fetchFn(`${this.webBase}/api/wiki/page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.writeToken}` },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 423) {
        this.log(`  [wiki] "${data.slug}" is sync-locked — skipped upsert.`);
      } else if (!res.ok) {
        this.log(`  [wiki warn] upsert "${data.slug}" → HTTP ${res.status}`);
      }
    } catch (err) {
      this.log(`  [wiki warn] upsert "${data.slug}" failed: ${err}`);
    }
  }

  async deletePage(slug: string): Promise<void> {
    if (this.dryRun || !this.writeToken) {
      this.log(`  [wiki dry-run] would delete "${slug}"`);
      return;
    }
    try {
      const res = await this.fetchFn(`${this.webBase}/api/wiki/page/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.writeToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404) {
        this.log(`  [wiki] "${slug}" not found — already deleted or never created.`);
      } else if (res.status === 423) {
        this.log(`  [wiki] "${slug}" is sync-locked — skipped delete.`);
      } else if (!res.ok) {
        this.log(`  [wiki warn] delete "${slug}" → HTTP ${res.status}`);
      } else {
        this.log(`  [wiki] deleted "${slug}"`);
      }
    } catch (err) {
      this.log(`  [wiki warn] delete "${slug}" failed: ${err}`);
    }
  }
}
