'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const JOBS = [
  ['manual', 'Curated budget CSVs'], ['worldbank', 'World Bank projects'], ['adb', 'ADB projects'],
  ['boundaries', 'Dzongkhag map'], ['weather', 'Weather'],
] as const;
type Line = { job: string; label: string; state: 'waiting' | 'running' | 'ok' | 'skipped' | 'error'; text: string };

export default function LoadData() {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const ls: Line[] = JOBS.map(([job, label]) => ({ job, label, state: 'waiting', text: '' }));
    setLines([...ls]);
    for (const l of ls) {
      l.state = 'running'; setLines([...ls]);
      try {
        const r = await fetch(`/api/cron/${l.job}`, { cache: 'no-store' });
        const b = await r.json().catch(() => ({}));
        if (r.ok) { l.state = 'ok'; l.text = `${b.records ?? 0} records loaded`; }
        else if (r.status === 429) { l.state = 'skipped'; l.text = b.message ?? 'Refreshed recently'; }
        else { l.state = 'error'; l.text = b.message ?? b.error ?? `HTTP ${r.status}`; }
      } catch (e) { l.state = 'error'; l.text = (e as Error).message; }
      setLines([...ls]);
    }
    setBusy(false);
    router.refresh();
  }
  const icon = { waiting: '·', running: '…', ok: '✓', skipped: '↻', error: '✗' };
  return (
    <div className="card loaddata">
      <div className="card-h"><h2>Load or refresh data</h2>
        <button type="button" onClick={run} disabled={busy}>{busy ? 'Loading… (about a minute)' : 'Load / refresh data now'}</button></div>
      <p className="note">Fetches the latest public data from every source. Each source can be refreshed at most every few hours; it also refreshes automatically every day.</p>
      {lines.length ? <ul className="plist">{lines.map(l => (
        <li key={l.job}><span className={`badge b-${l.state === 'ok' ? 'ok' : l.state === 'error' ? 'error' : l.state === 'skipped' ? 'stale' : 'not_run'}`}>{icon[l.state]} {l.state}</span> <b>{l.label}</b>{l.text ? ` — ${l.text}` : ''}</li>))}</ul> : null}
    </div>
  );
}
