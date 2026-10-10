'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import MapView from './MapView';
import { money, moneyFull, num, plural, STATUS_LABEL } from '@/lib/format';
import type { ExplorerDz } from '@/server/explorer';

type Metric = 'usd' | 'count' | 'btn';
const sum = <T,>(xs: T[], k: (x: T) => number) => xs.reduce((s, x) => s + k(x), 0);
function group<T>(xs: T[], key: (x: T) => string, val: (x: T) => number): [string, number][] {
  const m = new Map<string, number>(); for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + val(x));
  return [...m].sort((a, b) => b[1] - a[1]);
}

function ClickBars({ rows, active, onPick, fmt }: { rows: [string, number][]; active: string; onPick: (k: string) => void; fmt: (v: number) => string }) {
  const max = Math.max(...rows.map(r => r[1]), 1);
  return <>{rows.map(([k, v]) => (
    <button type="button" key={k} className={`row crow${active === k ? ' on' : ''}`} aria-pressed={active === k} title={active === k ? 'Click to clear this filter' : 'Click to filter'} onClick={() => onPick(active === k ? '' : k)}>
      <span>{k}</span><span className="track"><i style={{ width: `${(v / max) * 100}%` }} /></span><span className="v">{fmt(v)}</span>
    </button>))}</>;
}

