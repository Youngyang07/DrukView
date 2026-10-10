import { fetchJson, parseAmount, isoDate, resolveLocations } from './lib.mjs';

export const SOURCE = {
  id: 'worldbank',
  name: 'World Bank – Projects & Operations API',
  url: 'https://projects.worldbank.org/en/projects-operations/projects-home',
  kind: 'api',
  notes: 'Commitments are in USD. World Bank records rarely carry sub-national locations, so most projects are matched by place names in the title/objective or left as national.',
};

const FIELDS = 'id,project_name,status,boardapprovaldate,closingdate,totalcommamt,url,sector1,mjsector_namecode,impagency,borrower,pdo,project_abstract,lendinginstr';
const STATUS = { active: 'active', closed: 'completed', pipeline: 'pipeline', dropped: 'cancelled' };

export function normalizeWorldBank(raw, matcher, fetchedAt) {
  const out = [];
  const items = raw && raw.projects ? Object.values(raw.projects) : [];
  for (const p of items) {
    if (!p || !p.id) continue;
    const title = p.project_name || p.id;
    const objective = (typeof p.pdo === 'string' ? p.pdo : '') || (typeof p.project_abstract === 'object' ? p.project_abstract?.cdata : p.project_abstract) || '';
    const loc = resolveLocations({ text: `${title}. ${objective}` }, matcher);
    const sector = Array.isArray(p.sector1) ? p.sector1[0]?.Name : p.sector1?.Name;
    out.push({
      id: `worldbank:${p.id}`,
      source: 'worldbank',
      funder: 'World Bank',
      title,
      description: String(objective).slice(0, 600),
      status: STATUS[String(p.status || '').toLowerCase()] ?? 'unknown',
      sector: sector || null,
      implementing_agency: p.impagency || p.borrower || null,
      amount_committed: parseAmount(p.totalcommamt),
      amount_disbursed: null,
      currency: 'USD',
      start_date: isoDate(p.boardapprovaldate),
      end_date: isoDate(p.closingdate),
      locations: loc.ids.map(id => ({ dzongkhag: id, gewog: null, village: null })),
      geo_confidence: loc.confidence,
      url: `https://projects.worldbank.org/en/projects-operations/project-detail/${encodeURIComponent(p.id)}`,
      fetched_at: fetchedAt,
    });
  }
  return out;
}

export async function fetchWorldBank(matcher) {
  const rows = 100;
  const all = { projects: {} };
  let offset = 0, total = Infinity;
  while (offset < total) {
    const url = `https://search.worldbank.org/api/v2/projects?format=json&countrycode_exact=BT&fl=${FIELDS}&rows=${rows}&os=${offset}`;
    const page = await fetchJson(url);
    total = Number(page.total ?? 0);
    const got = Object.keys(page.projects ?? {});
    if (!got.length) break;
    Object.assign(all.projects, page.projects);
    offset += rows;
  }
  if (!Object.keys(all.projects).length) throw new Error('World Bank API returned zero projects for BT');
  return normalizeWorldBank(all, matcher, new Date().toISOString());
}
