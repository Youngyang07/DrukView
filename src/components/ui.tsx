import Link from 'next/link';
import type { ReactNode } from 'react';
import { ago, safeUrl, STATUS_LABEL } from '@/lib/format';
import { dbStatus } from '@/server/db';
import { lastSetupError } from '@/server/setup';

export function Ext({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  const u = safeUrl(href);
  return u ? <a href={u} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>;
}
export const Badge = ({ status }: { status: string }) => <span className={`badge b-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

/**
 * An empty section has to say which kind of empty it is. "There is none here" is a statement about Bhutan;
 * "we could not read the source" is a statement about DrukView, and passing the second off as the first is
 * the worst thing a transparency site can do with a blank space — it did happen once, on the Tenders page
 * (docs/adr/0002). So: if every source behind this section has refreshed successfully, show the caller's
 * own copy for a genuine absence. Otherwise say so, name the source, and point at the Data sources page.
 */
export function EmptyOr({ health, ids, what, children }: { health: { id: string; status: string; last_success: string | null }[]; ids: readonly string[]; what: string; children: ReactNode }) {
  const never = ids.filter(id => !health.find(h => h.id === id)?.last_success);
  const broken = health.filter(h => h.last_success && (h.status === 'error' || h.status === 'stale')).map(h => h.id);
  if (!never.length && !broken.length) return <Empty>{children}</Empty>;
  const problem = never.length
    ? `${what} ${never.length === ids.length ? 'has not been collected yet' : 'has not been fully collected yet'}`
    : `the last refresh of ${what} failed`;
  return (<Empty>
    <b>This is a gap in DrukView, not a statement about Bhutan.</b> Nothing can be shown here because {problem},
    so there may well be data that is simply missing from this page. See <Link href="/en/data-sources">Data sources</Link> for the status of every source.
  </Empty>);
}
export const Stat = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="kpi"><small>{label}</small><b>{value}</b>{sub ? <span>{sub}</span> : null}</div>
);
export const Fresh = ({ at, label = 'Refreshed' }: { at: string | null | undefined; label?: string }) => (
  <span className={`fresh ${at ? '' : 'none'}`} title={at ?? 'No successful refresh yet'}>{at ? `${label} ${ago(at)}` : 'Not refreshed yet'}</span>
);

export function Bars({ rows, fmt }: { rows: { k: string; v: number; href?: string }[]; fmt: (v: number) => string }) {
  const max = Math.max(...rows.map(r => r.v), 1);
  return (
    <div role="list">
      {rows.map(r => (
        <div className="row" role="listitem" key={r.k}>
          <span>{r.href ? <a href={r.href}>{r.k}</a> : r.k}</span>
          <span className="track"><i style={{ width: `${(r.v / max) * 100}%` }} /></span>
          <span className="v">{fmt(r.v)}</span>
        </div>
      ))}
    </div>
  );
}

export const PALETTE = ['#8a1c2b', '#ffb400', '#2f6f8f', '#5c8a3c', '#9b5fc0', '#c2552b', '#4a4a4a', '#c0397a'];
export function Stacked({ parts, fmt }: { parts: [string, number][]; fmt: (v: number) => string }) {
  const total = parts.reduce((s, p) => s + p[1], 0) || 1;
  return (
    <div>
      <div className="bar" role="img" aria-label={parts.map(p => `${p[0]} ${fmt(p[1])}`).join(', ')}>
        {parts.map((p, i) => <span key={p[0]} style={{ width: `${(p[1] / total) * 100}%`, background: PALETTE[i % PALETTE.length] }} title={`${p[0]}: ${fmt(p[1])}`} />)}
      </div>
      <div className="note">{parts.map((p, i) => <span key={p[0]} className="keyi"><i className="sw" style={{ background: PALETTE[i % PALETTE.length] }} />{p[0]} {fmt(p[1])}</span>)}</div>
    </div>
  );
}

export async function NoDatabase() {
  const st = await dbStatus();
  const msg = {
    'no-url': <>No database is configured. Set <code>DATABASE_URL</code> in the hosting environment variables, then redeploy.</>,
    unreachable: <>The database is configured but cannot be reached. Check that <code>DATABASE_URL</code> is correct and the database is running.</>,
    'no-schema': <>The database is connected, but automatic setup failed{lastSetupError ? <>: <code>{lastSetupError}</code></> : null}. Check that the database user may create tables, then reload this page.</>,
    ok: <>The database is ready.</>,
  }[st];
  return (
    <div className="banner warn"><b>{st === 'no-schema' ? 'Automatic database setup failed' : 'The database is not connected'}</b>
      {msg} Nothing is shown until real data is loaded — DrukView never fills gaps with estimates.</div>
  );
}
