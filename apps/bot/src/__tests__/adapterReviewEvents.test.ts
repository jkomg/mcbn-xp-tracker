import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebAppAdapter } from '../services/adapter';

describe('WebAppAdapter review-events parsing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves playerDiscordId from API responses', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        events: [
          {
            eventKey: 'claim:1:approved:100',
            kind: 'claim',
            rowIndex: 1,
            characterName: 'Alice',
            playerDiscordId: '123456789012345678',
            status: 'approved',
            reviewedBy: 'Storyteller',
            reviewDate: '20260311 16:00:00',
            reviewedAtEpoch: 100,
            staffNotes: '',
            playPeriod: 'Night 80',
            requestedXp: 3,
            approvedXp: 3,
          },
        ],
        hasMore: false,
      }),
    }));

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const adapter = new WebAppAdapter('http://127.0.0.1:5001', 'token');
    const page = await adapter.getReviewEvents({ limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(page.hasMore).toBe(false);
    expect(page.events).toHaveLength(1);
    expect(page.events[0].playerDiscordId).toBe('123456789012345678');
  });
});
