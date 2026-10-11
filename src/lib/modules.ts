export const LOCALES = ['en'] as const; // Dzongkha is planned; add it once a native-speaker translation exists (see README)
export type Locale = (typeof LOCALES)[number];
export const isLocale = (l: string): l is Locale => (LOCALES as readonly string[]).includes(l);

export const MODULES = [
  { slug: '', label: 'Overview', blurb: 'Headline numbers and map' },
  { slug: 'population', label: 'Population', blurb: 'Census 2017: people, sex ratio, growth since 2005' },
  { slug: 'health', label: 'Health facilities', blurb: 'Hospitals, beds, PHCs and sub-posts by name' },
  { slug: 'schools', label: 'Schools', blurb: 'All 566 schools by name and level' },
  { slug: 'economy', label: 'Industry & jobs', blurb: 'Business licences and jobs filled' },
  { slug: 'budget', label: 'Budget', blurb: 'National budget by sector, dzongkhag and gewog' },
  { slug: 'projects', label: 'Projects', blurb: 'Development projects, active and completed' },
  { slug: 'funders', label: 'Funding sources', blurb: 'Who pays: RGoB, World Bank, ADB…' },
  { slug: 'weather', label: 'Weather & rainfall', blurb: 'Last 14 days and 7-day forecast' },
  { slug: 'tenders', label: 'Tenders', blurb: 'Public procurement notices' },
  { slug: 'offices', label: 'Leaders & offices', blurb: 'MPs, National Council members, ministers, offices' },
] as const;
/** Modules served from bundled, cited reference files: they work even when the database is down. */
export const STATIC_MODULES: readonly string[] = ['population', 'health', 'schools', 'offices', 'budget', 'economy'];
export type ModuleSlug = (typeof MODULES)[number]['slug'];

export const RESERVED = new Set(['about', 'compare', 'contribute', 'data-sources', 'updates', 'disclaimer', 'bhutan']);
export const REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || 'Youngyang07/DrukView';
export const issueUrl = (title: string, body = '') =>
  `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=data`;
