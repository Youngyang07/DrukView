import Link from 'next/link';
import { issueUrl } from '@/lib/modules';
import { num } from '@/lib/format';
import { DZONGKHAGS, FACILITY_LABEL, FACILITY_SHORT, health, leaders, pct, per10k, population, SCHOOL_LEVEL, schools, type DzRef, type FacilityType, type RefSource, type SchoolLevel } from '@/lib/reference';
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

const LEVELS: SchoolLevel[] = ['ECR', 'PS', 'LSS', 'MSS', 'HSS', 'other'];

export function Schools({ scope, locale }: Props) {
  const S = schools; const N = S.national;
  if (!scope) {
    const rows = DZONGKHAGS.map(d => ({ d, s: S.dzongkhags[d.slug], p: population.dzongkhags[d.slug]?.total ?? 0 })).filter(x => x.s);
    const all = rows.flatMap(({ d, s }) => s.schools.map(x => ({ name: x.name, type: x.level, typeLabel: SCHOOL_LEVEL[x.level], beds: null, dz: d.name + (x.thromde ? ` (${x.thromde})` : ''), dzHref: `/${locale}/${d.slug}/schools`, nameInSource: x.nameInSource })));
    return (<div className="card"><div className="card-h"><h2>Schools — Bhutan</h2><span className="fresh">Annual Education Statistics 2024</span></div>
      <div className="kpis">
        <Stat label="Schools" value={num(N.total)} sub="government and private" />
        <Stat label="Primary" value={num(N.PS)} sub={`+ ${N.ECR} extended classrooms`} />
        <Stat label="Secondary" value={num(N.LSS + N.MSS + N.HSS)} sub={`${N.LSS} lower · ${N.MSS} middle · ${N.HSS} higher`} />
        <Stat label="Special institutes" value={num(N.special)} sub="as listed in Table A" />
      </div>
      <h3>Schools by dzongkhag</h3>
      <Bars rows={[...rows].sort((a, b) => b.s.total - a.s.total).map(x => ({ k: x.d.name, v: x.s.total, href: `/${locale}/${x.d.slug}/schools` }))} fmt={num} />
      <h3>By level</h3>
      <div className="scroll"><table><thead><tr><th>Dzongkhag</th><th>Total</th><th title="Extended classrooms">ECR</th><th>Primary</th><th>Lower sec.</th><th title="Split between middle and higher secondary is approximate">Middle/higher</th><th>Special</th><th title="Different years: 2024 schools, 2017 census">Per 10k people*</th></tr></thead><tbody>
        {[...rows].sort((a, b) => a.d.name.localeCompare(b.d.name)).map(({ d, s, p }) => <tr key={d.slug}><td><Link href={`/${locale}/${d.slug}/schools`}>{d.name}</Link>{s.thromde ? <small> incl. {s.thromde.map(t => `${t.name} ${t.total}`).join(', ')}</small> : null}</td>
          <td className="num">{s.total}</td><td className="num">{s.byLevel.ECR}</td><td className="num">{s.byLevel.PS}</td><td className="num">{s.byLevel.LSS}</td><td className="num">{s.byLevel.MSS + s.byLevel.HSS}</td><td className="num">{s.byLevel.other}</td><td className="num">{per10k(s.total, p).toFixed(1)}</td></tr>)}
        <tr className="tot"><td>Bhutan</td><td className="num">{N.total}</td><td className="num">{N.ECR}</td><td className="num">{N.PS}</td><td className="num">{N.LSS}</td><td className="num">{N.MSS + N.HSS}</td><td className="num">{N.special}</td><td className="num">{per10k(N.total, population.national.enumerated).toFixed(1)}</td></tr></tbody></table></div>
      <p className="note">* Indicative: 2024 school counts divided by the 2017 census population.</p>
      <h3>Find a school</h3>
      <FacilityList rows={all} types={LEVELS.map(l => [l, SCHOOL_LEVEL[l]] as [string, string])} showDz initialType="HSS" hideBeds />
      <SourceNote source={S.source} notes={S.notes} what="Schools" /></div>);
  }
  const s = S.dzongkhags[scope.slug];
  if (!s) return <div className="card"><div className="empty">No school list recorded for {scope.name}.</div></div>;
  return (<div className="card"><div className="card-h"><h2>Schools — {scope.name}</h2><span className="fresh">Annual Education Statistics 2024</span></div>
    <div className="kpis">
      <Stat label="Schools" value={num(s.total)} sub={s.thromde ? `incl. ${s.thromde.map(t => `${t.total} in ${t.name}`).join(', ')}` : `of ${N.total} in Bhutan`} />
      <Stat label="Primary" value={num(s.byLevel.PS)} sub={`+ ${s.byLevel.ECR} extended classrooms`} />
      <Stat label="Secondary" value={num(s.byLevel.LSS + s.byLevel.MSS + s.byLevel.HSS)} sub={`${s.byLevel.LSS} lower · ${s.byLevel.MSS + s.byLevel.HSS} middle/higher`} />
    </div>
    {LEVELS.filter(l => s.schools.some(x => x.level === l)).map(l => <section key={l}><h3>{SCHOOL_LEVEL[l]} ({s.schools.filter(x => x.level === l).length})</h3>
      <ul className="chips">{s.schools.filter(x => x.level === l).map((x, i) => <li key={i}><span className="chip" title={x.nameInSource ? `Extracted as: ${x.nameInSource}` : undefined}>{x.name}{x.thromde ? ` · ${x.thromde}` : ''}</span></li>)}</ul></section>)}
    <SourceNote source={S.source} notes={S.notes} what={`Schools – ${scope.name}`} /></div>);
}

