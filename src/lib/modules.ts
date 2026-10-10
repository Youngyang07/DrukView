export const LOCALES = ['en'] as const; // Dzongkha is planned; add it once a native-speaker translation exists (see README)
export type Locale = (typeof LOCALES)[number];
export const isLocale = (l: string): l is Locale => (LOCALES as readonly string[]).includes(l);

export const MODULES = [
  { slug: '', label: 'Overview', blurb: 'Headline numbers and map' },
  { slug: 'budget', label: 'Budget & allocations', blurb: 'Published government and sector allocations' },
  { slug: 'projects', label: 'Projects', blurb: 'Development projects, active and completed' },
  { slug: 'funders', label: 'Funding sources', blurb: 'Who pays: RGoB, World Bank, ADB…' },
  { slug: 'weather', label: 'Weather & rainfall', blurb: 'Last 14 days and 7-day forecast' },
  { slug: 'tenders', label: 'Tenders', blurb: 'Public procurement notices' },
  { slug: 'offices', label: 'Leadership & offices', blurb: 'Who is responsible, how to reach them' },
] as const;
export type ModuleSlug = (typeof MODULES)[number]['slug'];

export const RESERVED = new Set(['about', 'compare', 'contribute', 'data-sources', 'updates', 'disclaimer', 'bhutan']);
export const REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || 'Youngyang07/DrukView';
export const issueUrl = (title: string, body = '') =>
  `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=data`;
