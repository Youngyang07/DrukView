import { NoDatabase } from '@/components/ui';
import { ago } from '@/lib/format';
import { dbReady, getUpdateLog } from '@/server/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Update log' };

export default async function Updates() {
  const ready = await dbReady(); const log = ready ? await getUpdateLog() : [];
  return (<div className="wrap page"><h1 className="pagetitle">Update log</h1>
    <p>Every collector run, successful or not.</p>{!ready ? <NoDatabase /> : null}
    {ready && !log.length ? <div className="empty">No collector run has been recorded yet.</div> : null}
    {log.length ? <div className="card scroll"><table><thead><tr><th>When</th><th>Job</th><th>Result</th><th>Records</th><th>Message</th></tr></thead><tbody>
      {log.map((l, i) => <tr key={i}><td className="nw" title={l.at}>{ago(l.at)}</td><td>{l.job}</td><td><span className={`badge ${l.status === 'ok' ? 'b-ok' : 'b-error'}`}>{l.status}</span></td><td className="num">{l.records}</td><td>{l.message}</td></tr>)}</tbody></table></div> : null}
  </div>);
}
