import Link from 'next/link';
import { issueUrl, MODULES, type ModuleSlug } from '@/lib/modules';
import { money, moneyFull, num } from '@/lib/format';
import { Badge, Bars, Empty, Ext, Fresh, Stacked, Stat } from './ui';
import * as q from '@/server/queries';
import { SOURCE as EGP } from '../../pipeline/egp.mjs';
import { Dzongdags, Economy, Health, Leaders, MofBudget, Population, Schools } from './RefViews';
import { budget, health, population, schools } from '@/lib/reference';

type Props = { module: ModuleSlug; scope: q.Dz | null; locale: string; filters: q.Filters };
const scopeName = (s: q.Dz | null) => (s ? `${s.name} Dzongkhag` : 'Bhutan');

function Cite({ what }: { what: string }) {
  return <p className="note">Something wrong or missing? <a href={issueUrl(`Data issue: ${what}`, `Module: ${what}\nWhat is wrong:\nCorrect source (link):`)} target="_blank" rel="noopener noreferrer">Report it on GitHub</a>.</p>;
}

async function Overview({ scope, locale }: Props) {
  const [st, funders, top, fr] = await Promise.all([q.projectStats(scope?.id ?? null), q.byFunder(scope?.id ?? null), q.listProjects(scope?.id ?? null, {}, 5), q.freshness()]);
  const b = scope ? budget.dzongkhags[scope.slug] : null;
  const hs = scope ? health.dzongkhags[scope.slug] : null;
  const sc = scope ? schools.dzongkhags[scope.slug] : null;
  const pop = scope ? population.dzongkhags[scope.slug]?.total : population.national.total;
  return (<>
    <div className="kpis">
      <Stat label={`Budget FY ${budget.fiscalYear}`} value={money(b ? b.total : budget.national.totalAppropriation, 'BTN')}
        sub={b ? 'dzongkhag administration' : 'total national appropriation'} />
      <Stat label="Projects" value={num(st.total)} sub={`${num(st.active)} active · ${num(st.completed)} completed`} />
      <Stat label="Partner commitments" value={st.total ? money(st.usd, 'USD') : 'n/a'} sub="US$, development partners" />
      <Stat label="People" value={pop ? num(pop) : 'n/a'} sub="2017 census" />
    </div>
    <div className="kpis">
      <Stat label="Hospitals" value={num(hs ? hs.totals.hospitals : health.grandTotal.hospitals)} sub={`${num(hs ? hs.totals.beds : health.grandTotal.beds)} official beds`} />
      <Stat label="Health centres" value={num(hs ? hs.totals.phc : health.grandTotal.phc)} sub={`${num(hs ? hs.totals.subpost : health.grandTotal.subpost)} sub-posts`} />
      <Stat label="Schools" value={num(sc ? sc.total : schools.national.total)} sub={`${num(sc ? sc.byLevel.PS : schools.national.PS)} primary`} />
      <Stat label="Funders" value={num(st.funders)} sub="in this view" />
    </div>
    <div className="card"><div className="card-h"><h2>Largest projects</h2><Fresh at={fr.projects} /></div>
      {top.rows.length ? <ul className="plist">{top.rows.map(p => (
        <li key={p.id}><div className="t">{p.url ? <Ext href={p.url}>{p.title}</Ext> : p.title}</div><div className="m"><Badge status={p.status} /> {p.funder} · {moneyFull(p.amount_committed, p.currency)}</div></li>))}</ul>
        : <Empty>No projects loaded for {scopeName(scope)} yet.</Empty>}
      <p><Link className="btn" href={`/${locale}/${scope?.slug ?? 'bhutan'}/projects`}>All projects →</Link></p></div>
    {funders.length ? <div className="card"><h2>Who is funding (US$)</h2><Stacked parts={funders.filter(f => f.usd > 0).map(f => [f.k, f.usd] as [string, number])} fmt={v => money(v, 'USD')} /></div> : null}
    <div className="modgrid">{MODULES.filter(m => m.slug).map(m => <Link key={m.slug} href={`/${locale}/${scope?.slug ?? 'bhutan'}/${m.slug}`} className="modcard"><b>{m.label}</b><span>{m.blurb}</span></Link>)}</div>
  </>);
}

