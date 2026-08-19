/**
 * Nightly Google Sheets reconciliation service.
 *
 * Fires once per day at a configured local time, triggering the web app's
 * POST /api/sheets/reconcile endpoint which performs a full DB↔Sheets diff
 * and repairs any gaps. Uses the same sliding tick-window approach as
 * passageOfTimeService so the scheduled time is hit reliably regardless
 * of bot start offset.
 */

import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';

type ReconcileConfig = {
  enabled: boolean;
  hourLocal: number;
  minuteLocal: number;
  timezone: string;
  intervalMs: number;
};

function localParts(now: Date, timezone: string): { dateKey: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dateKey = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const hour = Number.parseInt(pick('hour'), 10);
  const minute = Number.parseInt(pick('minute'), 10);
  return {
    dateKey,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export class SheetsReconcileService {
  private readonly adapter: TrackerAdapter;
  private readonly config: ReconcileConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastTickTime: Date;
  /** Track which date keys we've already reconciled to prevent double-runs. */
  private reconciledDates = new Set<string>();

  constructor(adapter: TrackerAdapter, config: ReconcileConfig) {
    this.adapter = adapter;
    this.config = config;
    this.lastTickTime = new Date(Date.now() - config.intervalMs);
  }

  start() {
    if (this.timer) {
      return;
    }
    if (!this.config.enabled) {
      // Loud and distinct from sheets_reconcile_service_started on purpose —
      // this has no liveConfig mirror, so a wrong/missing env var here would
      // otherwise persist silently for the process's entire lifetime with no
      // dashboard visibility (the same shape as the cubby-sync incident).
      logEvent('warn', 'sheets_reconcile_service_disabled', {
        hint: 'SHEETS_RECONCILE_ENABLED is not "true" — nightly Sheets reconciliation will not run.',
      });
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.intervalMs);
    this.timer.unref();
    void this.tick();
    logEvent('info', 'sheets_reconcile_service_started', {
      intervalMs: this.config.intervalMs,
      hourLocal: this.config.hourLocal,
      minuteLocal: this.config.minuteLocal,
      timezone: this.config.timezone,
    });
  }

  stop() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (!this.config.enabled) return;
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const parts = localParts(now, this.config.timezone);
      const prevParts = localParts(this.lastTickTime, this.config.timezone);
      this.lastTickTime = now;

      const targetMin = this.config.hourLocal * 60 + this.config.minuteLocal;
      const nowMin = parts.hour * 60 + parts.minute;
      const prevMin = prevParts.hour * 60 + prevParts.minute;

      // Fire if target time falls in (prevTick, now] — handles tick alignment drift
      if (nowMin < targetMin || prevMin >= targetMin) {
        return;
      }

      // Skip if already reconciled today
      if (this.reconciledDates.has(parts.dateKey)) {
        return;
      }
      this.reconciledDates.add(parts.dateKey);

      // Prune old date keys (keep last 7 days)
      if (this.reconciledDates.size > 7) {
        const sorted = Array.from(this.reconciledDates).sort();
        for (const key of sorted.slice(0, sorted.length - 7)) {
          this.reconciledDates.delete(key);
        }
      }

      logEvent('info', 'sheets_reconcile_triggered', { dateKey: parts.dateKey });
      const summary = await this.adapter.triggerSheetsReconcile();
      logEvent('info', 'sheets_reconcile_complete', {
        dateKey: parts.dateKey,
        claimsAppended: summary.claims_appended,
        claimsStatusUpdated: summary.claims_status_updated,
        spendsAppended: summary.spends_appended,
        spendsStatusUpdated: summary.spends_status_updated,
        ledgerAppended: summary.ledger_appended,
        charactersAppended: summary.characters_appended,
        auditAppended: summary.audit_appended,
        errorCount: summary.errors.length,
        errors: summary.errors.length > 0 ? summary.errors : undefined,
      });
    } catch (error) {
      logEvent('warn', 'sheets_reconcile_error', { error: errorToMessage(error) });
    } finally {
      this.running = false;
    }
  }
}
