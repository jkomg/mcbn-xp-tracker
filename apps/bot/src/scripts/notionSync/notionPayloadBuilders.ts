import type { Client as NotionClient } from '@notionhq/client';

export type NotionCreatePagePayload = Parameters<NotionClient['pages']['create']>[0];

function titleProp(content: string): { title: Array<{ text: { content: string } }> } {
  return { title: [{ text: { content } }] };
}

function richTextProp(content: string): { rich_text: Array<{ text: { content: string } }> } {
  return { rich_text: [{ text: { content } }] };
}

function selectProp(name: string): { select: { name: string } } {
  return { select: { name } };
}

function externalCover(url: string): { type: 'external'; external: { url: string } } {
  return { type: 'external', external: { url } };
}

export function buildLocationCreatePayload(args: {
  databaseId: string;
  locationName: string;
  sourceTag: string;
  atmosphereNotes?: string;
}): NotionCreatePagePayload {
  return {
    parent: { database_id: args.databaseId },
    properties: {
      Location: titleProp(args.locationName),
      Source: selectProp(args.sourceTag),
      ...(args.atmosphereNotes ? { 'Atmosphere Notes': richTextProp(args.atmosphereNotes) } : {}),
    },
  } as NotionCreatePagePayload;
}

export function buildHuntingSiteCreatePayload(args: {
  databaseId: string;
  siteName: string;
  description: string;
  sourceTag: string;
  domain?: string;
}): NotionCreatePagePayload {
  return {
    parent: { database_id: args.databaseId },
    properties: {
      'Site Name': titleProp(args.siteName),
      Description: richTextProp(args.description),
      Source: selectProp(args.sourceTag),
      ...(args.domain ? { Domain: selectProp(args.domain) } : {}),
    },
  } as NotionCreatePagePayload;
}

export function buildSpcCreatePayload(args: {
  databaseId: string;
  name: string;
  sourceTag: string;
  relationshipNotes: string;
  spcType?: string | null;
  coverUrl?: string | null;
}): NotionCreatePagePayload {
  return {
    parent: { database_id: args.databaseId },
    ...(args.coverUrl ? { cover: externalCover(args.coverUrl) } : {}),
    properties: {
      Name: titleProp(args.name),
      Status: selectProp('Active'),
      Source: selectProp(args.sourceTag),
      ...(args.spcType ? { Type: selectProp(args.spcType) } : {}),
      'Relationship Notes': richTextProp(args.relationshipNotes),
    },
  } as NotionCreatePagePayload;
}

export function buildPcTrackerCreatePayload(args: {
  databaseId: string;
  name: string;
  sourceTag: string;
  playerName?: string;
  clan?: string | null;
  sect?: string | null;
  coterie?: string | null;
}): NotionCreatePagePayload {
  return {
    parent: { database_id: args.databaseId },
    properties: {
      'Character Name': titleProp(args.name),
      Source: selectProp(args.sourceTag),
      ...(args.playerName ? { Player: richTextProp(args.playerName) } : {}),
      ...(args.clan ? { Clan: selectProp(args.clan) } : {}),
      ...(args.sect ? { Sect: selectProp(args.sect) } : {}),
      ...(args.coterie ? { Coterie: richTextProp(args.coterie) } : {}),
    },
  } as NotionCreatePagePayload;
}

export function buildSessionLogCreatePayload(args: {
  databaseId: string;
  title: string;
  summary: string;
  date: string;
  sourceTag: string;
  coverUrl?: string | null;
}): NotionCreatePagePayload {
  return {
    parent: { database_id: args.databaseId },
    ...(args.coverUrl ? { cover: externalCover(args.coverUrl) } : {}),
    properties: {
      'Session/Post Title': titleProp(args.title),
      Status: selectProp('Complete'),
      Source: selectProp(args.sourceTag),
      Summary: richTextProp(args.summary),
      Date: { date: { start: args.date } },
    },
  } as NotionCreatePagePayload;
}
