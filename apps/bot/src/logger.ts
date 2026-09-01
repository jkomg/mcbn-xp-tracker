export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** In-memory buffer of warn/error entries, flushed periodically by BotLogForwarder. */
const _warnErrorBuffer: Array<Record<string, unknown>> = [];
const BUFFER_MAX = 100;

/** Drain and return all buffered warn/error entries. */
export function drainLogBuffer(): Array<Record<string, unknown>> {
  return _warnErrorBuffer.splice(0, _warnErrorBuffer.length);
}

/**
 * Put drained entries back after a failed flush, oldest-first at the front.
 *
 * BotLogForwarder drains before it POSTs, so without this every failed flush
 * loses up to 30s of warn/error entries permanently. That matters more than it
 * sounds: the flush target is the web app, so the entries most likely to be
 * dropped are the ones describing the web app being unreachable -- the log path
 * degrades exactly when it is carrying the most information. During the
 * us-central1-b outage on 2026-09-01 roughly half the flushes failed, and the
 * persisted record showed ~50% of the events with an onset four minutes late.
 *
 * Entries go at the front because anything logged during the failed flush is
 * newer, which keeps the buffer in chronological order. Overflow still drops
 * the oldest, matching logEvent's own policy: a long outage costs the start of
 * the incident rather than the most recent state, and the container's stdout
 * keeps a complete copy either way.
 */
export function requeueLogEntries(entries: Array<Record<string, unknown>>): void {
  if (!entries.length) return;
  _warnErrorBuffer.unshift(...entries);
  if (_warnErrorBuffer.length > BUFFER_MAX) {
    _warnErrorBuffer.splice(0, _warnErrorBuffer.length - BUFFER_MAX);
  }
}

export function logEvent(level: LogLevel, event: string, context: Record<string, unknown> = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    _warnErrorBuffer.push(payload);
    if (_warnErrorBuffer.length > BUFFER_MAX) _warnErrorBuffer.shift();
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    _warnErrorBuffer.push(payload);
    if (_warnErrorBuffer.length > BUFFER_MAX) _warnErrorBuffer.shift();
    return;
  }

  console.log(line);
}

/**
 * Format an Error's own message — except AggregateError, whose .message is
 * typically empty (e.g. Node's fetch trying both IPv4 and IPv6 and every
 * attempt failing): the real per-attempt details live in .errors instead.
 */
function formatErrorValue(value: unknown): string {
  if (value instanceof AggregateError) {
    const sub = value.errors.map(formatErrorValue).join('; ');
    return sub ? `${value.message || 'AggregateError'}: ${sub}` : (value.message || 'AggregateError');
  }
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}

export function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    // Node's fetch (undici) always throws a generic "TypeError: fetch
    // failed" for any connection-level failure (DNS, connection refused,
    // TLS, connect timeout) — the actual reason lives in .cause and was
    // previously dropped, making every network error indistinguishable in
    // logs. cause can itself be an Error (including AggregateError) or an
    // arbitrary value.
    const cause = (error as { cause?: unknown }).cause;
    if (cause !== undefined) {
      return `${error.message} (${formatErrorValue(cause)})`;
    }
    return error.message;
  }
  return String(error);
}
