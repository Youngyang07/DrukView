import Link from 'next/link';
import { issueUrl } from '@/lib/modules';
import { num } from '@/lib/format';
import { DZONGKHAGS, FACILITY_LABEL, FACILITY_SHORT, health, pct, per10k, population, type DzRef, type FacilityType, type RefSource } from '@/lib/reference';
import FacilityList, { type FacilityRow } from './FacilityList';
import { Bars, Ext, Stat } from './ui';

type Props = { scope: DzRef | null; locale: string };
const TYPES: FacilityType[] = ['hospital', 'phc', 'subpost', 'hisc'];
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}%`;
const ratio = (m: number, f: number) => (f ? Math.round((m / f) * 100) : 0);

export function SourceNote({ source, notes, what }: { source: RefSource; notes: string[]; what: string }) {
  return (<div className="srcbox">
    <p><b>Source:</b> <Ext href={source.url}>{source.publisher} — {source.title}</Ext>{source.table ? `, ${source.table}` : ''}. Transcribed and checked against the publication’s own totals; link checked {source.checked}.</p>
    {notes.length ? <ul>{notes.map(n => <li key={n}>{n}</li>)}</ul> : null}
    <p>Spotted a mistake? <a href={issueUrl(`Data issue: ${what}`, `What is wrong:\nCorrect source (link + page):`)} target="_blank" rel="noopener noreferrer">Report it on GitHub</a>.</p>
  </div>);
}

export function Population({ scope, locale }: Props) {
  const P = population, N = P.national;
  if (!scope) {
    const rows = DZONGKHAGS.map(d => ({ d, r: P.dzongkhags[d.slug] })).filter(x => x.r).sort((a, b) => b.r.total - a.r.total);
    return (<div className="card"><div className="card-h"><h2>Population — Bhutan</h2><span className="fresh">Census 30 May 2017</span></div>
      <div className="kpis">
        <Stat label="Total population" value={num(N.total)} sub={`${num(N.enumerated)} counted by dzongkhag`} />
        <Stat label="Male · Female" value={`${num(N.male)} · ${num(N.female)}`} sub={`${ratio(N.male, N.female)} males per 100 females`} />
        <Stat label="Change since 2005" value={signed(pct(N.total, N.total2005))} sub={`from ${num(N.total2005)} (2005 census)`} />
        <Stat label="Largest dzongkhag" value={rows[0].d.name} sub={`${num(rows[0].r.total)} people`} />
      </div>
      <h3>People per dzongkhag (2017)</h3>
      <Bars rows={rows.map(x => ({ k: x.d.name, v: x.r.total, href: `/${locale}/${x.d.slug}/population` }))} fmt={num} />
      <h3>Detail</h3>
      <div className="scroll"><table><thead><tr><th>Dzongkhag</th><th>2017</th><th>Male</th><th>Female</th><th>Males per 100 females</th><th>2005</th><th>Change</th><th>Of which in thromde</th></tr></thead><tbody>
        {rows.map(({ d, r }) => <tr key={d.slug}><td><Link href={`/${locale}/${d.slug}/population`}>{d.name}</Link></td><td className="num">{num(r.total)}</td><td className="num">{num(r.male)}</td><td className="num">{num(r.female)}</td>
          <td className="num">{ratio(r.male, r.female)}</td><td className="num">{num(r.total2005)}</td><td className="num">{signed(pct(r.total, r.total2005))}</td><td>{r.thromde ? `${r.thromde.name}: ${num(r.thromde.total)}` : '–'}</td></tr>)}</tbody></table></div>
      <SourceNote source={P.source} notes={P.notes} what="Population (census 2017)" /></div>);
  }
  const r = P.dzongkhags[scope.slug];
  if (!r) return <div className="card"><div className="empty">No census figures recorded for {scope.name}.</div></div>;
  const rank = Object.values(P.dzongkhags).filter(x => x.total > r.total).length + 1;
  return (<div className="card"><div className="card-h"><h2>Population — {scope.name}</h2><span className="fresh">Census 30 May 2017</span></div>
    <div className="kpis">
      <Stat label="Population" value={num(r.total)} sub={`${(r.total / N.enumerated * 100).toFixed(1)}% of Bhutan · rank ${rank} of 20`} />
      <Stat label="Male · Female" value={`${num(r.male)} · ${num(r.female)}`} sub={`${ratio(r.male, r.female)} males per 100 females`} />
      <Stat label="Change since 2005" value={signed(pct(r.total, r.total2005))} sub={`from ${num(r.total2005)}`} />
      {r.thromde ? <Stat label={r.thromde.name} value={num(r.thromde.total)} sub={`${(r.thromde.total / r.total * 100).toFixed(0)}% of the dzongkhag; rest: ${num(r.total - r.thromde.total)}`} /> : null}
    </div>
    <p className="note">Boundary changes in 2008 (delimitation of constituencies) explain part of the change between censuses, according to the NSB report. <Link href={`/${locale}/bhutan/population`}>Compare all dzongkhags →</Link></p>
    <SourceNote source={P.source} notes={P.notes} what={`Population – ${scope.name}`} /></div>);
}

function facilityRows(slugs: string[], locale: string): FacilityRow[] {
  const out: FacilityRow[] = [];
  for (const s of slugs) {
    const d = DZONGKHAGS.find(x => x.slug === s); const h = health.dzongkhags[s];
    if (!d || !h) continue;
    for (const f of h.facilities) out.push({ name: f.name, type: f.type, typeLabel: FACILITY_SHORT[f.type], beds: f.beds, dz: d.name, dzHref: `/${locale}/${s}/health`, nameInSource: f.nameInSource });
  }
  return out.sort((a, b) => TYPES.indexOf(a.type as FacilityType) - TYPES.indexOf(b.type as FacilityType) || (b.beds ?? 0) - (a.beds ?? 0) || a.name.localeCompare(b.name));
}

export function Health({ scope, locale }: Props) {
  const H = health; const types = TYPES.map(t => [t, FACILITY_LABEL[t]] as [string, string]);
  const popNote = 'Per-resident figures divide 2025 facility counts by the 2017 census population, so they are indicative only.';
  if (!scope) {
    const G = H.grandTotal;
    const rows = DZONGKHAGS.map(d => ({ d, t: H.dzongkhags[d.slug]?.totals, p: population.dzongkhags[d.slug]?.total ?? 0 })).filter(x => x.t);
    return (<div className="card"><div className="card-h"><h2>Health facilities — Bhutan</h2><span className="fresh">Annual Health Bulletin 2025</span></div>
      <div className="kpis">
        <Stat label="Hospitals" value={num(G.hospitals)} sub={`${num(G.beds)} official beds`} />
        <Stat label="Primary Health Centres" value={num(G.phc)} sub="incl. 6 thromde health centres" />
        <Stat label="Sub-posts" value={num(G.subpost)} sub={`${num(G.hisc)} HISCs`} />
        <Stat label="Outreach clinics" value={num(G.orcs)} sub="ORCs, with or without a shed" />
      </div>
      <h3>Official hospital beds by dzongkhag</h3>
      <Bars rows={rows.sort((a, b) => b.t!.beds - a.t!.beds).map(x => ({ k: x.d.name, v: x.t!.beds, href: `/${locale}/${x.d.slug}/health` }))} fmt={num} />
      <h3>Facilities by dzongkhag</h3>
      <div className="scroll"><table><thead><tr><th>Dzongkhag</th><th>Hospitals</th><th>Beds</th><th>PHCs</th><th>Sub-posts</th><th>HISC</th><th>ORCs</th><th title={popNote}>Beds per 10,000 people*</th></tr></thead><tbody>
        {rows.sort((a, b) => a.d.name.localeCompare(b.d.name)).map(({ d, t, p }) => <tr key={d.slug}><td><Link href={`/${locale}/${d.slug}/health`}>{d.name}</Link></td>
          <td className="num">{t!.hospitals}</td><td className="num">{num(t!.beds)}</td><td className="num">{t!.phc}</td><td className="num">{t!.subpost}</td><td className="num">{t!.hisc}</td><td className="num">{t!.orcs}</td><td className="num">{per10k(t!.beds, p).toFixed(1)}</td></tr>)}
        <tr className="tot"><td>Bhutan</td><td className="num">{G.hospitals}</td><td className="num">{num(G.beds)}</td><td className="num">{G.phc}</td><td className="num">{G.subpost}</td><td className="num">{G.hisc}</td><td className="num">{G.orcs}</td><td className="num">{per10k(G.beds, population.national.enumerated).toFixed(1)}</td></tr></tbody></table></div>
      <p className="note">* {popNote}</p>
      <h3>Find a facility</h3>
      <FacilityList rows={facilityRows(DZONGKHAGS.map(d => d.slug), locale)} types={types} showDz initialType="hospital" />
      <SourceNote source={H.source} notes={H.notes} what="Health facilities" /></div>);
  }
  const h = H.dzongkhags[scope.slug];
  if (!h) return <div className="card"><div className="empty">No health facility list recorded for {scope.name}.</div></div>;
  const t = h.totals, p = population.dzongkhags[scope.slug]?.total ?? 0;
  const natBeds = per10k(H.grandTotal.beds, population.national.enumerated);
  return (<div className="card"><div className="card-h"><h2>Health facilities — {scope.name}</h2><span className="fresh">Annual Health Bulletin 2025</span></div>
    <div className="kpis">
      <Stat label="Hospitals" value={num(t.hospitals)} sub={`${num(t.beds)} official beds`} />
      <Stat label="Primary Health Centres" value={num(t.phc)} sub={`${num(t.subpost)} sub-posts · ${num(t.hisc)} HISC`} />
      <Stat label="Outreach clinics" value={num(t.orcs)} sub="ORCs" />
      <Stat label="Beds per 10,000 people*" value={per10k(t.beds, p).toFixed(1)} sub={`Bhutan: ${natBeds.toFixed(1)}`} />
    </div>
    <p className="note">* {popNote}</p>
    {TYPES.filter(ty => h.facilities.some(f => f.type === ty)).map(ty => <section key={ty}><h3>{FACILITY_LABEL[ty]} ({h.facilities.filter(f => f.type === ty).length})</h3>
      <ul className="chips">{h.facilities.filter(f => f.type === ty).map(f => <li key={f.name}><span className="chip">{f.name}{f.beds ? ` · ${f.beds} beds` : ''}</span></li>)}</ul></section>)}
    <SourceNote source={H.source} notes={H.notes.filter(n => !/^(Trongsa|Haa)/.test(n) || n.startsWith(scope.name.split(' ')[0]))} what={`Health facilities – ${scope.name}`} /></div>);
}
