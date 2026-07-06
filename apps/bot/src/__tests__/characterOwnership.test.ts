import { describe, expect, it, vi } from 'vitest';
import { resolveOwnedCharacter } from '../services/characterOwnership';

function makeAdapter(characters: Array<{ name: string; discordId: string | null }>) {
  return { getActiveRosterWithIds: vi.fn().mockResolvedValue({ characters }) };
}

describe('resolveOwnedCharacter', () => {
  it('auto-resolves when the user owns exactly one active character', async () => {
    const adapter = makeAdapter([
      { name: 'Alice', discordId: 'user-1' },
      { name: 'Marcus', discordId: 'user-2' },
    ]);

    const result = await resolveOwnedCharacter(adapter as never, 'user-1');
    expect(result).toEqual({ ok: true, characterName: 'Alice' });
  });

  it('errors when the user owns no active character', async () => {
    const adapter = makeAdapter([{ name: 'Marcus', discordId: 'user-2' }]);

    const result = await resolveOwnedCharacter(adapter as never, 'user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorMessage).toContain('No linked active character');
  });

  it('requires the character option when the user owns more than one', async () => {
    const adapter = makeAdapter([
      { name: 'Alice', discordId: 'user-1' },
      { name: 'Elena', discordId: 'user-1' },
    ]);

    const result = await resolveOwnedCharacter(adapter as never, 'user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorMessage).toContain('multiple linked characters');
  });

  it('resolves the requested character when specified and owned (case-insensitive)', async () => {
    const adapter = makeAdapter([
      { name: 'Alice', discordId: 'user-1' },
      { name: 'Elena', discordId: 'user-1' },
    ]);

    const result = await resolveOwnedCharacter(adapter as never, 'user-1', 'elena');
    expect(result).toEqual({ ok: true, characterName: 'Elena' });
  });

  it('rejects a requested character the user does not own', async () => {
    const adapter = makeAdapter([
      { name: 'Alice', discordId: 'user-1' },
      { name: 'Marcus', discordId: 'user-2' },
    ]);

    const result = await resolveOwnedCharacter(adapter as never, 'user-1', 'Marcus');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorMessage).toContain('"Marcus"');
  });
});
