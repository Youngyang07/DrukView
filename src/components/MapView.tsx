'use client';
import { useMemo, useState } from 'react';
import { classer } from '@/lib/format';

export type MapDz = { id: string; name: string; col: number; row: number };
type Geo = { features: { properties: { dzongkhag_id: string }; geometry: { type: string; coordinates: any } }[] } | null;

function geoLayout(geo: NonNullable<Geo>) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const walk = (c: any, f: (p: number[]) => void) => (Array.isArray(c[0]) ? c.forEach((x: any) => walk(x, f)) : f(c));
  for (const ft of geo.features) walk(ft.geometry.coordinates, ([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
  const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180), W = 1000, sc = W / ((maxX - minX) * k), H = (maxY - minY) * sc;
  const pt = ([x, y]: number[]) => `${((x - minX) * k * sc).toFixed(1)},${((maxY - y) * sc).toFixed(1)}`;
  const ring = (r: number[][]) => 'M' + r.map(pt).join('L') + 'Z';
  const path = (g: any) => g.type === 'Polygon' ? g.coordinates.map(ring).join('') : g.type === 'MultiPolygon' ? g.coordinates.flatMap((p: number[][][]) => p.map(ring)).join('') : '';
  const centre = (g: any) => { let sx = 0, sy = 0, n = 0; walk(g.coordinates, ([x, y]) => { sx += x; sy += y; n++; }); return pt([sx / n, sy / n]).split(',').map(Number); };
  return { W, H, shapes: geo.features.map(f => ({ id: f.properties.dzongkhag_id, d: path(f.geometry), c: centre(f.geometry) })) };
}

export default function MapView({ geo, dz, values, format, selected, onSelect }: {
  geo: Geo; dz: MapDz[]; values: Record<string, number>; format: (id: string, v: number) => string; selected: string | null; onSelect: (id: string | null) => void;
}) {
  const byId = useMemo(() => Object.fromEntries(dz.map(d => [d.id, d])), [dz]);
  const cls = useMemo(() => classer(Object.values(values)), [values]);
  const [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null);
  const layout = useMemo(() => (geo?.features.length ? geoLayout(geo) : null), [geo]);
  const cw = 96, ch = 78;
  const shapes = layout ? layout.shapes.filter(s => byId[s.id]) : dz.map(d => ({ id: d.id, d: '', c: [0, 0] as number[] }));
  const viewBox = layout ? `0 0 ${layout.W} ${layout.H.toFixed(0)}` : `0 0 ${10 * cw + 8} ${4 * ch + 8}`;

  return (
    <div className="mapwrap">
      <svg viewBox={viewBox} role="group" aria-label="Map of Bhutan's 20 dzongkhags">
        {shapes.map(s => {
          const d = byId[s.id]; const v = values[s.id] ?? 0;
          const label = `${d.name}: ${format(s.id, v)}`;
          const pick = () => onSelect(selected === s.id ? null : s.id);
          const tx = layout ? s.c[0] : 4 + d.col * cw + (cw - 6) / 2, ty = layout ? s.c[1] : 4 + d.row * ch + (ch - 6) / 2 + 4;
          const parts = layout ? [d.name] : d.name.split(' ');
          const common = {
            className: `shape q${cls(v)}${selected === s.id ? ' sel' : ''}`, tabIndex: 0, role: 'button', 'aria-label': label, 'aria-pressed': selected === s.id,
            onClick: pick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } },
            onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX + 12, y: e.clientY + 12, t: label }), onMouseLeave: () => setTip(null),
          };
          return (
            <g key={s.id}>
              {layout ? <path d={s.d} {...common} /> : <rect x={4 + d.col * cw} y={4 + d.row * ch} width={cw - 6} height={ch - 6} rx={8} {...common} />}
              <text textAnchor="middle">{parts.map((w, i) => <tspan key={i} x={tx} y={ty + (i - (parts.length - 1) / 2) * 13}>{w}</tspan>)}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend">Less {[0, 1, 2, 3, 4, 5].map(i => <i key={i} style={{ background: `var(--q${i})` }} />)} More · grey = no figures</div>
      <p className="note">{layout ? 'Boundaries: geoBoundaries (open data).' : 'Schematic tile map (not to scale) — boundary data has not been fetched yet.'} Projects shared by several dzongkhags are counted in each; their money is not split, only attributed to single-dzongkhag projects.</p>
      {tip ? <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.t}</div> : null}
    </div>
  );
}
