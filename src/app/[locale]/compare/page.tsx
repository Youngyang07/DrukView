import Link from 'next/link';
import { Fresh, NoDatabase } from '@/components/ui';
import { money, num } from '@/lib/format';
import { dbReady, freshness, getDzongkhags, getWeatherSummary, mapMetrics } from '@/server/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Compare dzongkhags' };

export default async function Compare({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ d?: string | string[] }> }) {
  const { locale } = await params; const sp = await searchParams;
  if (!(await dbReady())) return <div className="wrap page"><NoDatabase /></div>;
  const [dz, mm, wx, fr] = await Promise.all([getDzongkhags(), mapMetrics(), getWeatherSummary(), freshness()]);
  const chosen = new Set((Array.isArray(sp.d) ? sp.d : sp.d ? [sp.d] : []).slice(0, 6));
  const sel = dz.filter(d => chosen.has(d.slug));
  const M = Object.fromEntries(mm.map(m => [m.id, m])), W = Object.fromEntries(wx.map(w => [w.id, w]));
  return (<div className="wrap page"><h1 className="pagetitle">Compare dzongkhags</h1>
    <form method="get" className="card"><fieldset className="chk"><legend>Pick up to 6</legend>{dz.map(d => <label key={d.id}><input type="checkbox" name="d" value={d.slug} defaultChecked={chosen.has(d.slug)} /> {d.name}</label>)}</fieldset><button type="submit">Compare</button></form>
    {sel.length ? <div className="card scroll"><table><thead><tr><th>Measure</th>{sel.map(d => <th key={d.id}><Link href={`/${locale}/${d.slug}`}>{d.name}</Link></th>)}</tr></thead><tbody>
      <tr><td>Projects located here</td>{sel.map(d => <td key={d.id} className="num">{num(M[d.id]?.n ?? 0)}</td>)}</tr>
      <tr><td>Committed US$ (single-dzongkhag projects)</td>{sel.map(d => <td key={d.id} className="num">{M[d.id]?.usd ? money(M[d.id].usd, 'USD') : 'n/a'}</td>)}</tr>
      <tr><td>Published budget allocations (Nu.)</td>{sel.map(d => <td key={d.id} className="num">{M[d.id]?.btn ? money(M[d.id].btn, 'BTN') : 'n/a'}</td>)}</tr>
      <tr><td>Rain, last 14 days</td>{sel.map(d => <td key={d.id} className="num">{W[d.id]?.precip14 == null ? 'n/a' : `${W[d.id].precip14!.toFixed(1)} mm`}</td>)}</tr></tbody></table>
      <p className="note">Absolute amounts are not per-person: DrukView does not yet carry population figures, so do not read bigger as better or worse. <Fresh at={fr.projects} /></p></div> : <p className="note">Choose at least one dzongkhag above.</p>}
  </div>);
}
