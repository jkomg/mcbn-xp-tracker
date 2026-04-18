import { describe, expect, it } from 'vitest';
import {
  buildHuntingSiteCreatePayload,
  buildLocationCreatePayload,
  buildPcTrackerCreatePayload,
  buildSessionLogCreatePayload,
  buildSpcCreatePayload,
} from '../scripts/notionSync/notionPayloadBuilders';

describe('notionPayloadBuilders', () => {
  it('builds location payload with optional atmosphere notes', () => {
    const withNotes = buildLocationCreatePayload({
      databaseId: 'db-location',
      locationName: 'North Nashville',
      sourceTag: 'discord-sync',
      atmosphereNotes: 'Neon and rain.',
    });
    expect(withNotes.parent).toEqual({ database_id: 'db-location' });
    expect(withNotes.properties).toMatchObject({
      Location: { title: [{ text: { content: 'North Nashville' } }] },
      Source: { select: { name: 'discord-sync' } },
      'Atmosphere Notes': { rich_text: [{ text: { content: 'Neon and rain.' } }] },
    });

    const withoutNotes = buildLocationCreatePayload({
      databaseId: 'db-location',
      locationName: 'Midtown',
      sourceTag: 'discord-sync',
    });
    expect(withoutNotes.properties).not.toHaveProperty('Atmosphere Notes');
  });

  it('builds hunting site payload with optional domain', () => {
    const withDomain = buildHuntingSiteCreatePayload({
      databaseId: 'db-hunting',
      siteName: 'Printer Alley',
      description: 'Crowded nightlife feeding ground.',
      sourceTag: 'discord-sync',
      domain: 'Downtown',
    });
    expect(withDomain.properties).toMatchObject({
      'Site Name': { title: [{ text: { content: 'Printer Alley' } }] },
      Description: { rich_text: [{ text: { content: 'Crowded nightlife feeding ground.' } }] },
      Source: { select: { name: 'discord-sync' } },
      Domain: { select: { name: 'Downtown' } },
    });

    const withoutDomain = buildHuntingSiteCreatePayload({
      databaseId: 'db-hunting',
      siteName: 'Riverbank',
      description: 'Quiet.',
      sourceTag: 'discord-sync',
    });
    expect(withoutDomain.properties).not.toHaveProperty('Domain');
  });

  it('builds spc payload with optional type and cover', () => {
    const withCover = buildSpcCreatePayload({
      databaseId: 'db-spc',
      name: 'Sheriff Vale',
      sourceTag: 'discord-sync',
      relationshipNotes: 'Sheriff of the city.',
      spcType: 'Mawla',
      coverUrl: 'https://example.com/cover.png',
    });
    expect(withCover.cover).toEqual({ type: 'external', external: { url: 'https://example.com/cover.png' } });
    expect(withCover.properties).toMatchObject({
      Name: { title: [{ text: { content: 'Sheriff Vale' } }] },
      Status: { select: { name: 'Active' } },
      Source: { select: { name: 'discord-sync' } },
      Type: { select: { name: 'Mawla' } },
      'Relationship Notes': { rich_text: [{ text: { content: 'Sheriff of the city.' } }] },
    });

    const withoutType = buildSpcCreatePayload({
      databaseId: 'db-spc',
      name: 'Unknown',
      sourceTag: 'discord-sync',
      relationshipNotes: 'N/A',
    });
    expect(withoutType).not.toHaveProperty('cover');
    expect(withoutType.properties).not.toHaveProperty('Type');
  });

  it('builds pc tracker payload with optional player metadata', () => {
    const payload = buildPcTrackerCreatePayload({
      databaseId: 'db-pc',
      name: 'Alice',
      sourceTag: 'discord-sync',
      playerName: 'Player One',
      clan: 'Ventrue',
      sect: 'Camarilla',
      coterie: 'The Brood',
    });
    expect(payload.properties).toMatchObject({
      'Character Name': { title: [{ text: { content: 'Alice' } }] },
      Source: { select: { name: 'discord-sync' } },
      Player: { rich_text: [{ text: { content: 'Player One' } }] },
      Clan: { select: { name: 'Ventrue' } },
      Sect: { select: { name: 'Camarilla' } },
      Coterie: { rich_text: [{ text: { content: 'The Brood' } }] },
    });

    const minimal = buildPcTrackerCreatePayload({
      databaseId: 'db-pc',
      name: 'Bob',
      sourceTag: 'discord-sync',
    });
    expect(minimal.properties).not.toHaveProperty('Player');
    expect(minimal.properties).not.toHaveProperty('Clan');
    expect(minimal.properties).not.toHaveProperty('Sect');
    expect(minimal.properties).not.toHaveProperty('Coterie');
  });

  it('builds session log payload with optional cover', () => {
    const payload = buildSessionLogCreatePayload({
      databaseId: 'db-session',
      title: '#music-city-histories archive',
      summary: 'Latest post summary',
      date: '2026-04-18',
      sourceTag: 'discord-sync',
      coverUrl: 'https://example.com/session-cover.png',
    });
    expect(payload.cover).toEqual({
      type: 'external',
      external: { url: 'https://example.com/session-cover.png' },
    });
    expect(payload.properties).toMatchObject({
      'Session/Post Title': { title: [{ text: { content: '#music-city-histories archive' } }] },
      Status: { select: { name: 'Complete' } },
      Source: { select: { name: 'discord-sync' } },
      Summary: { rich_text: [{ text: { content: 'Latest post summary' } }] },
      Date: { date: { start: '2026-04-18' } },
    });

    const noCover = buildSessionLogCreatePayload({
      databaseId: 'db-session',
      title: 'Entry',
      summary: 'Summary',
      date: '2026-04-19',
      sourceTag: 'discord-sync',
    });
    expect(noCover).not.toHaveProperty('cover');
  });
});
