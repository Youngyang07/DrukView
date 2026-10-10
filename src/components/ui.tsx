import type { ReactNode } from 'react';
import { ago, safeUrl, STATUS_LABEL } from '@/lib/format';

export function Ext({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  const u = safeUrl(href);
  return u ? <a href={u} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>;
}
export const Badge = ({ status }: { status: string }) => <span className={`badge b-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
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

export function NoDatabase() {
  return (
    <div className="banner warn"><b>The database is not connected</b>
      Set <code>DATABASE_URL</code>, then run <code>npm run db:migrate</code> and <code>npm run db:seed</code>. Nothing is shown until real data is loaded — DrukView never fills gaps with estimates.</div>
  );
}
