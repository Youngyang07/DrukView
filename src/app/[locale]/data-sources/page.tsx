import LoadData from '@/components/LoadData';
import { Ext, Fresh, NoDatabase } from '@/components/ui';
import { ago } from '@/lib/format';
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
    <h2>How to read the numbers</h2>
    <ul>
      <li>“Committed” is what a funder agreed to provide, not what has been spent. “Disbursed” is shown only when the source reports it.</li>
      <li>Location comes from the source’s location fields; otherwise from place names in the title/objective (labelled “inferred from text”); otherwise the project is treated as national.</li>
      <li>A project spanning several dzongkhags is counted in each, but its money is not divided between them.</li>
      <li>US$ development-partner financing and Nu. government budgets are different things and are never added together.</li>
      <li>Weather is modelled for each dzongkhag’s headquarters town, not measured at a station.</li>
    </ul>
    <h2>Not yet automated</h2>
    <p>Ministry of Finance, Home & Cultural Affairs, Agriculture & Livestock and other national budget reports are published as PDFs without an API. Tenders and office directories are likewise curated. Each such row cites its document and is validated before it can load.</p>
  </div>);
}