async function Budget({ scope, locale }: Props) {
  // The Ministry of Finance budget ships with the code; curated rows come from the database when available.
  const [al, fr] = await Promise.all([q.getAllocations(scope?.id ?? null).catch(() => []), q.freshness().catch(() => ({ manual: null }))]);
  const lines = scope ? [] : await q.getBudgetLines().catch(() => []);
  const years = [...new Set([...al.map(a => a.fiscal_year), ...lines.map(l => l.fiscal_year)])].sort().reverse();
  return (<><MofBudget scope={scope} locale={locale} /><div className="card">
    <div className="card-h"><h2>Other published budget documents — {scopeName(scope)}</h2><Fresh at={fr.manual} label="Curated" /></div>
    <p className="note">Extra lines transcribed from other published documents (ministry reports, dzongkhag plans); every line links to its source. Nu. (government) and US$ (partners) are never added together.</p>
    {!years.length ? <Empty>Nothing beyond the Ministry of Finance budget above has been added for {scopeName(scope)} yet. Extra rows enter through <code>data/manual/*.csv</code> with a mandatory citation each — see <Link href="/en/contribute">Contribute</Link>.</Empty> : years.map(y => {
      const a = al.filter(x => x.fiscal_year === y), l = lines.filter(x => x.fiscal_year === y);
      return (<section key={y}><h3>Fiscal year {y}</h3>
        {l.length ? <><Bars rows={Object.entries(l.reduce<Record<string, number>>((m, x) => (x.currency === 'BTN' ? (m[x.agency] = (m[x.agency] ?? 0) + x.amount) : m, m), {})).map(([k, v]) => ({ k, v }))} fmt={v => money(v, 'BTN')} />
          <div className="scroll"><table><thead><tr><th>Agency</th><th>Type</th><th>Amount</th><th>Funding source</th><th>Source document</th></tr></thead><tbody>
            {l.map((x, i) => <tr key={i}><td>{x.agency}</td><td>{x.budget_type}</td><td className="num">{moneyFull(x.amount, x.currency)}</td><td>{x.funding_source ?? '–'}</td><td><Ext href={x.source_url}>{x.source_name}: {x.document}{x.page ? `, p.${x.page}` : ''}</Ext></td></tr>)}</tbody></table></div></> : null}
        {a.length ? <div className="scroll"><table><thead><tr>{!scope ? <th>Dzongkhag</th> : null}<th>Gewog / village</th><th>Sector</th><th>Funding source</th><th>Amount</th><th>Source document</th></tr></thead><tbody>
          {a.map((x, i) => <tr key={i}>{!scope ? <td>{x.dzongkhag}</td> : null}<td>{[x.gewog, x.village].filter(Boolean).join(' / ') || '–'}</td><td>{x.sector ?? 'General'}</td><td>{x.funding_source}</td><td className="num">{moneyFull(x.amount, x.currency)}</td><td><Ext href={x.source_url}>{x.source_name}: {x.document}{x.page ? `, p.${x.page}` : ''}</Ext></td></tr>)}</tbody></table></div> : null}
      </section>);
    })}
    <Cite what={`Budget – ${scopeName(scope)}`} /></div></>);
}

async function Projects({ scope, filters, locale }: Props) {
  const [{ rows, total }, facets, fr] = await Promise.all([q.listProjects(scope?.id ?? null, filters), q.projectFacets(), q.freshness()]);
  const base = `/${locale}/${scope?.slug ?? 'bhutan'}/projects`;
  const csv = `/api/data/projects?format=csv${scope ? `&scope=${scope.slug}` : ''}${Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v as string)}`).join('')}`;
  return (<div className="card">
    <div className="card-h"><h2>Projects <small>({num(total)})</small></h2><Fresh at={fr.projects} /></div>
    <form method="get" action={base} className="filters">
      <label>Funder<select name="funder" defaultValue={filters.funder ?? ''}><option value="">All</option>{facets.funders.map(f => <option key={f}>{f}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={filters.status ?? ''}><option value="">All</option><option value="active">Active</option><option value="completed">Completed</option><option value="pipeline">Pipeline</option></select></label>
      <label>Sector<select name="sector" defaultValue={filters.sector ?? ''}><option value="">All</option>{facets.sectors.map(f => <option key={f}>{f}</option>)}</select></label>
      <label className="grow">Search<input name="q" type="search" defaultValue={filters.q ?? ''} placeholder="Project, agency, sector…" /></label>
      <button type="submit">Apply</button> <Link href={base} className="btn">Reset</Link> <a className="btn" href={csv}>Download CSV</a>
    </form>
    {!rows.length ? <Empty>{total === 0 ? 'No projects match these filters (or no project data has been loaded yet).' : ''}</Empty> : <div className="scroll"><table><thead><tr><th>Project</th><th>Funder</th><th>Status</th><th>Sector</th><th>Where</th><th>Committed</th><th>Disbursed</th><th>Start</th><th>End</th><th>Source</th></tr></thead><tbody>
      {rows.map(p => <tr key={p.id}><td>{p.title}</td><td>{p.funder}</td><td><Badge status={p.status} /></td><td>{p.sector ?? '–'}</td>
        <td>{p.where.length ? p.where.join(', ') : 'National / unspecified'}{p.geo_confidence === 'text-match' ? <small> (inferred from text)</small> : null}</td>
        <td className="num">{p.amount_committed == null ? '–' : money(p.amount_committed, p.currency)}</td><td className="num">{p.amount_disbursed == null ? '–' : money(p.amount_disbursed, p.currency)}</td>
        <td className="nw">{p.start_date ?? '–'}</td><td className="nw">{p.end_date ?? '–'}</td><td>{p.url ? <Ext href={p.url}>View</Ext> : '–'}</td></tr>)}</tbody></table></div>}
    {total > rows.length ? <p className="note">Showing the first {rows.length} of {num(total)}. Refine the filters or download the CSV.</p> : null}
    <Cite what={`Projects – ${scopeName(scope)}`} /></div>);
}

async function Funders({ scope }: Props) {
  const id = scope?.id ?? null;
  const [f, s, st, al, fr] = await Promise.all([q.byFunder(id), q.bySector(id), q.byStatus(id), q.getAllocations(id), q.freshness()]);
  const btn = Object.entries(al.filter(a => a.currency === 'BTN').reduce<Record<string, number>>((m, a) => ((m[a.funding_source] = (m[a.funding_source] ?? 0) + a.amount), m), {})).sort((a, b) => b[1] - a[1]);
  return (<div className="card"><div className="card-h"><h2>Who pays for what — {scopeName(scope)}</h2><Fresh at={fr.projects} /></div>
    <p className="note">Commitments are what funders agreed to provide, not what has been spent. Currencies are never mixed.</p>
    {f.some(x => x.usd > 0) ? <><h3>Development-partner commitments by funder (US$)</h3><Bars rows={f.map(x => ({ k: x.k, v: x.usd }))} fmt={v => money(v, 'USD')} />
      <h3>By sector (US$)</h3><Bars rows={s.map(x => ({ k: x.k, v: x.usd }))} fmt={v => money(v, 'USD')} />
      <h3>By status (number of projects)</h3><Bars rows={st.map(x => ({ k: x.k, v: x.n }))} fmt={v => num(v)} /></> : <Empty>No development-partner project data in this view yet.</Empty>}
    {btn.length ? <><h3>Curated allocations by funding source (Nu.)</h3><Bars rows={btn.map(([k, v]) => ({ k, v }))} fmt={v => money(v, 'BTN')} /></> : null}
    <Cite what={`Funding sources – ${scopeName(scope)}`} /></div>);
}

async function Weather({ scope, locale }: Props) {
  const fr = await q.freshness();
  if (!scope) {
    const rows = await q.getWeatherSummary();
    const has = rows.some(r => r.precip14 !== null);
    return (<div className="card"><div className="card-h"><h2>Weather & rainfall — all dzongkhags</h2><Fresh at={fr.weather} /></div>
      <p className="note">Modelled by Open-Meteo for each dzongkhag’s headquarters town (approximate point) — not a weather-station record.</p>
      {has ? <div className="scroll"><table><thead><tr><th>Dzongkhag</th><th>Rain, last 14 days</th><th>Latest max °C</th><th>Latest min °C</th></tr></thead><tbody>
        {rows.map(r => <tr key={r.id}><td><Link href={`/${locale}/${r.slug}/weather`}>{r.name}</Link></td><td className="num">{r.precip14 == null ? '–' : `${r.precip14.toFixed(1)} mm`}</td><td className="num">{r.tmax ?? '–'}</td><td className="num">{r.tmin ?? '–'}</td></tr>)}</tbody></table></div>
        : <Empty>Weather has not been collected yet (the weather job runs every 6 hours once the site is deployed with a database).</Empty>}</div>);
  }
  const w = await q.getWeather(scope.id);
  const maxP = Math.max(...w.map(x => x.precip_mm ?? 0), 1);
  return (<div className="card"><div className="card-h"><h2>Weather & rainfall — {scope.name}</h2><Fresh at={fr.weather} /></div>
    <p className="note">Modelled by Open-Meteo at the dzongkhag headquarters town (approximate point). Lighter bars are forecast days.</p>
    {w.length ? <><div className="wx" role="img" aria-label="Daily rainfall">{w.map(x => <div key={x.date} className={x.is_forecast ? 'fc' : ''} title={`${x.date}: ${x.precip_mm ?? 0} mm`}><i style={{ height: `${((x.precip_mm ?? 0) / maxP) * 100}%` }} /></div>)}</div>
      <div className="scroll"><table><thead><tr><th>Date</th><th>Max °C</th><th>Min °C</th><th>Rain (mm)</th><th></th></tr></thead><tbody>
        {[...w].reverse().map(x => <tr key={x.date}><td className="nw">{x.date}</td><td className="num">{x.tmax_c ?? '–'}</td><td className="num">{x.tmin_c ?? '–'}</td><td className="num">{x.precip_mm ?? '–'}</td><td>{x.is_forecast ? <small>forecast</small> : null}</td></tr>)}</tbody></table></div></>
      : <Empty>No weather data collected for {scope.name} yet.</Empty>}</div>);
}

async function Tenders({ scope }: Props) {
  const [t, fr] = await Promise.all([q.getTenders(scope?.id ?? null).catch(() => []), q.freshness().catch(() => ({ tenders: null, egp: null }))]);
  const today = new Date().toISOString().slice(0, 10);
  const open = t.filter(x => !x.closing_on || x.closing_on >= today).length;
  return (<div className="card"><div className="card-h"><h2>Tenders — {scopeName(scope)}</h2><Fresh at={fr.tenders} label="e-GP" /></div>
    <p className="note">Public procurement notices read from <Ext href={EGP.url}>e-GP</Ext>, the Royal Government of Bhutan&apos;s Electronic Government Procurement system
      (Procurement Management and Development Division, Ministry of Finance), refreshed daily, plus any notices added as cited CSV rows.
      {t.length ? <> {num(open)} of {num(t.length)} shown here {open === 1 ? 'is' : 'are'} still open for bids.</> : null}</p>
    {t.length ? <>
      <div className="scroll"><table><thead><tr><th>Notice</th><th>Procuring agency</th><th>Where</th><th>Category</th><th>Value</th><th>Published</th><th>Closes</th></tr></thead><tbody>
        {t.map(x => <tr key={x.id}>
          <td><Ext href={x.url}>{x.title}</Ext><br /><small>{x.tender_id ? `e-GP tender ${x.tender_id}` : x.source_name}{x.reference ? ` · ${x.reference}` : ''}{x.amendments > 0 ? ` · ${x.amendments} amendment${x.amendments === 1 ? '' : 's'} issued` : ''}</small></td>
          <td>{x.agency ?? '–'}</td>
          <td>{x.dzongkhag ?? 'National'}</td>
          <td className="nw">{[x.category, x.method].filter(Boolean).join(' · ') || '–'}</td>
          <td className="num">{x.value == null ? 'not published' : moneyFull(x.value, x.currency ?? 'BTN')}</td>
          <td className="nw">{x.published_on ?? '–'}</td>
          <td className="nw">{x.closing_on ?? '–'}{x.closing_on && x.closing_on < today ? <> <small>closed</small></> : null}</td>
        </tr>)}</tbody></table></div>
      <p className="note">e-GP does not publish an estimated value in its tender list, so no amount is shown for those notices rather than a guess.
        Its detail pages open only inside a session of your own, so each notice links to the public tender list — search there for the e-GP tender ID shown above.</p>
    </> : <Empty>No tender notices are published for {scopeName(scope)} right now. e-GP lists only tenders that are currently live, so a dzongkhag with nothing out to bid shows nothing here.</Empty>}
    <Cite what={`Tenders – ${scopeName(scope)}`} /></div>);
}

async function Offices({ scope, locale }: Props) {
  // Elected leaders ship with the code; curated office contacts come from the database when it is available.
  const [o, fr, live, flags] = await Promise.all([
    q.getOffices(scope?.id ?? null).catch(() => []),
    q.freshness().catch(() => ({ manual: null })),
    q.getLeaders().catch(() => []),
    q.getNewsFlags(scope?.id ?? null).catch(() => []),
  ]);
  const liveLeaders = live.length ? { rows: live, fetchedAt: live[0].fetched_at } : null;
  const sec = (kind: string, title: string) => { const l = o.filter(x => x.kind === kind); return l.length ? <><h3>{title}</h3><ul className="plist">{l.map((x, i) => <li key={i}><div className="t">{x.name}</div><div className="m">{[x.role, x.dzongkhag ?? 'National', x.contact].filter(Boolean).join(' · ')} · <Ext href={x.source_url}>{x.source_name}</Ext>{x.retrieved_on ? ` (checked ${x.retrieved_on})` : ''}</div></li>)}</ul></> : null; };
  // The curated offices table only appears when rows have actually been added; the Dzongdag card above already
  // carries each dzongkhag administration's own published contacts.
  if (!o.length) return (<><Leaders scope={scope} locale={locale} live={liveLeaders} flags={flags} /><Dzongdags scope={scope} locale={locale} /></>);
  return (<><Leaders scope={scope} locale={locale} live={liveLeaders} flags={flags} /><Dzongdags scope={scope} locale={locale} /><div className="card"><div className="card-h"><h2>Other offices & contacts — {scopeName(scope)}</h2><Fresh at={fr.manual} label="Curated" /></div>
    <p className="note">Names and contacts come only from official publications; each entry cites its page and the date it was checked.</p>
    {sec('leader', 'Officials')}{sec('office', 'Offices & contacts')}
    <Cite what={`Offices – ${scopeName(scope)}`} /></div></>);
}

export default async function ModuleView(p: Props) {
  switch (p.module) {
    case '': return <Overview {...p} />;
    case 'budget': return <Budget {...p} />;
    case 'projects': return <Projects {...p} />;
    case 'funders': return <Funders {...p} />;
    case 'weather': return <Weather {...p} />;
    case 'tenders': return <Tenders {...p} />;
    case 'offices': return <Offices {...p} />;
    case 'population': return <Population scope={p.scope} locale={p.locale} />;
    case 'health': return <Health scope={p.scope} locale={p.locale} />;
    case 'schools': return <Schools scope={p.scope} locale={p.locale} />;
    case 'economy': return <Economy scope={p.scope} locale={p.locale} />;
  }
}
