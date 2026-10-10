'use client';
// Bhutan map: real dzongkhag boundaries bundled with the app (never depends on a data job), zoom / pan / pinch,
// and drill-down into the 205 gewogs of the selected dzongkhag (gewog shapes are loaded on first drill-down).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dzGeo from '@/geo/bhutan-dzongkhags.json';
import { classer } from '@/lib/format';

type Ring = number[][];
type DzFeature = { properties: { id: string; name: string; label: number[] }; geometry: { coordinates: Ring[] } };
type GwFeature = { properties: { name: string; dz: string; label: number[] }; geometry: { coordinates: Ring[] } };
type View = { x: number; y: number; w: number; h: number };

// Equirectangular projection scaled by cos(latitude): accurate enough for a country 3.5° wide.
const LAT0 = 27.4, K = Math.cos((LAT0 * Math.PI) / 180), W = 1000;
const DZ = (dzGeo as unknown as { features: DzFeature[] }).features;
const ext = (() => {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const f of DZ) for (const r of f.geometry.coordinates) for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, x1, y0, y1 };
})();
const SC = W / ((ext.x1 - ext.x0) * K);
const H = (ext.y1 - ext.y0) * SC;
const P = ([lon, lat]: number[]) => [(lon - ext.x0) * K * SC, (ext.y1 - lat) * SC];
const pathOf = (rings: Ring[]) => rings.map(r => 'M' + r.map(p => P(p).map(v => v.toFixed(1)).join(',')).join('L') + 'Z').join('');
const boundsOf = (rings: Ring[]) => {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const r of rings) for (const p of r) { const [x, y] = P(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, x1, y0, y1 };
};
const PAD = 12;
const BASE: View = { x: -PAD, y: -PAD, w: W + 2 * PAD, h: H + 2 * PAD };
const MAX_ZOOM = 14;
const areaOf = (b: { x0: number; x1: number; y0: number; y1: number }) => (b.x1 - b.x0) * (b.y1 - b.y0);
const DZ_SHAPES = DZ.map(f => { const b = boundsOf(f.geometry.coordinates); return { id: f.properties.id, name: f.properties.name, d: pathOf(f.geometry.coordinates), label: P(f.properties.label), b, area: areaOf(b) }; });

/** Hide names that would overlap at the current zoom (biggest shapes are named first); zooming in reveals the rest. */
function placeLabels<T extends { name: string; label: number[]; area: number }>(items: T[], fontPx: number, u: number, view: View, keep?: string): (T & { lx: number; ly: number })[] {
  const fs = fontPx * u, placed: { x0: number; x1: number; y0: number; y1: number }[] = [], out: (T & { lx: number; ly: number })[] = [];
  const order = [...items].sort((a, b) => (b.name === keep ? 1 : 0) - (a.name === keep ? 1 : 0) || b.area - a.area);
  for (const it of order) {
    const w = it.name.length * fs * 0.56 + fs * 0.4, h = fs * 1.15;
    // keep the whole name inside the visible map (labels near the edge are nudged inward)
    const lx = Math.min(view.x + view.w - w / 2 - fs * 0.2, Math.max(view.x + w / 2 + fs * 0.2, it.label[0])), ly = it.label[1];
    const r = { x0: lx - w / 2, x1: lx + w / 2, y0: ly - h / 2, y1: ly + h / 2 };
    if (placed.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)) continue;
    placed.push(r); out.push({ ...it, lx, ly });
  }
  return out;
}

let gewogCache: Promise<GwFeature[]> | null = null;
const loadGewogs = () => (gewogCache ??= fetch('/geo/bhutan-gewogs.json').then(r => r.json()).then(j => j.features as GwFeature[]).catch(e => { gewogCache = null; throw e; }));

/** Keep the view inside the map and at a sensible zoom, preserving the map's aspect ratio. */
function clampView(v: View): View {
  const w = Math.min(BASE.w, Math.max(BASE.w / MAX_ZOOM, v.w)), h = w * (BASE.h / BASE.w);
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  const x = Math.min(BASE.x + BASE.w - w, Math.max(BASE.x, cx - w / 2));
  const y = Math.min(BASE.y + BASE.h - h, Math.max(BASE.y, cy - h / 2));
  return { x, y, w, h };
}
function fitTo(b: { x0: number; x1: number; y0: number; y1: number }): View {
  const pad = 0.12, bw = (b.x1 - b.x0) * (1 + 2 * pad), bh = (b.y1 - b.y0) * (1 + 2 * pad);
  const w = Math.max(bw, bh * (BASE.w / BASE.h));
  return clampView({ x: (b.x0 + b.x1) / 2 - w / 2, y: (b.y0 + b.y1) / 2 - (w * BASE.h / BASE.w) / 2, w, h: w * BASE.h / BASE.w });
}

