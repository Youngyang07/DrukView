// DrukView front end. No dependencies. All external text is inserted via textContent (never innerHTML).
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.setAttribute('style', v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const clear = el => { el.replaceChildren(); return el; };
const safeUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch { return null; } };
const ext = (href, text) => { const u = safeUrl(href); return u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, text) : text; };

// ---------- formatting ----------
const SYM = { BTN: 'Nu.', USD: 'US$', INR: '₹' };
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en');
const money = (n, cur) => n === null || n === undefined ? 'n/a' : `${SYM[cur] ?? cur + ' '}${compact.format(n)}`;
const moneyFull = (n, cur) => n === null || n === undefined ? 'amount not reported' : `${SYM[cur] ?? cur + ' '}${full.format(Math.round(n))}`;
const STATUS = { active: 'Active', completed: 'Completed', pipeline: 'Pipeline', cancelled: 'Cancelled', suspended: 'Suspended', unknown: 'Unknown' };
const ago = iso => {
  if (!iso) return 'never';
  const d = (Date.now() - new Date(iso)) / 864e5;
  return d < 1 ? 'today' : d < 2 ? 'yesterday' : `${Math.floor(d)} days ago`;
};
const PALETTE = ['#8a1c2b', '#ffb400', '#2f6f8f', '#5c8a3c', '#9b5fc0', '#c2552b', '#4a4a4a', '#c0397a'];

// ---------- state ----------
const S = { dz: [], dzById: {}, projects: [], budget: [], alloc: [], sources: [], geo: null, generated: null,
  f: { funder: '', status: '', sector: '', year: '', q: '' }, metric: 'usd', sel: null, tab: 'map', sort: { key: 'amount_committed', dir: -1 } };

async function load() {
  const j = async (p, fb) => { try { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw 0; return await r.json(); } catch { return fb; } };
  const [dz, pr, bu, al, so, geo] = await Promise.all([
    j('shared/dzongkhags.json', { dzongkhags: [] }), j('data/projects.json', { records: [] }), j('data/budget.json', { records: [] }),
    j('data/allocations.json', { records: [] }), j('data/sources.json', { sources: [] }), j('data/bhutan-dzongkhags.geojson', null)]);
  S.dz = dz.dzongkhags; S.dzById = Object.fromEntries(S.dz.map(d => [d.id, d]));
  S.projects = pr.records; S.budget = bu.records; S.alloc = al.records; S.sources = so.sources; S.generated = pr.generated_at ?? so.generated_at;
  S.geo = geo && geo.features?.length ? geo : null;
}

// ---------- filtering & aggregation ----------
const yearOf = p => (p.start_date ? +p.start_date.slice(0, 4) : null);
function filtered() {
  const { funder, status, sector, year, q } = S.f, needle = q.trim().toLowerCase();
  return S.projects.filter(p =>
    (!funder || p.funder === funder) && (!status || p.status === status) && (!sector || p.sector === sector) &&
    (!year || (yearOf(p) ?? 0) >= +year) &&
    (!needle || [p.title, p.implementing_agency, p.sector, p.description, ...p.locations.map(l => S.dzById[l.dzongkhag]?.name)].filter(Boolean).join(' ').toLowerCase().includes(needle)));
}
function aggregate(list) {
  const by = Object.fromEntries(S.dz.map(d => [d.id, { n: 0, usd: 0, single: 0, items: [] }]));
  let national = 0;
  for (const p of list) {
    const ids = [...new Set(p.locations.map(l => l.dzongkhag))];
    if (!ids.length) { national++; continue; }
    for (const id of ids) { const a = by[id]; if (!a) continue; a.n++; a.items.push(p); }
    if (ids.length === 1 && p.currency === 'USD' && p.amount_committed) { by[ids[0]].usd += p.amount_committed; by[ids[0]].single++; }
  }
  return { by, national };
}
const allocBy = id => S.alloc.filter(a => a.dzongkhag === id);
const sumBy = (rows, keyFn, valFn) => { const m = new Map(); for (const r of rows) { const k = keyFn(r); m.set(k, (m.get(k) ?? 0) + (valFn(r) ?? 0)); } return [...m].sort((a, b) => b[1] - a[1]); };

