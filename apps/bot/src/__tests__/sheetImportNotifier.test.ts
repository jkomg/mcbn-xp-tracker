import { describe, expect, it } from 'vitest';
import { buildSheetImportEmbed } from '../services/sheetImportNotifier';
import type { PendingSheetImport } from '../services/adapter';

describe('sheet import notifier embed formatting', () => {
  it('includes the player mention and review link', () => {
    const draft: PendingSheetImport = {
      id: 'draft-1',
      character_name: 'Emmet Brown',
      player_discord_id: '123456789012345678',
      submitted_at_epoch: 1782951539,
    };

    const embed = buildSheetImportEmbed(draft, 'https://mcbn.example/cc-admin/sheet-imports/draft-1');
    const data = embed.data;

    expect(data.title).toBe('Sheet Import: Emmet Brown');
    expect(data.description).toContain('<@123456789012345678>');
    expect(data.description).toContain('https://mcbn.example/cc-admin/sheet-imports/draft-1');
  });

  it('falls back to (unnamed) when character_name is blank', () => {
    const draft: PendingSheetImport = {
      id: 'draft-2',
      character_name: '',
      player_discord_id: '123456789012345678',
      submitted_at_epoch: 1782951539,
    };

    const embed = buildSheetImportEmbed(draft, 'https://mcbn.example/cc-admin/sheet-imports/draft-2');
    expect(embed.data.title).toBe('Sheet Import: (unnamed)');
  });

  it('omits the player mention line when player_discord_id is blank', () => {
    const draft: PendingSheetImport = {
      id: 'draft-3',
      character_name: 'No Player',
      player_discord_id: '',
      submitted_at_epoch: 1782951539,
    };

    const embed = buildSheetImportEmbed(draft, 'https://mcbn.example/cc-admin/sheet-imports/draft-3');
    expect(embed.data.description).not.toContain('**Player:**');
  });
});