export default function MapView({ values, format, selected, onSelect, gewogValues, formatGewog, selectedGewog, onGewog }: {
  values: Record<string, number>; format: (id: string, v: number) => string; selected: string | null; onSelect: (id: string | null) => void;
  gewogValues?: Record<string, number>; formatGewog?: (name: string, v: number | undefined) => string; selectedGewog?: string; onGewog?: (name: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(BASE);
  const viewRef = useRef(view); viewRef.current = view;
  const [px, setPx] = useState(800);
  const [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null);
  const [gewogs, setGewogs] = useState<GwFeature[] | null>(null);
  const [gewogError, setGewogError] = useState(false);
  const anim = useRef<number | null>(null);
  const cls = useMemo(() => classer(Object.values(values)), [values]);
  const gcls = useMemo(() => classer(Object.values(gewogValues ?? {})), [gewogValues]);

  // rendered width → map units per screen pixel (keeps labels and strokes a constant on-screen size)
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setPx(e.contentRect.width || 800)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const u = view.w / px;

  const animateTo = useCallback((target: View) => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = viewRef.current, t0 = performance.now(), dur = 380;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setView(target); return; }
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setView({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e });
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  // drill-down: zoom to the selected dzongkhag and load gewogs
  useEffect(() => {
    if (!selected) { animateTo(BASE); return; }
    const s = DZ_SHAPES.find(d => d.id === selected); if (s) animateTo(fitTo(s.b));
    loadGewogs().then(setGewogs, () => setGewogError(true));
  }, [selected, animateTo]);

  const zoomAround = useCallback((factor: number, cx?: number, cy?: number) => {
    const v = viewRef.current, x = cx ?? v.x + v.w / 2, y = cy ?? v.y + v.h / 2, w = v.w / factor, h = v.h / factor;
    setView(clampView({ x: x - (x - v.x) / factor, y: y - (y - v.y) / factor, w, h }));
  }, []);
  const toMap = (clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect(), v = viewRef.current;
    return [v.x + ((clientX - r.left) / r.width) * v.w, v.y + ((clientY - r.top) / r.height) * v.h];
  };

  // ctrl/⌘ + wheel (also trackpad pinch) zooms; a plain wheel keeps scrolling the page
  useEffect(() => {
    const el = svg.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const [mx, my] = toMap(e.clientX, e.clientY);
      zoomAround(Math.exp(-e.deltaY * 0.0025), mx, my);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  // drag to pan (once zoomed), two-finger pinch to zoom
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const zoomed = view.w < BASE.w * 0.995;
  const onPointerDown = (e: React.PointerEvent) => { ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved.current = 0; };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId); if (!prev) return;
    const r = svg.current!.getBoundingClientRect(), v = viewRef.current;
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const other = a === prev ? b : a;
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (d0 > 0) { const [mx, my] = toMap((e.clientX + other.x) / 2, (e.clientY + other.y) / 2); zoomAround(d1 / d0, mx, my); }
      moved.current += 10;
    } else if (zoomed) {
      const dx = ((e.clientX - prev.x) / r.width) * v.w, dy = ((e.clientY - prev.y) / r.height) * v.h;
      moved.current += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
      if (moved.current > 4) setView(clampView({ ...v, x: v.x - dx, y: v.y - dy }));
    }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); };
  const clickable = () => moved.current <= 4; // a drag is not a click

  const showTip = (e: React.MouseEvent, t: string) => {
    const r = wrap.current!.getBoundingClientRect();
    setTip({ x: e.clientX - r.left + 12, y: e.clientY - r.top + 12, t });
  };

  const gw = useMemo(() => (gewogs && selected ? gewogs.filter(g => g.properties.dz === selected).map(g => { const b = boundsOf(g.geometry.coordinates); return { name: g.properties.name, d: pathOf(g.geometry.coordinates), label: P(g.properties.label), area: areaOf(b) }; }) : []), [gewogs, selected]);
  const dzLabels = useMemo(() => placeLabels(DZ_SHAPES, 12, u, view), [u, view]);
  const gwLabels = useMemo(() => placeLabels(gw, 10.5, u, view, selectedGewog), [gw, u, view, selectedGewog]);
  const sel = DZ_SHAPES.find(d => d.id === selected);

  return (
    <div className="mapwrap" ref={wrap}>
      <div className="mapctl" role="group" aria-label="Map zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAround(1.6)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAround(1 / 1.6)}>−</button>
        <button type="button" aria-label="Reset view" onClick={() => (selected ? onSelect(null) : animateTo(BASE))}>⟲</button>
      </div>
      {sel ? <button type="button" className="mapback" onClick={() => onSelect(null)}>← All of Bhutan</button> : null}
      <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="group" aria-label={sel ? `Map of ${sel.name} and its gewogs` : "Map of Bhutan's 20 dzongkhags"}
        style={{ touchAction: zoomed ? 'none' : 'pan-y', cursor: zoomed ? 'grab' : 'default' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={() => setTip(null)}>
        <g>
          {DZ_SHAPES.map(s => {
            const v = values[s.id] ?? 0, isSel = s.id === selected;
            const label = `${s.name}: ${format(s.id, v)}`;
            const pick = () => { if (clickable()) onSelect(isSel ? null : s.id); };
            return (
              <path key={s.id} d={s.d} className={`shape q${cls(v)}${isSel ? ' sel' : ''}${selected && !isSel ? ' dim' : ''}`} strokeWidth={(isSel ? 2.4 : 1.1) * u}
                tabIndex={0} role="button" aria-label={label} aria-pressed={isSel}
                onClick={pick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(isSel ? null : s.id); } }}
                onMouseMove={e => showTip(e, label)} onMouseLeave={() => setTip(null)} />
            );
          })}
        </g>
        {gw.length ? (
          <g aria-label="Gewogs">
            {gw.map(g => {
              const key = g.name.toLowerCase(), v = gewogValues?.[key];
              const label = formatGewog ? formatGewog(g.name, v) : `${g.name} Gewog`;
              const isSel = selectedGewog?.toLowerCase() === key;
              return (
                <path key={g.name} d={g.d} className={`gewog g${gcls(v ?? 0)}${isSel ? ' sel' : ''}`} strokeWidth={(isSel ? 2 : 0.8) * u}
                  tabIndex={0} role="button" aria-label={label} aria-pressed={isSel}
                  onClick={() => { if (clickable() && onGewog) onGewog(g.name); }}
                  onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && onGewog) { e.preventDefault(); onGewog(g.name); } }}
                  onMouseMove={e => showTip(e, label)} onMouseLeave={() => setTip(null)} />
              );
            })}
          </g>
        ) : null}
        <g className="labels" aria-hidden="true">
          {gw.length
            ? gwLabels.map(g => <text key={g.name} x={g.lx} y={g.ly} fontSize={10.5 * u} strokeWidth={3 * u} textAnchor="middle" dominantBaseline="middle">{g.name}</text>)
            : dzLabels.map(s => <text key={s.id} x={s.lx} y={s.ly} fontSize={12 * u} strokeWidth={3 * u} textAnchor="middle" dominantBaseline="middle">{s.name}</text>)}
        </g>
      </svg>
      <div className="legend">Less {[0, 1, 2, 3, 4, 5].map(i => <i key={i} style={{ background: `var(--q${i})` }} />)} More · grey = no figures</div>
      <p className="note">
        {sel ? (gewogError ? 'Gewog boundaries could not be loaded; showing the dzongkhag only. ' : `${gw.length || '…'} gewogs of ${sel.name}. Click a gewog to filter its budget lines. `) : 'Click a dzongkhag to open its budget and gewogs. Zoom with + / −, Ctrl + scroll or pinch; drag to move when zoomed. '}
        Boundaries: OCHA/HDX via geoBoundaries (CC BY 3.0 IGO); no legal or political meaning. Projects shared by several dzongkhags are counted in each; their money is not split.
      </p>
      {tip ? <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.t}</div> : null}
    </div>
  );
}
