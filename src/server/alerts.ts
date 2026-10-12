/**
 * Alerting for a collector that has quietly stopped.
 *
 * This is the failure mode docs/adr/0002 has now demonstrated twice, and the one the site is least able to
 * show: the pages still render, every figure still carries its citation, and the data is a fortnight old.
 * `status = 'stale'` does not catch it. That flag is set by a job that RAN and failed — if the scheduler
 * stops firing at all, the status stays `ok` and `last_success` simply ages. So the test here is the AGE of
 * the last success, independent of status.
 *
 * Two destinations, because they fail in opposite circumstances:
 *
 *   - `/api/health` answers 503 while any source is overdue, so an external uptime monitor becomes the
 *     alert channel. This is the one that still works when this app's own cron is dead — which is exactly
 *     when the webhook below cannot run.
 *   - `ALERT_WEBHOOK_URL`, when set, is posted to by the daily `/api/cron/alerts` run: once per day per
 *     overdue source, plus one line when an overdue source recovers.
 *
 * Neither needs an account, a dependency, or a secret in the payload.
 */
import { query } from './db';

/** Every collector's cron is daily, so the default 72 h is three missed runs — late enough not to fire on
 *  one slow day, early enough that a reader is not looking at week-old data without being told. */
export const OVERDUE_AFTER_H = () => {
  const n = Number(process.env.STALE_ALERT_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 72;
};

/** Repeat an alert at most once a day: a source that stays broken for a week must not send a week of noise. */
export const REALERT_AFTER_H = 24;

export type SourceAge = {
  id: string; name: string; status: string; error: string | null;
  last_success: string | null; last_attempt: string | null; alerted_at: string | null;
};
export type Overdue = { id: string; name: string; status: string; error: string | null; hours: number | null; last_success: string | null };

const hoursSince = (iso: string | null | undefined, now: number): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (now - t) / 3_600_000 : null;
};

/**
 * How many hours late a source is, or null when it is not late.
 * A source that has never succeeded is judged on when it was last TRIED, so a collector that has been
 * failing since the day it shipped is overdue rather than exempt.
 */
export function overdueBy(s: Pick<SourceAge, 'last_success' | 'last_attempt'>, now = Date.now(), afterH = OVERDUE_AFTER_H()): number | null {
  const success = hoursSince(s.last_success, now);
  if (success !== null) return success > afterH ? success : null;
  const attempt = hoursSince(s.last_attempt, now);
  return attempt !== null && attempt > afterH ? attempt : null;
}

/** Pure: what is overdue now, which of those is due an alert, and which alerted source has recovered. */
export function classify(rows: SourceAge[], now = Date.now(), afterH = OVERDUE_AFTER_H()) {
  const overdue: Overdue[] = [], alert: Overdue[] = [], recovered: SourceAge[] = [];
  for (const s of rows) {
    const hours = overdueBy(s, now, afterH);
    if (hours === null) { if (s.alerted_at) recovered.push(s); continue; }
    const o: Overdue = { id: s.id, name: s.name, status: s.status, error: s.error, hours, last_success: s.last_success };
    overdue.push(o);
    const quiet = hoursSince(s.alerted_at, now);
    if (quiet === null || quiet > REALERT_AFTER_H) alert.push(o);
  }
  return { overdue, alert, recovered };
}

const days = (h: number) => h < 48 ? `${Math.floor(h)} hours` : `${Math.floor(h / 24)} days`;

/** The message a human reads. Says which source, how old, and what the last error was — enough to act on
 *  without opening anything, and a link for when they do. */
export function alertText(alert: Overdue[], recovered: SourceAge[], afterH: number, site: string): string {
  const lines: string[] = [];
  if (alert.length) {
    lines.push(`DrukView: ${alert.length === 1 ? 'a data source has' : `${alert.length} data sources have`} not refreshed in over ${days(afterH)}.`);
    for (const s of alert) {
      const age = s.hours === null ? 'never succeeded' : `last succeeded ${days(s.hours)} ago`;
      lines.push(`- ${s.name} (${s.id}) — ${age}, status "${s.status}".${s.error ? ` Last error: ${s.error.slice(0, 200)}` : ''}`);
    }
    lines.push('The pages still show the last good data for these sources, so readers are seeing figures that old.');
  }
  for (const s of recovered) lines.push(`DrukView: ${s.name} (${s.id}) is refreshing again.`);
  lines.push(`Source status: ${site.replace(/\/$/, '')}/en/data-sources`);
  return lines.join('\n');
}

export type Delivery = 'sent' | 'no-webhook' | `failed: ${string}`;

/** One POST, no dependency. The body carries the same text under the three keys that Slack, Google Chat,
 *  Discord and ntfy each look for, so any of them can be the destination without a per-service adapter. */
export async function notify(text: string): Promise<Delivery> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return 'no-webhook';
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, content: text, message: text }), signal: AbortSignal.timeout(8_000),
    });
    return r.ok ? 'sent' : `failed: webhook answered HTTP ${r.status}`;
  } catch (e) { return `failed: ${String((e as Error).message).slice(0, 200)}`; }
}

export const readSourceAges = () => query<SourceAge>(
  'select id, name, status, error, last_success::text, last_attempt::text, alerted_at::text from sources order by id');

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://drukview.vercel.app';

export type AlertRun = {
  checked: number; overdue_after_hours: number;
  overdue: { id: string; name: string; hours_late: number | null; status: string }[];
  alerted: string[]; recovered: string[]; delivery: Delivery; text: string | null;
};

/**
 * The daily check. `alerted_at` is advanced only when a notice was actually delivered, so an unconfigured
 * or broken webhook leaves the state saying "nobody has been told" rather than quietly marking it done.
 * Every run is written to update_log either way, so the Updates page records the check even with no webhook.
 */
export async function checkStaleSources({ send = notify }: { send?: (text: string) => Promise<Delivery> } = {}): Promise<AlertRun> {
  const rows = await readSourceAges();
  const afterH = OVERDUE_AFTER_H();
  const { overdue, alert, recovered } = classify(rows, Date.now(), afterH);

  let delivery: Delivery = 'no-webhook', text: string | null = null;
  if (alert.length || recovered.length) {
    text = alertText(alert, recovered, afterH, siteUrl());
    delivery = await send(text);
    if (delivery === 'sent' && alert.length) await query('update sources set alerted_at = now() where id = any($1)', [alert.map(s => s.id)]);
  }
  if (recovered.length) await query('update sources set alerted_at = null where id = any($1)', [recovered.map(s => s.id)]);

  const summary = overdue.length
    ? `${overdue.length} source(s) overdue by more than ${days(afterH)}: ${overdue.map(s => s.id).join(', ')}. Notice: ${delivery}.`
    : `All ${rows.length} sources refreshed within ${days(afterH)}.`;
  await query('insert into update_log(job,status,records,message) values ($1,$2,$3,$4)',
    ['alerts', overdue.length ? 'error' : 'ok', overdue.length, summary]);

  return {
    checked: rows.length, overdue_after_hours: afterH,
    overdue: overdue.map(s => ({ id: s.id, name: s.name, hours_late: s.hours === null ? null : Math.round(s.hours), status: s.status })),
    alerted: alert.map(s => s.id), recovered: recovered.map(s => s.id), delivery, text,
  };
}