export default function Explorer({ dz, hasAlloc, locale }: { dz: ExplorerDz[]; hasAlloc: boolean; locale: string }) {
  const [metric, setMetric] = useState<Metric>('usd');
  const [sel, setSel] = useState<string | null>(null);
  const [fy, setFy] = useState('');
  const [sector, setSector] = useState(''); const [src, setSrc] = useState(''); const [gewog, setGewog] = useState('');
  const d = dz.find(x => x.id === sel) ?? null;

  const values = useMemo(() => Object.fromEntries(dz.map(x => [x.id, metric === 'usd' ? x.usd : metric === 'count' ? x.n : x.btn])), [dz, metric]);
  const fmtMap = (id: string, v: number) => { const x = dz.find(z => z.id === id)!; return `${plural(x.n, 'project')}, ${v > 0 ? (metric === 'count' ? num(v) : money(v, metric === 'btn' ? 'BTN' : 'USD')) : 'no figures'}`; };
  const pick = (id: string | null) => { setSel(id); setFy(''); setSector(''); setSrc(''); setGewog(''); };

  const years = d ? [...new Set(d.allocations.map(a => a.fiscal_year))].sort().reverse() : [];
  const year = fy && years.includes(fy) ? fy : years[0] ?? '';
  const alFy = d ? d.allocations.filter(a => a.fiscal_year === year && a.currency === 'BTN') : [];
  const alView = alFy.filter(a => (!sector || (a.sector ?? 'General') === sector) && (!src || a.funding_source === src) && (!gewog || a.gewog?.toLowerCase() === gewog.toLowerCase()));
  const gewogValues = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of alFy) if (a.gewog) m[a.gewog.toLowerCase()] = (m[a.gewog.toLowerCase()] ?? 0) + a.amount;
    return m;
  }, [alFy]);
  const projView = d ? d.projects.filter(p => (!sector || (p.sector ?? 'Unclassified') === sector) && (!src || p.funder === src)) : [];
  const filtered = [sector && `sector: ${sector}`, src && `source: ${src}`, gewog && `gewog: ${gewog}`].filter(Boolean) as string[];

  return (
    <div className="grid2">
      <div className="card mapcard">
        <div className="card-h"><h2>Click a dzongkhag to open its budget</h2>
          <label className="inline">Colour by <select value={metric} onChange={e => setMetric(e.target.value as Metric)}>
            <option value="usd">Committed US$</option><option value="count">Number of projects</option>
            {hasAlloc ? <option value="btn">Budget (Nu.)</option> : null}</select></label>
        </div>
        <MapView values={values} format={fmtMap} selected={sel} onSelect={pick}
          gewogValues={gewogValues} selectedGewog={gewog} onGewog={g => setGewog(cur => (cur.toLowerCase() === g.toLowerCase() ? '' : g))}
          formatGewog={(name, v) => `${name} Gewog: ${v ? money(v, 'BTN') + ' in published budget lines' : 'no budget lines added yet'}`} />
      </div>

      <aside className="card" aria-live="polite">
        {!d ? (<>
          <h2>Bhutan overview</h2>
          <p className="note">Click any dzongkhag to see its allocations, funding sources, sectors, gewogs and projects — or pick one from the list below.</p>
          <ul className="chips">{dz.map(x => <li key={x.id}><Link href={`/${locale}/${x.slug}`}>{x.name}</Link></li>)}</ul>
        </>) : (<>
          <div className="card-h"><h2>{d.name} Dzongkhag</h2><button type="button" onClick={() => pick(null)}>Clear</button></div>
          <p><Link className="btn" href={`/${locale}/${d.slug}`}>Open full {d.name} dashboard →</Link></p>
          <div className="kpis small">
            <div className="kpi"><small>Budget {year}</small><b>{alFy.length ? money(sum(alFy, a => a.amount), 'BTN') : 'n/a'}</b><span>{alFy.length ? `${alFy.length} line${alFy.length === 1 ? '' : 's'}` : 'none published here yet'}</span></div>
            <div className="kpi"><small>Partner commitments</small><b>{d.projects.length ? money(d.usdAll, 'USD') : 'n/a'}</b><span>US$, all projects here</span></div>
            <div className="kpi"><small>Projects</small><b>{d.n}</b><span>{d.active} active · {d.completed} completed</span></div>
          </div>
          {years.length > 1 ? <label className="inline">Fiscal year <select value={year} onChange={e => setFy(e.target.value)}>{years.map(y => <option key={y}>{y}</option>)}</select></label> : null}
          {filtered.length ? <p className="note">Filtered by {filtered.join(' · ')} <button type="button" className="link" onClick={() => { setSector(''); setSrc(''); setGewog(''); }}>clear filters</button></p> : null}

          {!alFy.length ? <div className="empty">No government or sector budget lines for {d.name} have been added yet. Rows (with their source document) go in <code>data/manual/allocations_by_location.csv</code>.</div> : (<>
            <h3>Where the money comes from</h3>
            <ClickBars rows={group(alFy, a => a.funding_source, a => a.amount)} active={src} onPick={setSrc} fmt={v => money(v, 'BTN')} />
            <h3>What it is spent on</h3>
            <ClickBars rows={group(alFy.filter(a => !src || a.funding_source === src), a => a.sector ?? 'General', a => a.amount)} active={sector} onPick={setSector} fmt={v => money(v, 'BTN')} />
            {alFy.some(a => a.gewog) ? (<><h3>By gewog</h3><ClickBars rows={group(alFy.filter(a => a.gewog), a => a.gewog!, a => a.amount)} active={gewog} onPick={setGewog} fmt={v => money(v, 'BTN')} /></>) : null}
            <h3>Budget lines{alView.length !== alFy.length ? ` (${alView.length} of ${alFy.length})` : ''}</h3>
            <ul className="plist">{alView.map((a, i) => (
              <li key={i}><div className="t">{a.sector ?? 'General'} – {moneyFull(a.amount, a.currency)}</div>
                <div className="m">{a.funding_source}{a.gewog ? ` · ${a.gewog}` : ''}{a.village ? ` · ${a.village}` : ''} · FY {a.fiscal_year} · <a href={a.source_url} target="_blank" rel="noopener noreferrer">{a.source_name}: {a.document}{a.page ? `, p.${a.page}` : ''}</a></div></li>))}</ul>
          </>)}

          {d.projects.some(p => p.currency === 'USD' && p.committed) ? (<><h3>Development-partner projects by funder (US$)</h3>
            <ClickBars rows={group(d.projects.filter(p => p.currency === 'USD' && p.committed), p => p.funder, p => p.committed ?? 0)} active={src} onPick={setSrc} fmt={v => money(v, 'USD')} /></>) : null}
          <h3>Projects ({projView.length})</h3>
          {projView.length ? <ul className="plist">{projView.slice(0, 40).map(p => (
            <li key={p.id}><details><summary><span className="t">{p.title}</span>
              <div className="m"><span className={`badge b-${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span> {p.funder} · {moneyFull(p.committed, p.currency)}</div></summary>
              <dl className="dl">
                {p.sector ? <><dt>Sector</dt><dd>{p.sector}</dd></> : null}{p.agency ? <><dt>Implementing agency</dt><dd>{p.agency}</dd></> : null}
                <dt>Committed</dt><dd>{moneyFull(p.committed, p.currency)}</dd><dt>Disbursed</dt><dd>{p.disbursed == null ? 'not reported by source' : moneyFull(p.disbursed, p.currency)}</dd>
                <dt>Period</dt><dd>{p.start ?? '?'} → {p.end ?? '?'}</dd>
                <dt>Location basis</dt><dd>{p.basis === 'text-match' ? 'inferred from place names in text' : p.basis === 'location-field' ? 'source location field' : 'unspecified'}</dd>
              </dl>
              {p.description ? <p className="note">{p.description}</p> : null}
              {p.url ? <p><a href={p.url} target="_blank" rel="noopener noreferrer">Open original record ↗</a></p> : null}</details></li>))}</ul>
            : <div className="empty">No projects match for this dzongkhag.</div>}
        </>)}
      </aside>
    </div>
  );
}