function MemberList({ items }: { items: { name: string; role: string; constituency?: string | null; dz?: string }[] }) {
  return <ul className="plist">{items.map((m, i) => <li key={i}><div className="t">{m.name}</div><div className="m">{[m.role, m.constituency && `${m.constituency} constituency`, m.dz].filter(Boolean).join(' · ')}</div></li>)}</ul>;
}

export function Leaders({ scope, locale }: Props) {
  const L = leaders; const dzName = (s: string) => DZONGKHAGS.find(d => d.slug === s)?.name ?? s;
  const src = <div className="srcbox"><p><b>Sources:</b> <Ext href={L.sources.na.url}>{L.sources.na.publisher} — {L.sources.na.title}</Ext>; <Ext href={L.sources.nc.url}>{L.sources.nc.publisher} — {L.sources.nc.title}</Ext>. Read from Parliament’s public member records on {L.sources.na.checked}.</p>
    <ul>{L.notes.map(n => <li key={n}>{n}</li>)}</ul>
    <p>Out of date or wrong? <a href={issueUrl(`Leaders: correction${scope ? ' – ' + scope.name : ''}`, 'What changed:\nOfficial source (link):')} target="_blank" rel="noopener noreferrer">Report it on GitHub</a>.</p></div>;
  if (!scope) {
    return (<div className="card"><div className="card-h"><h2>Elected leaders — Bhutan</h2><span className="fresh">4th Parliament, 2023–2028</span></div>
      <div className="kpis">
        <Stat label="National Assembly" value="47" sub="members, one per constituency" />
        <Stat label="National Council" value="25" sub="20 elected (one per dzongkhag) + 5 eminent" />
        <Stat label="Prime Minister & ministers" value={num(L.cabinet.length)} sub="as designated in Parliament’s member records" />
      </div>
      <h3>Prime Minister and ministers</h3>
      <MemberList items={L.cabinet.map(m => ({ ...m, dz: dzName(m.dzongkhag) }))} />
      <h3>Representatives by dzongkhag</h3>
      <div className="scroll"><table><thead><tr><th>Dzongkhag</th><th>National Assembly (constituency)</th><th>National Council</th></tr></thead><tbody>
        {DZONGKHAGS.map(d => { const x = L.dzongkhags[d.slug]; return <tr key={d.slug}><td><Link href={`/${locale}/${d.slug}/offices`}>{d.name}</Link></td>
          <td>{x.nationalAssembly.map((m, i) => <div key={i}>{m.name} <small>({m.constituency}{m.role !== 'Member of Parliament' ? `; ${m.role}` : ''})</small></div>)}</td>
          <td>{x.nationalCouncil.map(m => m.name + (m.role !== 'Member' ? ` (${m.role})` : '')).join(', ')}</td></tr>; })}</tbody></table></div>
      <h3>Eminent members of the National Council</h3>
      <MemberList items={L.nationalCouncilEminent} />
      {src}</div>);
  }
  const x = L.dzongkhags[scope.slug];
  return (<div className="card"><div className="card-h"><h2>Elected leaders — {scope.name}</h2><span className="fresh">4th Parliament, 2023–2028</span></div>
    <h3>National Assembly ({x.nationalAssembly.length})</h3><MemberList items={x.nationalAssembly} />
    <h3>National Council</h3><MemberList items={x.nationalCouncil} />
    {src}</div>);
}
