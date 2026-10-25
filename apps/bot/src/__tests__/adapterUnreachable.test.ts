import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebAppAdapter } from '../services/adapter';
import { errorToMessage } from '../logger';

describe('WebAppAdapter unreachable errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the underlying fetch failure as the cause', async () => {
    const fetchErr = new TypeError('fetch failed', {
      cause: new Error('getaddrinfo EAI_AGAIN mcbn.jkomg.us'),
    });
    vi.stubGlobal('fetch', vi.fn(async () => { throw fetchErr; }) as unknown as typeof fetch);

    const adapter = new WebAppAdapter('http://127.0.0.1:5001', 'token');
    const err = await adapter.getPendingRetirementJobs().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).cause).toBe(fetchErr);
    expect(errorToMessage(err)).toBe(
      'Unable to reach retirement automation API. (fetch failed (getaddrinfo EAI_AGAIN mcbn.jkomg.us))',
    );
  });
});
