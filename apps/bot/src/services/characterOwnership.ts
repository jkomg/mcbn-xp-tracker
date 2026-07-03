import type { TrackerAdapter } from './adapter';

export type OwnershipResult =
  | { ok: true; characterName: string }
  | { ok: false; errorMessage: string };

/**
 * Resolves which of a Discord user's own active characters is posting.
 * Mirrors the character-option pattern already used by /lasombra blank —
 * an optional `character` option disambiguates when a player has more than
 * one linked character, rather than a follow-up select-menu interaction.
 */
export async function resolveOwnedCharacter(
  adapter: TrackerAdapter,
  discordUserId: string,
  requestedCharacter?: string | null,
): Promise<OwnershipResult> {
  const roster = await adapter.getActiveRosterWithIds();
  const owned = roster.characters.filter((c) => c.discordId === discordUserId);

  const requested = requestedCharacter?.trim();
  if (requested) {
    const match = owned.find((c) => c.name.toLowerCase() === requested.toLowerCase());
    if (!match) {
      return { ok: false, errorMessage: `You don't have an active character named "${requested}".` };
    }
    return { ok: true, characterName: match.name };
  }

  if (owned.length === 1) {
    return { ok: true, characterName: owned[0].name };
  }
  if (owned.length > 1) {
    return { ok: false, errorMessage: 'You have multiple linked characters. Please provide the `character` option.' };
  }
  return { ok: false, errorMessage: 'No linked active character found. Use the web player page to link one first.' };
}
