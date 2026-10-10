// Curated reference datasets transcribed from official publications. They ship with the code (no database
// needed) and every file carries its own citation. tests/reference.test.ts checks them against the
// publications' own totals, so a typo fails CI instead of reaching the site.
import dzRef from '../../shared/dzongkhags.json';
import healthJson from '../../data/reference/health-facilities.json';
import popJson from '../../data/reference/population-2017.json';

export type RefSource = { publisher: string; title: string; table?: string; url: string; checked: string };

export type FacilityType = 'hospital' | 'phc' | 'subpost' | 'hisc';
export type Facility = { type: FacilityType; name: string; beds: number | null; nameInSource?: string };
export type HealthTotals = { hospitals: number; beds: number; phc: number; subpost: number; hisc: number; orcs: number };
export type HealthData = { source: RefSource; notes: string[]; grandTotal: HealthTotals; dzongkhags: Record<string, { totals: HealthTotals; facilities: Facility[] }> };

export type PopRow = { male: number; female: number; total: number; total2005: number; thromde?: { name: string; male: number; female: number; total: number } };
export type PopData = { source: RefSource; notes: string[]; national: { total: number; enumerated: number; male: number; female: number; total2005: number }; dzongkhags: Record<string, PopRow> };

export const health = healthJson as unknown as HealthData;
export const population = popJson as unknown as PopData;

export const FACILITY_LABEL: Record<FacilityType, string> = { hospital: 'Hospitals', phc: 'Primary Health Centres', subpost: 'Sub-posts', hisc: 'Health Information & Service Centres' };
export const FACILITY_SHORT: Record<FacilityType, string> = { hospital: 'Hospital', phc: 'PHC', subpost: 'Sub-post', hisc: 'HISC' };

export type DzRef = { id: string; slug: string; name: string; lat: number; lon: number; grid_col: number; grid_row: number };
export const DZONGKHAGS: DzRef[] = (dzRef as { dzongkhags: (DzRef & { aliases: string[] })[] }).dzongkhags
  .map(({ id, slug, name, lat, lon, grid_col, grid_row }) => ({ id, slug, name, lat, lon, grid_col, grid_row }))
  .sort((a, b) => a.name.localeCompare(b.name));
export const dzBySlug = (slug: string) => DZONGKHAGS.find(d => d.slug === slug) ?? null;

/** Facilities per 10,000 residents etc. are computed from different years; callers must say so. */
export const per10k = (n: number, pop: number) => (pop > 0 ? (n / pop) * 10_000 : 0);
export const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);

export const REFERENCE_SOURCES: { what: string; source: RefSource; notes: string[] }[] = [
  { what: 'Population (census)', source: population.source, notes: population.notes },
  { what: 'Health facilities', source: health.source, notes: health.notes },
];