// ---------- banners / KPIs ----------
function renderBanner() {
  const b = clear($('#banner'));
  const none = !S.projects.length && !S.budget.length && !S.alloc.length;
  if (none) b.append(h('div', { class: 'banner info' }, h('b', {}, 'No data has been loaded yet'),
    'DrukView only shows figures pulled from its published sources – nothing is estimated or sample data. The automated update (World Bank, ADB, boundaries) runs on a schedule in GitHub Actions; trigger it from the Actions tab or run ',
    h('code', {}, 'npm run update'), ' where those sites are reachable. See ', h('a', { href: '#data' }, 'Data & sources'), ' for each source’s status.'));
  const bad = S.sources.filter(s => s.status === 'stale' || s.status === 'error');
  if (bad.length && !none) b.append(h('div', { class: 'banner warn' }, h('b', {}, 'Some sources could not be refreshed'),
    bad.map(s => `${s.name}: ${s.status === 'stale' ? 'showing data from ' + ago(s.last_success) : 'no data yet'}. `)));
  const f = $('#fresh'); f.textContent = S.generated ? `Data refreshed ${ago(S.generated)}` : 'No data loaded yet';
}
function renderKpis(list) {
  const k = clear($('#kpis'));
  const n = s => list.filter(p => p.status === s).length;
  const usd = list.filter(p => p.currency === 'USD').reduce((a, p) => a + (p.amount_committed ?? 0), 0);
  const tiles = [['Projects tracked', full.format(list.length), `${full.format(S.projects.length)} in total`],
    ['Active', full.format(n('active')), 'under implementation'], ['Completed', full.format(n('completed')), 'closed projects'],
    ['Committed (USD)', money(usd, 'USD'), 'development-partner financing'],
    ['Funders', String(new Set(list.map(p => p.funder)).size), 'in current view']];
  for (const [t, v, s] of tiles) k.append(h('div', { class: 'kpi' }, h('small', {}, t), h('b', {}, v), h('span', {}, s)));
}

// ---------- filters ----------
function initFilters() {
  const fill = (sel, vals) => { for (const v of [...new Set(vals.filter(Boolean))].sort()) $(sel).append(h('option', { value: v }, v)); };
  fill('#f-funder', S.projects.map(p => p.funder)); fill('#f-sector', S.projects.map(p => p.sector));
  const ys = [...new Set(S.projects.map(yearOf).filter(Boolean))].sort((a, b) => b - a);
  for (const y of ys) $('#f-year').append(h('option', { value: y }, y));
  const bind = (id, key) => $(id).addEventListener(key === 'q' ? 'input' : 'change', e => { S.f[key] = e.target.value; render(); });
  bind('#f-funder', 'funder'); bind('#f-status', 'status'); bind('#f-sector', 'sector'); bind('#f-year', 'year'); bind('#f-q', 'q');
  $('#f-reset').addEventListener('click', () => { S.f = { funder: '', status: '', sector: '', year: '', q: '' }; for (const e of document.querySelectorAll('#filters select,#filters input')) e.value = ''; render(); });
  const m = $('#metric');
  m.append(h('option', { value: 'usd' }, 'Committed US$ (single-dzongkhag projects)'), h('option', { value: 'count' }, 'Number of projects'));
  if (S.alloc.length) m.append(h('option', { value: 'alloc' }, 'Budget allocation (BTN, curated)'));
  m.addEventListener('change', e => { S.metric = e.target.value; renderMap(); });
}

