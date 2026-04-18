import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bot docs command semantics parity', () => {
  it('documents portal-first semantics for xp submit/claim/spend commands', () => {
    const docsPath = path.resolve(__dirname, '../../../../docs/BOT.md');
    const botDocs = fs.readFileSync(docsPath, 'utf8');

    expect(botDocs).toContain('| `/xp submit` | Players | Redirect to the web player portal claim flow |');
    expect(botDocs).toContain('| `/xp claim` | Players | Redirect to the web player portal claim flow |');
    expect(botDocs).toContain('| `/xp spend` | Players | Redirect to the web player portal spend flow |');
  });
});
