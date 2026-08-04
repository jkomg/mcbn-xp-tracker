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

  it('formats an AggregateError cause by its sub-errors, not its own empty message', () => {
    // When a hostname resolves to multiple addresses (IPv4 + IPv6) and every
    // connection attempt fails, Node sets fetch's TypeError.cause to an
    // AggregateError whose own .message is empty — the real per-attempt
    // reasons (e.g. ECONNREFUSED) live in .errors. Codex review finding on
    // PR #400.
    const aggregate = new AggregateError(
      [new Error('connect ECONNREFUSED 127.0.0.1:443'), new Error('connect ECONNREFUSED ::1:443')],
      '',
    );
    const err = new Error('fetch failed', { cause: aggregate });
    expect(errorToMessage(err)).toBe(
      'fetch failed (AggregateError: connect ECONNREFUSED 127.0.0.1:443; connect ECONNREFUSED ::1:443)',
    );
  });

  it('formats an AggregateError with a non-empty message too', () => {
    const aggregate = new AggregateError([new Error('ECONNREFUSED')], 'all promises rejected');
    const err = new Error('fetch failed', { cause: aggregate });
    expect(errorToMessage(err)).toBe('fetch failed (all promises rejected: ECONNREFUSED)');
  });

  it('formats an AggregateError with no sub-errors using just its own message', () => {
    const aggregate = new AggregateError([], 'nothing to report');
    const err = new Error('fetch failed', { cause: aggregate });
    expect(errorToMessage(err)).toBe('fetch failed (nothing to report)');
  });
});
