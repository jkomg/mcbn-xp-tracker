export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** In-memory buffer of warn/error entries, flushed periodically by BotLogForwarder. */
const _warnErrorBuffer: Array<Record<string, unknown>> = [];
const BUFFER_MAX = 100;

/** Drain and return all buffered warn/error entries. */
export function drainLogBuffer(): Array<Record<string, unknown>> {
  return _warnErrorBuffer.splice(0, _warnErrorBuffer.length);
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

export function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
