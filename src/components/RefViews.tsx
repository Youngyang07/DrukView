import Link from 'next/link';
import { issueUrl } from '@/lib/modules';
import { money, moneyFull, num } from '@/lib/format';
import { budget, CONFIDENCE_LABEL, dzongdags, DZONGKHAGS, economy, FACILITY_LABEL, FACILITY_SHORT, health, leaders, pct, per10k, population, SCHOOL_LEVEL, schools, type DzRef, type FacilityType, type Member, type RefSource, type SchoolLevel } from '@/lib/reference';
import FacilityList, { type FacilityRow } from './FacilityList';
import { Bars, Ext, Fresh, Stat } from './ui';

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

export type LiveLeaders = { rows: { house: string; name: string; role: string; constituency: string | null; slug: string | null; eminent: boolean; parliament: string }[]; fetchedAt: string | null };
export type LiveFlag = { slug: string; dzongkhag: string; title: string; url: string | null; published: string | null; source_name: string };

/** Live Parliament rows, in the same shape the bundled file uses, so one renderer serves both. */
function shapeLive(live: LiveLeaders) {
  const dz: Record<string, { nationalAssembly: Member[]; nationalCouncil: Member[] }> = {};
  for (const d of DZONGKHAGS) dz[d.slug] = { nationalAssembly: [], nationalCouncil: [] };
  const eminent: Member[] = []; const cabinet: (Member & { dzongkhag: string })[] = [];
  for (const r of live.rows) {
    const m: Member = { name: r.name, role: r.role, constituency: r.constituency };
    if (r.eminent || !r.slug) { if (r.house === 'nc') eminent.push(m); continue; }
    if (r.house === 'na') {
      dz[r.slug]?.nationalAssembly.push(m);
      if (r.role === 'Prime Minister' || r.role === 'Minister') cabinet.push({ ...m, dzongkhag: r.slug });
    } else dz[r.slug]?.nationalCouncil.push(m);
  }
  return { dzongkhags: dz, nationalCouncilEminent: eminent, cabinet };
}

