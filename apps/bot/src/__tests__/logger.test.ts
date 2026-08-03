import { describe, expect, it } from 'vitest';
import { errorToMessage } from '../logger';

describe('errorToMessage', () => {
  it('returns the plain message for an Error with no cause', () => {
    expect(errorToMessage(new Error('boom'))).toBe('boom');
  });

  it('appends the cause when the Error has one', () => {
    // Node's fetch (undici) always throws a generic "TypeError: fetch failed"
    // for any connection-level failure — the real reason (DNS, ECONNREFUSED,
    // TLS, connect timeout) lives in .cause. This is the exact shape that
    // made every config_sync_failed/heartbeat_failed log indistinguishable.
    const cause = new Error('getaddrinfo ENOTFOUND mcbn.jkomg.us');
    const err = new Error('fetch failed', { cause });
    expect(errorToMessage(err)).toBe('fetch failed (getaddrinfo ENOTFOUND mcbn.jkomg.us)');
  });

  it('stringifies a non-Error cause', () => {
    const err = new Error('fetch failed');
    (err as { cause?: unknown }).cause = 'connect ECONNREFUSED';
    expect(errorToMessage(err)).toBe('fetch failed (connect ECONNREFUSED)');
  });

  it('does not append anything when cause is undefined', () => {
    const err = new Error('plain failure');
    expect(errorToMessage(err)).toBe('plain failure');
  });

  it('stringifies non-Error values unchanged', () => {
    expect(errorToMessage('a plain string')).toBe('a plain string');
    expect(errorToMessage(null)).toBe('null');
    expect(errorToMessage(undefined)).toBe('undefined');
  });
});
