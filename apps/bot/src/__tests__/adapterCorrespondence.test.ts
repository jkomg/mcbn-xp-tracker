import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebAppAdapter } from '../services/adapter';

function fetchOk(body: unknown, status = 200) {
  return vi.fn(async () => ({ ok: true, status, json: async () => body }));
}

function fetchErr(status: number, error: string) {
  return vi.fn(async () => ({ ok: false, status, json: async () => ({ error }) }));
}

const requester = { requesterDiscordId: '111111111111111111', requesterDiscordName: 'alice' };

describe('WebAppAdapter boon methods', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createBoon posts to /api/boons and returns the boon on success', async () => {
    const fetchMock = fetchOk({
      ok: true,
      boon: {
        id: 1, creditor_character_name: 'Alice', debtor_character_name: 'Marcus',
        tier: 'minor', reason: 'test', status: 'owed', created_at: null, resolved_at: null,
      },
    }, 201);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const adapter = new WebAppAdapter('http://127.0.0.1:5001', 'token');
    const result = await adapter.createBoon(requester, {
      creditorCharacterName: 'Alice', debtorCharacterName: 'Marcus', tier: 'minor', reason: 'test',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:5001/api/boons');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Request-Nonce']).toBeTruthy();
    expect(result.ok).toBe(true);
    expect(result.boon?.id).toBe(1);
  });

  it('createBoon surfaces the API error message on failure', async () => {
    vi.stubGlobal('fetch', fetchErr(400, 'tier must be one of trivial, minor, major, life') as unknown as typeof fetch);
    const adapter = new WebAppAdapter('http://127.0.0.1:5001', 'token');
    const result = await adapter.createBoon(requester, {
      creditorCharacterName: 'Alice', debtorCharacterName: 'Marcus', tier: 'huge' as never, reason: '',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('tier must be one of');
  });

  it('getBoonsForCharacter returns null on 404', async () => {
    vi.stubGlobal('fetch', fetchErr(404, 'No active character found') as unknown as typeof fetch);
    const adapter = new WebAppAdapter('http://127.0.0.1:5001', 'token');
    const result = await adapter.getBoonsForCharacter('999');
    expect(result).toBeNull();
  });

  it('actOnBoonRepay posts to the repay-action endpoint', async () => {
    const fetchMock = fetchOk({ ok: true, boon: { id: 1, status: 'repayment_offered' } });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const adapter = new WebAppAdapter('http://127.0.0.1:5001', 'token');
    const result = await adapter.actOnBoonRepay(1, requester);

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:5001/api/boons/1/repay-action');
    expect(result.ok).toBe(true);
  });
});

describe('WebAppAdapter contact-thread methods', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createContactThread posts recipients and returns participants', async () => {
    const fetchMock = fetchOk({
      ok: true, thread_id: 7,
      participants: [{ character_name: 'Alice', discord_id: '1' }, { character_name: 'Marcus', discord_id: '2' }],
    }, 201);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const adapter = new WebAppAdapter('http://127.0.0.1:5001', 'token');
    const result = await adapter.createContactThread(requester, {
      senderCharacterName: 'Alice', recipientCharacterNames: ['Marcus'], body: 'hi',
    });

    expect(result.threadId).toBe(7);
    expect(result.participants).toHaveLength(2);
  });

  it('getContactThreadsForCharacter returns thread list', async () => {
    const fetchMock = fetchOk({
      character_name: 'Alice',
      threads: [{ id: 7, participant_names: ['Alice', 'Marcus'], last_message_at: null, message_count: 1 }],
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const adapter = new WebAppAdapter('http://127.0.0.1:5001', 'token');
    const result = await adapter.getContactThreadsForCharacter('111111111111111111');

    expect(result?.threads).toHaveLength(1);
  });

  it('replyToContactThread returns the other participants to notify', async () => {
    const fetchMock = fetchOk({
      ok: true,
      other_participants: [{ character_name: 'Alice', discord_id: '1' }],
    }, 201);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const adapter = new WebAppAdapter('http://127.0.0.1:5001', 'token');
    const result = await adapter.replyToContactThread(7, requester, { senderCharacterName: 'Marcus', body: 'omw' });

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:5001/api/contact-threads/7/messages');
    expect(result.otherParticipants).toEqual([{ character_name: 'Alice', discord_id: '1' }]);
  });

  it('reports unreachable API without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch);
    const adapter = new WebAppAdapter('http://127.0.0.1:5001', 'token');
    const result = await adapter.createBoon(requester, {
      creditorCharacterName: 'Alice', debtorCharacterName: 'Marcus', tier: 'minor', reason: '',
    });
    expect(result).toEqual({ ok: false, message: 'Unable to reach web app API.' });
  });
});