/** "parliament-4" → "4th Parliament" */
export function parliamentLabel(code: string | undefined) {
  const n = Number(String(code ?? '').match(/\d+/)?.[0]);
  if (!Number.isFinite(n)) return 'Parliament of Bhutan';
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix} Parliament`;
}

export function Leaders({ scope, locale, live, flags = [] }: Props & { live?: LiveLeaders | null; flags?: LiveFlag[] }) {
  const base = leaders;
  const shaped = live && live.rows.length ? shapeLive(live) : null;
  const L = shaped ? { ...base, ...shaped } : base;
  const term = shaped ? parliamentLabel(live!.rows[0]?.parliament) : '4th Parliament, 2023–2028';
  const freshness = shaped
    ? <>Refreshed automatically from Parliament&rsquo;s member records <Fresh at={live!.fetchedAt} label="" /></>
    : <>Read from Parliament&rsquo;s member records on {base.sources.na.checked}; the automatic daily refresh has not run here yet</>; const dzName = (s: string) => DZONGKHAGS.find(d => d.slug === s)?.name ?? s;
  const src = <div className="srcbox"><p><b>Sources:</b> <Ext href={L.sources.na.url}>{L.sources.na.publisher} — {L.sources.na.title}</Ext>; <Ext href={L.sources.nc.url}>{L.sources.nc.publisher} — {L.sources.nc.title}</Ext>. {freshness}.</p>
    <ul>{L.notes.map(n => <li key={n}>{n}</li>)}</ul>
    <p>Out of date or wrong? <a href={issueUrl(`Leaders: correction${scope ? ' – ' + scope.name : ''}`, 'What changed:\nOfficial source (link):')} target="_blank" rel="noopener noreferrer">Report it on GitHub</a>.</p></div>;
  const news = flags.length ? (<section><h3>Recent news that may affect these entries</h3>
    <p className="note">Headlines from Kuensel and The Bhutanese that look like a change of office-holder. They are prompts to re-check an entry against the official source — no name on DrukView is ever taken from a newspaper.</p>
    <ul className="plist">{flags.slice(0, 12).map((f, i) => <li key={i}><div className="t">{f.url ? <Ext href={f.url}>{f.title}</Ext> : f.title}</div>
      <div className="m">{f.dzongkhag} · {f.source_name}{f.published ? ` · ${f.published.slice(0, 10)}` : ''}</div></li>)}</ul></section>) : null;
  if (!scope) {
    return (<div className="card"><div className="card-h"><h2>Elected leaders — Bhutan</h2><span className="fresh">{term}</span></div>
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
      {news}
      {src}</div>);
  }
  const x = L.dzongkhags[scope.slug];
  return (<div className="card"><div className="card-h"><h2>Elected leaders — {scope.name}</h2><span className="fresh">{term}</span></div>
    <h3>National Assembly ({x.nationalAssembly.length})</h3><MemberList items={x.nationalAssembly} />
    <h3>National Council</h3><MemberList items={x.nationalCouncil} />
    {news}
    {src}</div>);
}

const SECTOR_PAD: Record<string, string> = { child: 'padleft', parent: '', top: '' };

export function MofBudget({ scope, locale }: Props) {
  const B = budget; const N = B.national; const LG = B.localGovernment;
  const fy = `FY ${B.fiscalYear}`;
  const src = <SourceNote source={B.source} notes={B.notes} what={`National budget ${fy}${scope ? ' – ' + scope.name : ''}`} />;
  if (!scope) {
    const dzRows = DZONGKHAGS.map(d => ({ d, b: B.dzongkhags[d.slug], p: population.dzongkhags[d.slug]?.total ?? 0 })).filter(x => x.b);
    return (<div className="card"><div className="card-h"><h2>National budget — {fy}</h2><span className="fresh">Ministry of Finance</span></div>
      <div className="kpis">
        <Stat label="Total appropriation" value={money(N.totalAppropriation, 'BTN')} sub={`${money(N.current, 'BTN')} running costs · ${money(N.capital, 'BTN')} investment`} />
        <Stat label="Domestic revenue" value={money(N.domesticRevenue, 'BTN')} sub={`${money(N.tax, 'BTN')} tax · ${money(N.nonTax, 'BTN')} non-tax`} />
        <Stat label="External resources" value={money(N.externalResources, 'BTN')} sub={`incl. ${money(N.grantsGoI, 'BTN')} from the Government of India`} />
        <Stat label="Fiscal deficit" value={money(N.fiscalDeficit, 'BTN')} sub={`${Math.abs(N.deficitPctGdp).toFixed(2)}% of GDP`} />
      </div>
      <h3>What the money is for</h3>
      <Bars rows={B.sectors.filter(s => s.level !== 'child').map(s => ({ k: s.name, v: s.total }))} fmt={v => money(v, 'BTN')} />
      <div className="scroll"><table><thead><tr><th>Sector</th><th>Running costs</th><th>Investment</th><th>Total</th><th>Share</th></tr></thead><tbody>
        {B.sectors.map(s => <tr key={s.name} className={s.level === 'parent' ? 'tot' : undefined}><td className={SECTOR_PAD[s.level]}>{s.name}</td>
          <td className="num">{moneyFull(s.current, 'BTN')}</td><td className="num">{moneyFull(s.capital, 'BTN')}</td><td className="num">{moneyFull(s.total, 'BTN')}</td>
          <td className="num">{((s.total / N.totalAppropriation) * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>
      <p className="note">Indented rows are part of the sector above them and are not counted twice in the total.</p>
      <h3>Local government — {money(LG.total, 'BTN')}</h3>
      <p className="note">Dzongkhags {money(LG.dzongkhags.total, 'BTN')} · gewogs {money(LG.gewogsTotal, 'BTN')} · thromdes {money(LG.thromdesTotal, 'BTN')}. That is {((LG.total / N.totalAppropriation) * 100).toFixed(1)}% of the national budget, up from {money(LG.previousYearTotal, 'BTN')} last year.</p>
      <Bars rows={[...dzRows].sort((a, b) => b.b.total - a.b.total).map(x => ({ k: x.d.name, v: x.b.total, href: `/${locale}/${x.d.slug}/budget` }))} fmt={v => money(v, 'BTN')} />
      <div className="scroll"><table><thead><tr><th>Dzongkhag</th><th>Running costs</th><th>Investment</th><th>Total</th><th title="Dzongkhag allocation divided by the 2017 census population">Per person*</th></tr></thead><tbody>
        {[...dzRows].sort((a, b) => a.d.name.localeCompare(b.d.name)).map(({ d, b, p }) => <tr key={d.slug}><td><Link href={`/${locale}/${d.slug}/budget`}>{d.name}</Link></td>
          <td className="num">{moneyFull(b.current, 'BTN')}</td><td className="num">{moneyFull(b.capital, 'BTN')}</td><td className="num">{moneyFull(b.total, 'BTN')}</td>
          <td className="num">{p ? moneyFull(Math.round(b.total / p), 'BTN') : '–'}</td></tr>)}
        <tr className="tot"><td>All dzongkhags</td><td className="num">{moneyFull(LG.dzongkhags.current, 'BTN')}</td><td className="num">{moneyFull(LG.dzongkhags.capital, 'BTN')}</td><td className="num">{moneyFull(LG.dzongkhags.total, 'BTN')}</td><td /></tr></tbody></table></div>
      <p className="note">* Indicative only: the {fy} allocation divided by the 2017 census population. It excludes the gewog and thromde budgets below, and money that central ministries spend in the dzongkhag.</p>
      <h3>Thromdes (city administrations)</h3>
      <div className="scroll"><table><thead><tr><th>Thromde</th><th>Dzongkhag</th><th>Running costs</th><th>Investment</th><th>Total</th></tr></thead><tbody>
        {B.thromdes.map(t => <tr key={t.name}><td>{t.name}</td><td><Link href={`/${locale}/${t.dz}/budget`}>{DZONGKHAGS.find(d => d.slug === t.dz)?.name}</Link></td>
          <td className="num">{moneyFull(t.current, 'BTN')}</td><td className="num">{moneyFull(t.capital, 'BTN')}</td><td className="num">{moneyFull(t.total, 'BTN')}</td></tr>)}</tbody></table></div>
      {src}</div>);
  }
  const b = B.dzongkhags[scope.slug];
  if (!b) return <div className="card"><div className="empty">No budget line recorded for {scope.name}.</div></div>;
  const gewogs = B.gewogs.filter(g => g.dz === scope.slug).sort((a, b2) => b2.total - a.total);
  const thromde = B.thromdes.filter(t => t.dz === scope.slug);
  const pop = population.dzongkhags[scope.slug]?.total ?? 0;
  const gTotal = gewogs.reduce((s, g) => s + g.total, 0);
  const rank = Object.values(B.dzongkhags).filter(x => x.total > b.total).length + 1;
  return (<div className="card"><div className="card-h"><h2>Budget — {scope.name}, {fy}</h2><span className="fresh">Ministry of Finance</span></div>
    <div className="kpis">
      <Stat label="Dzongkhag administration" value={money(b.total, 'BTN')} sub={`rank ${rank} of 20 · ${((b.total / B.localGovernment.dzongkhags.total) * 100).toFixed(1)}% of all dzongkhags`} />
      <Stat label="Running costs" value={money(b.current, 'BTN')} sub="salaries and day-to-day operations" />
      <Stat label="Investment" value={money(b.capital, 'BTN')} sub="construction, equipment, projects" />
      <Stat label={`Its ${gewogs.length} gewogs`} value={money(gTotal, 'BTN')} sub="budgeted separately, listed below" />
    </div>
    <h3>How the investment budget is provided</h3>
    <Bars rows={[
      { k: 'Block grant the dzongkhag decides on', v: b.capitalBlock },
      { k: 'Project-tied, development partners', v: b.capitalProjectExternal },
      { k: 'Project-tied, government', v: b.capitalProjectRgob },
      { k: 'Spent here by central agencies', v: b.capitalCentral },
    ].filter(r => r.v > 0)} fmt={v => money(v, 'BTN')} />
    {thromde.length ? <><h3>Thromde (city administration)</h3>
      <ul className="plist">{thromde.map(t => <li key={t.name}><div className="t">{t.name} — {moneyFull(t.total, 'BTN')}</div><div className="m">{moneyFull(t.current, 'BTN')} running costs · {moneyFull(t.capital, 'BTN')} investment · budgeted separately from the dzongkhag</div></li>)}</ul></> : null}
    <h3>Gewogs ({gewogs.length})</h3>
    <div className="scroll"><table><thead><tr><th>Gewog</th><th>Running costs</th><th>Investment</th><th>Total</th></tr></thead><tbody>
      {gewogs.map(g => <tr key={g.gewog}><td>{g.gewog}</td><td className="num">{moneyFull(g.current, 'BTN')}</td><td className="num">{moneyFull(g.capital, 'BTN')}</td><td className="num">{moneyFull(g.total, 'BTN')}</td></tr>)}
      <tr className="tot"><td>Total</td><td className="num">{moneyFull(gewogs.reduce((s, g) => s + g.current, 0), 'BTN')}</td><td className="num">{moneyFull(gewogs.reduce((s, g) => s + g.capital, 0), 'BTN')}</td><td className="num">{moneyFull(gTotal, 'BTN')}</td></tr></tbody></table></div>
    {pop ? <p className="note">Dzongkhag, gewogs{thromde.length ? ' and thromde' : ''} together: {moneyFull(b.total + gTotal + thromde.reduce((s, t) => s + t.total, 0), 'BTN')} — about {moneyFull(Math.round((b.total + gTotal + thromde.reduce((s, t) => s + t.total, 0)) / pop), 'BTN')} per person against the 2017 census population. Central ministries also spend money here that is not in these figures.</p> : null}
    <p><Link className="btn" href={`/${locale}/bhutan/budget`}>Compare all dzongkhags →</Link></p>
    {src}</div>);
}

export function Economy({ scope, locale }: Props) {
  const ind = economy.metrics.find(m => m.key === 'industry')!;
  const plc = economy.metrics.find(m => m.key === 'placements')!;
  const SCALE: [string, string][] = [['cottage', 'Cottage'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
  if (!scope) {
    const rows = DZONGKHAGS.map(d => ({ d, i: ind.dzongkhags[d.slug], p: plc.dzongkhags[d.slug]?.total ?? 0, pop: population.dzongkhags[d.slug]?.total ?? 0 })).filter(x => x.i);
    return (<div className="card"><div className="card-h"><h2>Industry & jobs — Bhutan</h2><span className="fresh">Industry, Commerce & Employment</span></div>
      <div className="kpis">
        <Stat label="Active industry licences" value={num(ind.national.total)} sub={`on ${ind.asOf}`} />
        <Stat label="Cottage & small" value={num(ind.national.cottage + ind.national.small)} sub={`${(((ind.national.cottage + ind.national.small) / ind.national.total) * 100).toFixed(1)}% of all licences`} />
        <Stat label="Medium & large" value={num(ind.national.medium + ind.national.large)} sub={`${num(ind.national.large)} large`} />
        <Stat label={plc.label} value={num(plc.national.total)} sub={`financial year ${plc.fiscalYear}`} />
      </div>
      <h3>Licences by dzongkhag</h3>
      <Bars rows={[...rows].sort((a, b) => b.i.total - a.i.total).map(x => ({ k: x.d.name, v: x.i.total, href: `/${locale}/${x.d.slug}/economy` }))} fmt={num} />
      <div className="scroll"><table><thead><tr><th>Dzongkhag</th>{SCALE.map(([, l]) => <th key={l}>{l}</th>)}<th>Total</th><th title="Different years: 2026 licences, 2017 census">Per 1,000 people*</th><th>Jobs filled {plc.fiscalYear}</th></tr></thead><tbody>
        {[...rows].sort((a, b) => a.d.name.localeCompare(b.d.name)).map(({ d, i, p, pop }) => <tr key={d.slug}><td><Link href={`/${locale}/${d.slug}/economy`}>{d.name}</Link></td>
          {SCALE.map(([k]) => <td className="num" key={k}>{num(i[k])}</td>)}<td className="num">{num(i.total)}</td>
          <td className="num">{pop ? ((i.total / pop) * 1000).toFixed(0) : '–'}</td><td className="num">{num(p)}</td></tr>)}
        <tr className="tot"><td>Bhutan</td>{SCALE.map(([k]) => <td className="num" key={k}>{num(ind.national[k])}</td>)}<td className="num">{num(ind.national.total)}</td>
          <td className="num">{((ind.national.total / population.national.enumerated) * 1000).toFixed(0)}</td><td className="num">{num(plc.national.total)}</td></tr></tbody></table></div>
      <p className="note">* Indicative only: licences in 2026 against the 2017 census population.</p>
      <SourceNote source={ind.source} notes={ind.notes} what="Industry licences" />
      <SourceNote source={plc.source} notes={plc.notes} what="Jobs filled" /></div>);
  }
  const i = ind.dzongkhags[scope.slug]; const p = plc.dzongkhags[scope.slug]?.total ?? 0;
  if (!i) return <div className="card"><div className="empty">No industry figures recorded for {scope.name}.</div></div>;
  const rank = Object.values(ind.dzongkhags).filter(x => x.total > i.total).length + 1;
  const pop = population.dzongkhags[scope.slug]?.total ?? 0;
  return (<div className="card"><div className="card-h"><h2>Industry & jobs — {scope.name}</h2><span className="fresh">Industry, Commerce & Employment</span></div>
    <div className="kpis">
      <Stat label="Active industry licences" value={num(i.total)} sub={`rank ${rank} of 20 · ${((i.total / ind.national.total) * 100).toFixed(1)}% of Bhutan`} />
      <Stat label="Cottage & small" value={num(i.cottage + i.small)} sub={`${num(i.cottage)} cottage · ${num(i.small)} small`} />
      <Stat label="Medium & large" value={num(i.medium + i.large)} sub={`${num(i.medium)} medium · ${num(i.large)} large`} />
      <Stat label={`Jobs filled ${plc.fiscalYear}`} value={num(p)} sub="through the national labour system" />
    </div>
    <h3>Licences by size of business</h3>
    <Bars rows={SCALE.map(([k, l]) => ({ k: l, v: i[k] })).filter(r => r.v > 0)} fmt={num} />
    {pop ? <p className="note">That is about {((i.total / pop) * 1000).toFixed(0)} licences per 1,000 residents, against {((ind.national.total / population.national.enumerated) * 1000).toFixed(0)} nationally — indicative only, as the licence count is from 2026 and the population from the 2017 census.</p> : null}
    <p><Link className="btn" href={`/${locale}/bhutan/economy`}>Compare all dzongkhags →</Link></p>
    <SourceNote source={ind.source} notes={ind.notes} what={`Industry licences – ${scope.name}`} />
    <SourceNote source={plc.source} notes={plc.notes} what={`Jobs filled – ${scope.name}`} /></div>);
}

export function Dzongdags({ scope }: Props) {
  const D = dzongdags;
  const one = (slug: string) => {
    const e = D.dzongkhags[slug]; const d = e?.dzongdag; const o = e?.office;
    return (<>
      {d ? <ul className="plist"><li>
        <div className="t">{d.name} <span className={`conf c-${d.confidence}`}>{d.confidence}</span></div>
        <div className="m">Dzongdag (district administrator){d.asOf ? ` · took office ${d.asOf}` : ''} · {CONFIDENCE_LABEL[d.confidence]}
          {d.sourceUrl ? <> · <Ext href={d.sourceUrl}>{d.sourceTitle ?? 'source'}</Ext></> : null}</div>
        {d.note ? <p className="note">{d.note}</p> : null}
      </li></ul> : <div className="empty">No Dzongdag recorded for this dzongkhag.</div>}
      {o && (o.phone || o.email || o.address || o.website) ? <ul className="plist"><li>
        <div className="t">{o.name ?? 'Dzongkhag Administration'}</div>
        <div className="m">{[o.phone, o.email, o.address].filter(Boolean).join(' · ')}{o.website ? <> · <Ext href={o.website}>{o.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</Ext></> : null}</div>
      </li></ul> : null}
    </>);
  };
  if (scope) return (<div className="card"><div className="card-h"><h2>Dzongkhag administration — {scope.name}</h2><span className="fresh">Checked {D.checked}</span></div>
    {one(scope.slug)}
    <div className="srcbox"><ul>{D.notes.map(n => <li key={n}>{n}</li>)}</ul>
      <p>Wrong or out of date? <a href={issueUrl(`Dzongdag: correction – ${scope.name}`, 'Correct name:\nOfficial source (link):')} target="_blank" rel="noopener noreferrer">Report it on GitHub</a>.</p></div></div>);
  const rows = DZONGKHAGS.map(d => ({ d, e: D.dzongkhags[d.slug] }));
  const n = (c: string) => rows.filter(r => r.e?.dzongdag?.confidence === c).length;
  return (<div className="card"><div className="card-h"><h2>Dzongdags (district administrators)</h2><span className="fresh">Checked {D.checked}</span></div>
    <p className="note">{n('confirmed')} confirmed by a dated appointment notice, {n('website')} taken from an undated page on the dzongkhag&rsquo;s own website, {n('unconfirmed')} unconfirmed.</p>
    <div className="scroll"><table><thead><tr><th>Dzongkhag</th><th>Dzongdag</th><th>How well confirmed</th><th>Office</th></tr></thead><tbody>
      {rows.map(({ d, e }) => <tr key={d.slug}><td>{d.name}</td>
        <td>{e?.dzongdag ? <>{e.dzongdag.name}{e.dzongdag.sourceUrl ? <> <Ext href={e.dzongdag.sourceUrl}>↗</Ext></> : null}</> : '–'}</td>
        <td>{e?.dzongdag ? <span className={`conf c-${e.dzongdag.confidence}`}>{e.dzongdag.confidence}</span> : '–'}{e?.dzongdag?.asOf ? <small> since {e.dzongdag.asOf}</small> : null}</td>
        <td>{[e?.office?.phone, e?.office?.email].filter(Boolean).join(' · ') || (e?.office?.website ? <Ext href={e.office.website}>website</Ext> : '–')}</td></tr>)}</tbody></table></div>
    {rows.filter(r => r.e?.dzongdag?.note && r.e.dzongdag.confidence !== 'confirmed').length ? <>
      <h3>Entries to treat with care</h3>
      <ul className="plist">{rows.filter(r => r.e?.dzongdag?.note && r.e.dzongdag.confidence === 'unconfirmed').map(({ d, e }) =>
        <li key={d.slug}><div className="t">{d.name}: {e!.dzongdag!.name}</div><div className="m">{e!.dzongdag!.note}</div></li>)}</ul></> : null}
    <div className="srcbox"><ul>{D.notes.map(nt => <li key={nt}>{nt}</li>)}</ul>
      <p>Wrong or out of date? <a href={issueUrl('Dzongdag: correction', 'Dzongkhag:\nCorrect name:\nOfficial source (link):')} target="_blank" rel="noopener noreferrer">Report it on GitHub</a>.</p></div></div>);
}