// ---------- map ----------
function project(geo) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const walk = (c, f) => Array.isArray(c[0]) ? c.forEach(x => walk(x, f)) : f(c);
  for (const ft of geo.features) walk(ft.geometry.coordinates, ([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
  const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180), W = 1000, sc = W / ((maxX - minX) * k), H = (maxY - minY) * sc;
  const pt = ([x, y]) => `${((x - minX) * k * sc).toFixed(1)},${((maxY - y) * sc).toFixed(1)}`;
  const ring = r => 'M' + r.map(pt).join('L') + 'Z';
  const path = g => g.type === 'Polygon' ? g.coordinates.map(ring).join('') : g.type === 'MultiPolygon' ? g.coordinates.flatMap(p => p.map(ring)).join('') : '';
  const centre = g => { let sx = 0, sy = 0, n = 0; walk(g.coordinates, ([x, y]) => { sx += x; sy += y; n++; }); return pt([sx / n, sy / n]).split(',').map(Number); };
  return { W, H, path, centre };
}
function metricValue(id, agg) {
  if (S.metric === 'count') return agg.by[id].n;
  if (S.metric === 'alloc') return allocBy(id).filter(a => a.currency === 'BTN').reduce((s, a) => s + (a.amount ?? 0), 0);
  return agg.by[id].usd;
}
function classer(values) {
  const v = values.filter(x => x > 0).sort((a, b) => a - b);
  if (!v.length) return () => 0;
  const cut = [1, 2, 3, 4].map(i => v[Math.min(v.length - 1, Math.floor(i * v.length / 5))]);
  return x => x <= 0 ? 0 : 1 + cut.filter(c => x > c).length;
}
function renderMap() {
  const list = filtered(), agg = aggregate(list);
  const vals = Object.fromEntries(S.dz.map(d => [d.id, metricValue(d.id, agg)]));
  const cls = classer(Object.values(vals));
  const fmt = v => S.metric === 'count' ? full.format(v) : money(v, S.metric === 'alloc' ? 'BTN' : 'USD');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const shapes = [];
  if (S.geo) {
    const P = project(S.geo); svg.setAttribute('viewBox', `0 0 ${P.W} ${P.H.toFixed(0)}`);
    for (const ft of S.geo.features) { const id = ft.properties.dzongkhag_id; shapes.push({ id, d: P.path(ft.geometry), c: P.centre(ft.geometry) }); }
  } else {
    const cw = 96, ch = 78; svg.setAttribute('viewBox', `0 0 ${10 * cw + 8} ${4 * ch + 8}`);
    for (const d of S.dz) shapes.push({ id: d.id, x: 4 + d.grid[0] * cw, y: 4 + d.grid[1] * ch, w: cw - 6, h: ch - 6 });
  }
  for (const s of shapes) {
    const d = S.dzById[s.id]; if (!d) continue;
    const g = document.createElementNS(NS, 'g');
    const shp = document.createElementNS(NS, s.d ? 'path' : 'rect');
    if (s.d) shp.setAttribute('d', s.d); else { shp.setAttribute('x', s.x); shp.setAttribute('y', s.y); shp.setAttribute('width', s.w); shp.setAttribute('height', s.h); shp.setAttribute('rx', 8); }
    shp.setAttribute('class', `shape q${cls(vals[s.id])}${S.sel === s.id ? ' sel' : ''}`);
    shp.setAttribute('tabindex', '0'); shp.setAttribute('role', 'button');
    const label = `${d.name}: ${agg.by[s.id].n} projects, ${vals[s.id] > 0 ? fmt(vals[s.id]) : 'no figures'}`;
    shp.setAttribute('aria-label', label);
    const pick = () => { S.sel = S.sel === s.id ? null : s.id; location.hash = S.sel ? `map/${S.sel}` : 'map'; };
    shp.addEventListener('click', pick); shp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    const tip = $('#tip');
    shp.addEventListener('mousemove', e => { tip.hidden = false; tip.textContent = label; tip.style.left = e.clientX + 12 + 'px'; tip.style.top = e.clientY + 12 + 'px'; });
    shp.addEventListener('mouseleave', () => { tip.hidden = true; });
    g.append(shp);
    const tx = document.createElementNS(NS, 'text'), cx = s.d ? s.c[0] : s.x + s.w / 2, parts = s.d ? [d.name] : d.name.split(' ');
    tx.setAttribute('text-anchor', 'middle');
    parts.forEach((w, i) => { const t = document.createElementNS(NS, 'tspan'); t.textContent = w; t.setAttribute('x', cx); t.setAttribute('y', (s.d ? s.c[1] : s.y + s.h / 2 + 4) + (i - (parts.length - 1) / 2) * 13); tx.append(t); });
    g.append(tx); svg.append(g);
  }
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Bhutan dzongkhags');
  clear($('#map')).append(svg);
  const lg = clear($('#legend')); lg.append('Less ');
  for (let i = 0; i <= 5; i++) lg.append(h('i', { class: `q${i}`, style: `background:var(--q${i})`, title: i ? '' : 'No figures' }));
  lg.append(' More · grey = no figures');
  $('#map-note').textContent = S.geo ? 'Boundaries: geoBoundaries (open data). Projects shared by several dzongkhags are counted in each, but their money is not split – it is only attributed to single-dzongkhag projects.'
    : 'Schematic tile map (not to scale): boundary data has not been fetched yet, so each dzongkhag is a tile roughly west→east. Projects shared by several dzongkhags are counted in each; money is only attributed to single-dzongkhag projects.';
  renderPanel(list, agg);
}

function stackedBar(parts, fmt) {
  const total = parts.reduce((s, p) => s + p[1], 0) || 1;
  const bar = h('div', { class: 'bar', role: 'img', 'aria-label': parts.map(p => `${p[0]} ${fmt(p[1])}`).join(', ') },
    parts.map((p, i) => h('span', { style: `width:${(p[1] / total * 100).toFixed(2)}%;background:${PALETTE[i % PALETTE.length]}`, title: `${p[0]}: ${fmt(p[1])}` })));
  const key = h('div', { class: 'note' }, parts.map((p, i) => h('span', { style: 'margin-right:12px;white-space:nowrap' }, h('i', { class: 'sw', style: `background:${PALETTE[i % PALETTE.length]}` }), `${p[0]} ${fmt(p[1])}`)));
  return h('div', {}, bar, key);
}
function projectItem(p) {
  return h('li', {}, h('div', { class: 't' }, p.url ? ext(p.url, p.title) : p.title),
    h('div', { class: 'm' }, h('span', { class: `badge b-${p.status}` }, STATUS[p.status] ?? p.status), ` ${p.funder} · ${moneyFull(p.amount_committed, p.currency)}`,
      p.sector ? ` · ${p.sector}` : '', p.start_date ? ` · from ${p.start_date.slice(0, 4)}` : ''));
}
function renderPanel(list, agg) {
  const el = clear($('#panel'));
  if (!S.sel) {
    el.append(h('h2', {}, 'Bhutan overview'), h('p', { class: 'note' }, 'Select a dzongkhag on the map to see its projects, funders and allocations.'));
    const by = sumBy(list.filter(p => p.currency === 'USD'), p => p.funder, p => p.amount_committed);
    if (by.length) { el.append(h('h3', {}, 'Committed by funder (US$)'), stackedBar(by, v => money(v, 'USD'))); }
    el.append(h('p', { class: 'note' }, `${full.format(agg.national)} projects have no identifiable dzongkhag (national or multi-region) and appear only in the table and totals.`));
    return;
  }
  const d = S.dzById[S.sel], a = agg.by[S.sel], al = allocBy(S.sel);
  el.append(h('div', { class: 'card-h' }, h('h2', {}, d.name + ' Dzongkhag'), h('button', { type: 'button', onclick: () => { S.sel = null; location.hash = 'map'; } }, 'Clear')));
  el.append(h('p', {}, `${a.n} project${a.n === 1 ? '' : 's'} · ${a.usd ? money(a.usd, 'USD') + ' committed to single-dzongkhag projects' : 'no committed amounts attributed'}`));
  const byF = sumBy(a.items.filter(p => p.currency === 'USD' && p.amount_committed), p => p.funder, p => p.amount_committed);
  if (byF.length) el.append(h('h3', {}, 'Who is funding (US$)'), stackedBar(byF, v => money(v, 'USD')));
  if (al.length) {
    el.append(h('h3', {}, 'Budget allocations (curated from published documents)'));
    const bySrc = sumBy(al.filter(x => x.currency === 'BTN'), x => x.funding_source, x => x.amount);
    if (bySrc.length) el.append(stackedBar(bySrc, v => money(v, 'BTN')));
    const gw = sumBy(al.filter(x => x.gewog), x => x.gewog, x => x.amount);
    if (gw.length) el.append(h('h3', {}, 'By gewog'), h('ul', { class: 'plist' }, gw.map(([g, v]) => h('li', {}, `${g} – ${money(v, 'BTN')}`))));
    el.append(h('ul', { class: 'plist' }, al.map(x => h('li', {}, h('div', { class: 't' }, `${x.sector ?? 'General'} – ${moneyFull(x.amount, x.currency)} (${x.fiscal_year})`),
      h('div', { class: 'm' }, `${x.funding_source}${x.gewog ? ' · ' + x.gewog : ''}${x.village ? ' · ' + x.village : ''} · `, ext(x.source_url, `${x.source_name}: ${x.document}${x.page ? ', p.' + x.page : ''}`))))));
  }
  el.append(h('h3', {}, 'Projects'));
  const items = [...a.items].sort((x, y) => (y.amount_committed ?? -1) - (x.amount_committed ?? -1));
  el.append(items.length ? h('ul', { class: 'plist' }, items.slice(0, 40).map(projectItem)) : h('div', { class: 'empty' }, 'No projects match the current filters for this dzongkhag.'));
  if (items.length > 40) el.append(h('p', { class: 'note' }, `Showing 40 of ${items.length}. See the Projects tab for all.`));
}

// ---------- projects table ----------
const COLS = [['title', 'Project'], ['funder', 'Funder'], ['status', 'Status'], ['sector', 'Sector'], ['_where', 'Where'], ['amount_committed', 'Committed', 1], ['amount_disbursed', 'Disbursed', 1], ['start_date', 'Start'], ['end_date', 'End']];
const where = p => p.locations.length ? p.locations.map(l => S.dzById[l.dzongkhag]?.name).filter(Boolean).join(', ') : 'National / unspecified';
function renderTable(list) {
  const { key, dir } = S.sort;
  const val = p => key === '_where' ? where(p) : p[key];
  const rows = [...list].sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  $('#p-count').textContent = `(${full.format(rows.length)})`;
  const th = clear($('#ptable thead')).appendChild(h('tr'));
  for (const [k, label] of COLS) th.append(h('th', { scope: 'col', tabindex: 0, 'aria-sort': key === k ? (dir > 0 ? 'ascending' : 'descending') : null,
    onclick: () => { S.sort = { key: k, dir: key === k ? -dir : -1 }; renderTable(filtered()); }, onkeydown: e => { if (e.key === 'Enter') e.target.click(); } }, label));
  th.append(h('th', { scope: 'col' }, 'Source'));
  const tb = clear($('#ptable tbody'));
  if (!rows.length) tb.append(h('tr', {}, h('td', { colspan: COLS.length + 1 }, h('div', { class: 'empty' }, S.projects.length ? 'No projects match these filters.' : 'No project data loaded yet.'))));
  for (const p of rows.slice(0, 500)) tb.append(h('tr', {}, h('td', {}, p.title), h('td', {}, p.funder), h('td', {}, h('span', { class: `badge b-${p.status}` }, STATUS[p.status] ?? p.status)),
    h('td', {}, p.sector ?? '–'), h('td', {}, where(p), p.geo_confidence === 'text-match' ? h('small', {}, ' (inferred from text)') : ''),
    h('td', { class: 'num' }, p.amount_committed == null ? '–' : money(p.amount_committed, p.currency)), h('td', { class: 'num' }, p.amount_disbursed == null ? '–' : money(p.amount_disbursed, p.currency)),
    h('td', { style: 'white-space:nowrap' }, p.start_date ?? '–'), h('td', { style: 'white-space:nowrap' }, p.end_date ?? '–'), h('td', {}, p.url ? ext(p.url, 'View') : '–')));
  if (rows.length > 500) tb.append(h('tr', {}, h('td', { colspan: COLS.length + 1 }, h('small', {}, `Showing first 500 of ${rows.length}. Use filters or download the CSV for everything.`))));
}
function downloadCsv() {
  const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['id', 'title', 'funder', 'status', 'sector', 'where', 'amount_committed', 'amount_disbursed', 'currency', 'start_date', 'end_date', 'implementing_agency', 'url'];
  const lines = [head.join(','), ...filtered().map(p => head.map(k => esc(k === 'where' ? where(p) : p[k])).join(','))];
  const a = h('a', { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), download: 'drukview-projects.csv' }); document.body.append(a); a.click(); a.remove();
}

