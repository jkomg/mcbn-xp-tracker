import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BotLogForwarder } from '../services/botLogForwarder';
import { drainLogBuffer, logEvent } from '../logger';
import type { TrackerAdapter } from '../services/adapter';

function makeAdapter(postBotLog: TrackerAdapter['postBotLog']): TrackerAdapter {
  return { postBotLog } as unknown as TrackerAdapter;
}

describe('BotLogForwarder.flush', () => {
  beforeEach(() => {
    drainLogBuffer();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('clears the buffer once the POST succeeds', async () => {
    const post = vi.fn().mockResolvedValue(undefined);
    logEvent('warn', 'heartbeat_failed', { error: 'This operation was aborted' });

    await new BotLogForwarder(makeAdapter(post)).flush();

    expect(post).toHaveBeenCalledOnce();
    expect(drainLogBuffer()).toEqual([]);
  });

  it('keeps the entries when the POST fails, so the next tick retries them', async () => {
    // The regression this guards: flush() drains before it POSTs, so a failed
    // flush used to discard the payload permanently. The flush target is the
    // web app itself, which means the entries most likely to be lost are the
    // ones recording that the web app is unreachable.
    const post = vi.fn().mockRejectedValue(new Error('bot-log POST failed: 500'));
    logEvent('warn', 'config_sync_failed', { error: 'This operation was aborted' });

    const forwarder = new BotLogForwarder(makeAdapter(post));
    await forwarder.flush();

    post.mockResolvedValue(undefined);
    await forwarder.flush();

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0]).toEqual([
      expect.objectContaining({ event: 'config_sync_failed' }),
    ]);
    expect(drainLogBuffer()).toEqual([]);
  });

  it('retries a rate-limited flush too, not just an unreachable app', async () => {
    // postBotLog throws on any non-2xx. A 429 from the web app's rate limiter
    // dropped entries exactly like a 500 did.
    const post = vi.fn().mockRejectedValue(new Error('bot-log POST failed: 429'));
    logEvent('warn', 'review_notifier_poll_failed', {});

    await new BotLogForwarder(makeAdapter(post)).flush();

    expect(drainLogBuffer()).toEqual([
      expect.objectContaining({ event: 'review_notifier_poll_failed' }),
    ]);
  });

  it('keeps requeued entries ahead of ones logged during the failed flush', async () => {
    const post = vi.fn().mockImplementation(async () => {
      logEvent('warn', 'logged_during_flush', {});
      throw new Error('bot-log POST failed: 500');
    });
    logEvent('warn', 'logged_first', {});

    await new BotLogForwarder(makeAdapter(post)).flush();

    expect(drainLogBuffer().map((e) => e.event)).toEqual([
      'logged_first',
      'logged_during_flush',
    ]);
  });

  it('caps the buffer at 100, dropping the oldest rather than growing without bound', async () => {
    // A long outage must not let the buffer grow unbounded in a process that
    // never restarts. Overflow drops the oldest, matching logEvent's policy.
    const post = vi.fn().mockRejectedValue(new Error('bot-log POST failed: 500'));
    for (let i = 0; i < 60; i += 1) logEvent('warn', `first_batch_${i}`, {});

    const forwarder = new BotLogForwarder(makeAdapter(post));
    await forwarder.flush();
    for (let i = 0; i < 60; i += 1) logEvent('warn', `second_batch_${i}`, {});
    await forwarder.flush();

    const events = drainLogBuffer().map((e) => e.event);
    expect(events).toHaveLength(100);
    expect(events[0]).toBe('first_batch_20');
    expect(events[events.length - 1]).toBe('second_batch_59');
  });

  it('stamps each entry with a distinct id', async () => {
    logEvent('warn', 'config_sync_failed', {});
    logEvent('warn', 'config_sync_failed', {});

    const ids = drainLogBuffer().map((e) => e.entryId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toEqual(expect.any(String));
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('keeps an entry id stable across a failed flush, so the retry dedupes', async () => {
    // The web app commits its rows before running escalation checks and its
    // pruning pass, so a failure after that point means the entry is stored
    // while the bot still retries. The id is what lets the server tell that
    // retry from a genuine second occurrence -- it must not be regenerated.
    const post = vi.fn().mockRejectedValue(new Error('bot-log POST failed: 500'));
    logEvent('warn', 'heartbeat_failed', {});

    const forwarder = new BotLogForwarder(makeAdapter(post));
    await forwarder.flush();
    post.mockResolvedValue(undefined);
    await forwarder.flush();

    expect(post.mock.calls[0][0][0].entryId).toBe(post.mock.calls[1][0][0].entryId);
  });

  it('does not let a caller overwrite the entry id', () => {
    logEvent('warn', 'config_sync_failed', { entryId: 'attacker-supplied' });
    expect(drainLogBuffer()[0].entryId).not.toBe('attacker-supplied');
  });

  it('does not POST when there is nothing buffered', async () => {
    const post = vi.fn().mockResolvedValue(undefined);
    await new BotLogForwarder(makeAdapter(post)).flush();
    expect(post).not.toHaveBeenCalled();
  });
});
