// Curated reference datasets transcribed from official publications. They ship with the code (no database
// needed) and every file carries its own citation. tests/reference.test.ts checks them against the
// publications' own totals, so a typo fails CI instead of reaching the site.
import dzRef from '../../shared/dzongkhags.json';
import healthJson from '../../data/reference/health-facilities.json';
import popJson from '../../data/reference/population-2017.json';
import schoolsJson from '../../data/reference/schools-2024.json';
import leadersJson from '../../data/reference/leaders.json';

export type RefSource = { publisher: string; title: string; table?: string; url: string; checked: string };

export type FacilityType = 'hospital' | 'phc' | 'subpost' | 'hisc';
export type Facility = { type: FacilityType; name: string; beds: number | null; nameInSource?: string };
export type HealthTotals = { hospitals: number; beds: number; phc: number; subpost: number; hisc: number; orcs: number };
export type HealthData = { source: RefSource; notes: string[]; grandTotal: HealthTotals; dzongkhags: Record<string, { totals: HealthTotals; facilities: Facility[] }> };

export type PopRow = { male: number; female: number; total: number; total2005: number; thromde?: { name: string; male: number; female: number; total: number } };
export type PopData = { source: RefSource; notes: string[]; national: { total: number; enumerated: number; male: number; female: number; total2005: number }; dzongkhags: Record<string, PopRow> };

export type SchoolLevel = 'ECR' | 'PS' | 'LSS' | 'MSS' | 'HSS' | 'other';
export type School = { name: string; level: SchoolLevel; thromde?: string; nameInSource?: string };
export type SchoolsData = { source: RefSource; notes: string[]; national: { total: number; ECR: number; PS: number; LSS: number; MSS: number; HSS: number; special: number };
  dzongkhags: Record<string, { total: number; byLevel: Record<SchoolLevel, number>; thromde?: { name: string; total: number }[]; schools: School[] }> };

export type Member = { name: string; role: string; constituency?: string | null };
export type LeadersData = { sources: Record<'na' | 'nc', RefSource & { data: string }>; notes: string[]; cabinet: (Member & { dzongkhag: string })[];
  nationalCouncilEminent: Member[]; dzongkhags: Record<string, { nationalAssembly: Member[]; nationalCouncil: Member[] }> };

export const health = healthJson as unknown as HealthData;
export const schools = schoolsJson as unknown as SchoolsData;
export const leaders = leadersJson as unknown as LeadersData;
export const SCHOOL_LEVEL: Record<SchoolLevel, string> = { ECR: 'Extended classroom', PS: 'Primary school', LSS: 'Lower secondary', MSS: 'Middle secondary', HSS: 'Higher secondary', other: 'Special institute' };
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
  { what: 'Schools', source: schools.source, notes: schools.notes },
  { what: 'National Assembly members', source: leaders.sources.na, notes: leaders.notes.slice(0, 1) },
  { what: 'National Council members', source: leaders.sources.nc, notes: leaders.notes.slice(1) },
];
