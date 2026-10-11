// Curated reference datasets transcribed from official publications. They ship with the code (no database
// needed) and every file carries its own citation. tests/reference.test.ts checks them against the
// publications' own totals, so a typo fails CI instead of reaching the site.
import dzRef from '../../shared/dzongkhags.json';
import healthJson from '../../data/reference/health-facilities.json';
import popJson from '../../data/reference/population-2017.json';
import schoolsJson from '../../data/reference/schools-2024.json';
import leadersJson from '../../data/reference/leaders.json';
import budgetJson from '../../data/reference/budget-2026-27.json';
import economyJson from '../../data/reference/economy.json';
import dzongdagJson from '../../data/reference/dzongdags.json';

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

export type BudgetSector = { name: string; current: number; capital: number; total: number; level: 'top' | 'parent' | 'child' };
export type BudgetDz = { name: string; current: number; capitalBlock: number; capitalProjectExternal: number; capitalProjectRgob: number; capitalCentral: number; capital: number; total: number };
export type BudgetGewog = { gewog: string; dz: string; current: number; capitalBlock: number; capitalProjectExternal: number; capitalCentral: number; capital: number; total: number; mapName?: string };
export type BudgetData = { source: RefSource; fiscalYear: string; currency: string; notes: string[];
  national: { totalAppropriation: number; totalExpenditure: number; current: number; capital: number; totalResources: number; internalResources: number;
    domesticRevenue: number; tax: number; nonTax: number; externalResources: number; programGrants: number; projectTiedGrants: number; grantsGoI: number;
    fiscalDeficit: number; gdp: number; deficitPctGdp: number; debtService: number };
  sectors: BudgetSector[]; localGovernment: { total: number; dzongkhags: { current: number; capital: number; total: number }; thromdesTotal: number; gewogsTotal: number; previousYearTotal: number };
  dzongkhags: Record<string, BudgetDz>; thromdes: { name: string; dz: string; current: number; capital: number; total: number }[]; gewogs: BudgetGewog[] };

export type EconMetric = { key: string; label: string; unit: string; asOf: string | null; fiscalYear: string; source: RefSource;
  national: Record<string, number>; dzongkhags: Record<string, Record<string, number>>; notes: string[] };
export type EconomyData = { metrics: EconMetric[] };

export type Dzongdag = { name: string; confidence: 'confirmed' | 'website' | 'unconfirmed'; asOf: string | null; note: string | null; sourceTitle: string | null; sourceUrl: string | null };
export type DzOffice = { name?: string; phone?: string; email?: string; address?: string; website?: string; sourceUrl?: string };
export type DzongdagData = { notes: string[]; checked: string; dzongkhags: Record<string, { dzongdag?: Dzongdag; office?: DzOffice }> };

export const health = healthJson as unknown as HealthData;
export const economy = economyJson as unknown as EconomyData;
export const dzongdags = dzongdagJson as unknown as DzongdagData;
export const CONFIDENCE_LABEL: Record<Dzongdag['confidence'], string> = {
  confirmed: 'Confirmed by a dated appointment notice',
  website: 'From the dzongkhag website — the page carries no date',
  unconfirmed: 'Unconfirmed — sources disagree or look incomplete',
};
export const budget = budgetJson as unknown as BudgetData;
/** Gewog budget totals keyed by the boundary-file name, for map shading. Gewogs whose name could not be
 *  matched to a boundary with confidence are left out rather than attached to the wrong shape. */
export const gewogBudgetByMapName = (slug: string): Record<string, number> =>
  Object.fromEntries(budget.gewogs.filter(g => g.dz === slug && g.mapName).map(g => [g.mapName!.toLowerCase(), g.total]));
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
  { what: `National budget FY ${budget.fiscalYear}`, source: budget.source, notes: budget.notes },
  ...economy.metrics.map(m => ({ what: `${m.label} (MoICE)`, source: m.source, notes: m.notes })),
  { what: 'Population (census)', source: population.source, notes: population.notes },
  { what: 'Health facilities', source: health.source, notes: health.notes },
  { what: 'Schools', source: schools.source, notes: schools.notes },
  { what: 'National Assembly members', source: leaders.sources.na, notes: leaders.notes.slice(0, 1) },
  { what: 'National Council members', source: leaders.sources.nc, notes: leaders.notes.slice(1) },
];
