import LoadData from '@/components/LoadData';
import { Ext, Fresh, NoDatabase } from '@/components/ui';
import { ago } from '@/lib/format';
import { REFERENCE_SOURCES } from '@/lib/reference';
import { dbReady, getSources } from '@/server/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Data sources' };

export default async function DataSources() {
  const ready = await dbReady(); const src = ready ? await getSources() : [];
  return (<div className="wrap page"><h1 className="pagetitle">Data sources</h1>
    <p>Everything on DrukView comes from the sources below. Automated sources refresh on a schedule; if one fails, its last good data stays visible and is marked <b>stale</b> — it is never silently wiped or replaced with estimates.</p>
    {!ready ? <NoDatabase /> : <LoadData />}
    {ready && !src.length ? <div className="empty">No source has been loaded yet — press <b>Load / refresh data now</b> above.</div> : null}
    {src.length ? <div className="card scroll"><table><thead><tr><th>Source</th><th>Status</th><th>Last success</th><th>Records</th><th>Notes</th></tr></thead><tbody>
      {src.map(s => <tr key={s.id}><td><Ext href={s.url}>{s.name}</Ext></td><td><span className={`badge b-${s.status}`}>{s.status.replace('_', ' ')}</span></td><td><Fresh at={s.last_success} label="" /> <small>(tried {ago(s.last_attempt)})</small></td><td className="num">{s.records}</td>
        <td>{s.notes}{s.error ? <div className="note">Last error: {s.error}</div> : null}</td></tr>)}</tbody></table></div> : null}
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
    <p>The Royal Government&apos;s <Ext href="https://www.egp.gov.bt/resources/common/TenderListing.jsp?h=t">e-GP portal</Ext> publishes no API, feed or export: its tender list is a page whose results are filled in by posting its own search form.
      DrukView therefore reads that page the way a browser does, once a day, and shows the notices it finds. Because that page&apos;s layout is the whole agreement, the run is all-or-nothing — if the table cannot be read,
      the previous notices stay published and the source is marked stale, so a redesign at e-GP shows up here as a stale source rather than as missing or invented notices. e-GP lists live tenders only, and prints no estimated value, so DrukView shows none.</p>
    <h2>Not yet automated</h2>
    <p>Ministry of Finance, Home &amp; Cultural Affairs, Agriculture &amp; Livestock and other national budget reports are published as PDFs without an API. Office directories are likewise curated. Each such row cites its document and is validated before it can load.</p>
  </div>);
}