// ---------- budget / funding / data tabs ----------
function barRows(pairs, fmt) {
  const max = Math.max(...pairs.map(p => p[1]), 1);
  return pairs.map(([k, v]) => h('div', { class: 'row' }, h('span', {}, k), h('span', { class: 'track' }, h('i', { style: `width:${(v / max * 100).toFixed(1)}%;display:block` })), h('span', { class: 'v' }, fmt(v))));
}
function renderBudget() {
  const el = clear($('#budget-card'));
  el.append(h('h2', {}, 'National budget by agency'));
  if (!S.budget.length) { el.append(h('div', { class: 'empty' }, 'No budget rows loaded yet. Ministry of Finance, Home & Cultural Affairs, Agriculture & Livestock and other RGoB budgets are published as PDFs, so they enter through a citation-checked CSV (',
    h('code', {}, 'data/manual/budget_by_agency.csv'), '). Every row must name its source document and link to it. See Data & sources.')); return; }
  const years = [...new Set(S.budget.map(b => b.fiscal_year))].sort().reverse();
  const sel = h('select', { id: 'b-year', onchange: e => { S.by = e.target.value; renderBudget(); } }, years.map(y => h('option', { value: y, selected: y === (S.by ?? years[0]) }, y)));
  const fy = S.by ?? years[0];
  el.append(h('label', { class: 'inline' }, 'Fiscal year ', sel));
  for (const cur of [...new Set(S.budget.filter(b => b.fiscal_year === fy).map(b => b.currency))]) {
    const rows = S.budget.filter(b => b.fiscal_year === fy && b.currency === cur);
    el.append(h('h3', {}, `${fy} · ${cur}`), ...barRows(sumBy(rows, r => r.agency, r => r.amount), v => money(v, cur)));
    el.append(h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ['Agency', 'Type', 'Amount', 'Funding source', 'Source document'].map(t => h('th', {}, t)))),
      h('tbody', {}, rows.map(r => h('tr', {}, h('td', {}, r.agency), h('td', {}, r.budget_type), h('td', { class: 'num' }, moneyFull(r.amount, r.currency)), h('td', {}, r.funding_source ?? '–'), h('td', {}, ext(r.source_url, `${r.source_name}: ${r.document}${r.page ? ', p.' + r.page : ''}`))))))));
  }
}
function renderFunding() {
  const el = clear($('#funding-card')), list = filtered();
  el.append(h('h2', {}, 'Who pays for what'), h('p', { class: 'note' }, 'Totals follow the filters above. Currencies are never mixed or converted.'));
  const usd = list.filter(p => p.currency === 'USD');
  if (usd.length) {
    el.append(h('h3', {}, 'Development-partner commitments by funder (US$)'), ...barRows(sumBy(usd, p => p.funder, p => p.amount_committed), v => money(v, 'USD')));
    el.append(h('h3', {}, 'By sector (US$)'), ...barRows(sumBy(usd, p => p.sector ?? 'Unclassified', p => p.amount_committed).slice(0, 12), v => money(v, 'USD')));
    el.append(h('h3', {}, 'By status (US$)'), ...barRows(sumBy(usd, p => STATUS[p.status] ?? p.status, p => p.amount_committed), v => money(v, 'USD')));
  } else el.append(h('div', { class: 'empty' }, 'No development-partner project data in this view.'));
  const btn = S.alloc.filter(a => a.currency === 'BTN');
  if (btn.length) el.append(h('h3', {}, 'Curated allocations by funding source (Nu.)'), ...barRows(sumBy(btn, a => a.funding_source, a => a.amount), v => money(v, 'BTN')));
}
function renderData() {
  const el = clear($('#data-card'));
  el.append(h('h2', {}, 'Data & sources'), h('p', {}, 'Everything on DrukView comes from the sources below. Automated sources refresh daily; if one fails, the last good data stays visible and is marked stale.'));
  const rows = S.sources.length ? S.sources : [];
  el.append(rows.length ? h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ['Source', 'Status', 'Last success', 'Records', 'Notes'].map(t => h('th', {}, t)))),
    h('tbody', {}, rows.map(s => h('tr', {}, h('td', {}, ext(s.url, s.name)), h('td', {}, h('span', { class: `badge b-${s.status ?? 'not_run'}` }, s.status ?? 'not run')),
      h('td', {}, ago(s.last_success)), h('td', { class: 'num' }, s.records ?? 0), h('td', {}, s.notes ?? '', s.error ? h('div', { class: 'note' }, 'Last error: ' + s.error) : ''))))))
    : h('div', { class: 'empty' }, 'The update job has not run yet, so no source has reported status.'));
  el.append(h('h3', {}, 'Planned and supported sources'), h('ul', {}, [
    ['World Bank', 'Projects & Operations API – automated (USD commitments, status, dates).'],
    ['Asian Development Bank', 'IATI activity file – automated (commitments and disbursements from transactions).'],
    ['Ministry of Finance & line ministries', 'National Budget Reports and ministry annual reports are PDFs: curated into CSV with a mandatory citation per row.'],
    ['Dzongkhag / gewog / village allocations', 'Local-government grants and sector allocations: curated CSV with funding source (RGoB, development partner, etc.). Gewog and village levels appear as soon as rows include them.']]
    .map(([a, b]) => h('li', {}, h('b', {}, a + ': '), b))));
  el.append(h('h3', {}, 'How to read the numbers'), h('ul', {}, [
    'A “committed” amount is what a funder has agreed to provide, not what has been spent. “Disbursed” is shown only when the source reports it.',
    'Location is taken from the source’s location fields where present; otherwise from place names in the title/objective (labelled “inferred from text”); otherwise the project is treated as national.',
    'A project that spans several dzongkhags is counted in each, but its money is not divided between them (no guessing).',
    'US$ development-partner financing and Nu. government budgets are different things and are never added together.'].map(t => h('li', {}, t))));
}

// ---------- routing & render ----------
function render() {
  const list = filtered(), agg = aggregate(list);
  renderKpis(list);
  document.querySelector('#filters').hidden = ['data', 'budget'].includes(S.tab);
  if (S.tab === 'map') renderMap();
  if (S.tab === 'projects') renderTable(list);
  if (S.tab === 'funding') renderFunding();
  if (S.tab === 'budget') renderBudget();
  if (S.tab === 'data') renderData();
  void agg;
}
function route() {
  const [tab, dz] = (location.hash.slice(1) || 'map').split('/');
  S.tab = ['map', 'projects', 'budget', 'funding', 'data'].includes(tab) ? tab : 'map';
  S.sel = S.dzById[dz] ? dz : null;
  for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== `tab-${S.tab}`;
  for (const a of document.querySelectorAll('#tabs a')) a.toggleAttribute('aria-current', a.dataset.tab === S.tab), a.dataset.tab === S.tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  render();
}
await load();
renderBanner(); initFilters();
$('#dl').addEventListener('click', downloadCsv);
addEventListener('hashchange', route); route();
