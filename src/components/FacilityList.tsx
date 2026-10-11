'use client';
import { useMemo, useState } from 'react';
import { num } from '@/lib/format';

export type FacilityRow = { name: string; type: string; typeLabel: string; beds: number | null; dz: string; dzHref: string; nameInSource?: string };

/** Searchable, filterable facility directory (works for one dzongkhag or the whole country). */
export default function FacilityList({ rows, types, showDz, initialType = '', hideBeds = false }: { rows: FacilityRow[]; types: [string, string][]; showDz: boolean; initialType?: string; hideBeds?: boolean }) {
  const [q, setQ] = useState(''); const [t, setT] = useState(initialType);
  const view = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => (!t || r.type === t) && (!s || `${r.name} ${r.dz} ${r.nameInSource ?? ''}`.toLowerCase().includes(s)));
  }, [rows, q, t]);
  return (<>
    <div className="filters">
      <label>Type<select value={t} onChange={e => setT(e.target.value)}><option value="">All ({num(rows.length)})</option>
        {types.map(([k, l]) => <option key={k} value={k}>{l} ({num(rows.filter(r => r.type === k).length)})</option>)}</select></label>
      <label className="grow">Search<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={showDz ? 'Name or dzongkhag…' : 'Name…'} /></label>
    </div>
    <p className="note" aria-live="polite">{view.length === rows.length ? `${num(rows.length)} listed` : `${num(view.length)} of ${num(rows.length)} match`}</p>
    {view.length ? <div className="scroll"><table><thead><tr><th>Name</th><th>Type</th>{showDz ? <th>Dzongkhag</th> : null}{hideBeds ? null : <th>Official beds</th>}</tr></thead><tbody>
      {view.map((r, i) => <tr key={i}><td>{r.name}{r.nameInSource ? <small title="Spelling printed in the source"> (printed: {r.nameInSource})</small> : null}</td><td>{r.typeLabel}</td>
        {showDz ? <td><a href={r.dzHref}>{r.dz}</a></td> : null}{hideBeds ? null : <td className="num">{r.beds ?? '–'}</td>}</tr>)}</tbody></table></div>
      : <div className="empty">Nothing matches “{q}”.</div>}
  </>);
}
