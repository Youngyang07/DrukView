import LoadData from '@/components/LoadData';
import { OVERDUE_AFTER_H, overdueBy } from '@/server/alerts';
import { Ext, Fresh, NoDatabase } from '@/components/ui';
import { ago } from '@/lib/format';
import { REFERENCE_SOURCES } from '@/lib/reference';
import { dbReady, getSources } from '@/server/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Data sources' };

export default async function DataSources() {
  const ready = await dbReady(); const src = ready ? await getSources() : [];
  // A source whose job keeps failing is marked stale by the job itself. A source whose job has stopped
  // running at all keeps status "ok" while its data ages, which is invisible unless something measures the
  // age — so that is measured here, with the same rule the alert and /api/health use.
  const afterH = OVERDUE_AFTER_H(), limitDays = Math.round(afterH / 24);
  const late = new Map(src.map(s => [s.id, overdueBy(s, Date.now(), afterH)] as const).filter(([, h]) => h !== null));
  return (<div className="wrap page"><h1 className="pagetitle">Data sources</h1>
    <p>Everything on DrukView comes from the sources below. Automated sources refresh on a schedule; if one fails, its last good data stays visible and is marked <b>stale</b> — it is never silently wiped or replaced with estimates.</p>
    {!ready ? <NoDatabase /> : <LoadData />}
    {late.size ? <div className="banner warn"><b>{late.size === 1 ? 'One source is overdue.' : `${late.size} sources are overdue.`}</b> {late.size === 1 ? 'It has' : 'They have'} not refreshed successfully in over {limitDays} {limitDays === 1 ? 'day' : 'days'}, so the figures drawn from {late.size === 1 ? 'it' : 'them'} are at least that old. {late.size === 1 ? 'It is' : 'They are'} marked below.</div> : null}
    {ready && !src.length ? <div className="empty">No source has been loaded yet — press <b>Load / refresh data now</b> above.</div> : null}
    {src.length ? <div className="card scroll"><table><thead><tr><th>Source</th><th>Status</th><th>Last success</th><th>Records</th><th>Notes</th></tr></thead><tbody>
      {src.map(s => <tr key={s.id}><td><Ext href={s.url}>{s.name}</Ext></td><td><span className={`badge b-${s.status}`}>{s.status.replace('_', ' ')}</span></td><td><Fresh at={s.last_success} label="" /> <small>(tried {ago(s.last_attempt)})</small></td><td className="num">{s.records}</td>
        <td>{s.notes}{late.has(s.id) ? <div className="note overdue">Overdue: no successful refresh in over {limitDays} {limitDays === 1 ? 'day' : 'days'}. The data shown from this source is at least that old.</div> : null}{s.error ? <div className="note">Last error: {s.error}</div> : null}</td></tr>)}</tbody></table></div> : null}
    <h2>Reference data (transcribed from official publications)</h2>
    <p>These tables ship with the site and do not need the database. Each one is checked against the publication’s own totals by automated tests, so a transcription slip fails the build.</p>
    <div className="card scroll"><table><thead><tr><th>Data</th><th>Source</th><th>Checked</th><th>Notes</th></tr></thead><tbody>
      {REFERENCE_SOURCES.map(r => <tr key={r.what}><td>{r.what}</td><td><Ext href={r.source.url}>{r.source.publisher} — {r.source.title}</Ext>{r.source.table ? <div className="note">{r.source.table}</div> : null}</td><td className="nw">{r.source.checked}</td><td><ul>{r.notes.map(n => <li key={n}>{n}</li>)}</ul></td></tr>)}</tbody></table></div>
    <h2>How to read the numbers</h2>
    <ul>
      <li>“Committed” is what a funder agreed to provide, not what has been spent. “Disbursed” is shown only when the source reports it.</li>
      <li>Location comes from the source’s location fields; otherwise from place names in the title/objective (labelled “inferred from text”); otherwise the project is treated as national.</li>
      <li>A project spanning several dzongkhags is counted in each, but its money is not divided between them.</li>
      <li>US$ development-partner financing and Nu. government budgets are different things and are never added together.</li>
      <li>Weather is modelled for each dzongkhag’s headquarters town, not measured at a station.</li>
    </ul>
    <h2>Tenders and the e-GP portal</h2>
    <p>The Royal Government&apos;s <Ext href="https://www.egp.gov.bt/resources/common/TenderListing.jsp?h=t">e-GP portal</Ext> publishes no API, feed or export, and its tender page is a shell — the rows are fetched by the page&apos;s own script.
      DrukView makes that same request once a day and reads e-GP&apos;s <b>live register</b>: every tender currently out to bid (203 notices when last measured), not a sample of it. Closed, cancelled and archived notices are not read, so a notice drops out of DrukView once it closes.</p>
    <p>Each notice links to its own page on e-GP rather than to a search page, and e-GP publishes no estimated value in the register, so DrukView shows none rather than a guess.
      A notice is placed in a dzongkhag only when the procuring agency&apos;s own hierarchy names exactly one; a ministry&apos;s notice is national even where the work is plainly in one place.</p>
    <p>Because that response&apos;s shape is the whole agreement, the run is all-or-nothing: if the rows cannot be read, the previous notices stay published and the source is marked <b>stale</b> above — so a redesign at e-GP shows up here as a failed source rather than as an empty Tenders page.
      The Tenders page says which of the two it is, because &ldquo;nothing is out to bid here&rdquo; and &ldquo;we could not read e-GP&rdquo; are different claims and only one of them is about Bhutan.</p>
    <h2>When a source stops</h2>
    <p>A refresh that fails marks its source <b>stale</b> above and keeps the previous data. A refresh that never
      runs at all is harder to see — the status stays &ldquo;ok&rdquo; while the data quietly ages — so the age of each
      source&apos;s last success is checked daily against a {limitDays}-day limit. An overdue source is flagged on this page,
      reported to the maintainers, and made visible to outside monitoring at <code>/api/health</code>, which answers
      503 while any source is overdue. That last one matters most: it is the only check that still works if the
      scheduler running all of the above has itself stopped.</p>
    <h2>Not yet automated</h2>
    <p>Ministry of Finance, Home &amp; Cultural Affairs, Agriculture &amp; Livestock and other national budget reports are published as PDFs without an API. Office directories are likewise curated. Each such row cites its document and is validated before it can load.</p>
  </div>);
}
