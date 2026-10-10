const SYM: Record<string, string> = { BTN: 'Nu.', USD: 'US$', INR: '₹' };
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en');

export const money = (n: number | null | undefined, cur: string) => n === null || n === undefined ? 'n/a' : `${SYM[cur] ?? cur + ' '}${compact.format(n)}`;
export const moneyFull = (n: number | null | undefined, cur: string) => n === null || n === undefined ? 'amount not reported' : `${SYM[cur] ?? cur + ' '}${full.format(Math.round(n))}`;
export const num = (n: number) => full.format(n);
export const plural = (n: number, one: string, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`;

export const STATUS_LABEL: Record<string, string> = { active: 'Active', completed: 'Completed', pipeline: 'Pipeline', cancelled: 'Cancelled', suspended: 'Suspended', unknown: 'Unknown' };

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  // Postgres renders timestamptz as "2026-10-10 14:19:00.1+00"; JS needs "T" and a full "+00:00" offset.
  const t = new Date(iso.replace(' ', 'T').replace(/(\d:\d\d(?:\.\d+)?)([+-]\d\d)$/, '$1$2:00')).getTime();
  if (Number.isNaN(t)) return 'never';
  const mins = (now - t) / 60000;
  if (mins < 2) return 'just now';
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} h ago`;
  const d = Math.floor(mins / 1440);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const safeUrl = (u: string | null | undefined): string | null => { try { const x = new URL(u ?? ''); return x.protocol === 'https:' ? x.href : null; } catch { return null; } };

/** Quantile class 0..5 (0 = no figures). */
export function classer(values: number[]): (x: number) => number {
  const v = values.filter(x => x > 0).sort((a, b) => a - b);
  if (!v.length) return () => 0;
  const cut = [1, 2, 3, 4].map(i => v[Math.min(v.length - 1, Math.floor(i * v.length / 5))]);
  return x => (x <= 0 ? 0 : 1 + cut.filter(c => x > c).length);
}
