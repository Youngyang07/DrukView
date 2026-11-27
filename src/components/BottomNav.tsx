'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Phone navigation: a tab bar at the bottom of the screen, where a thumb reaches, in place of the header
 *  links that wrap onto two lines. Shown only on narrow screens (see .tabbar in globals.css). */
const ICON: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  bhutan: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6',
  compare: 'M5 20V10M12 20V4M19 20v-7',
  sources: 'M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h8',
  updates: 'M12 7v5l3 3M21 12a9 9 0 1 1-9-9',
};

export default function BottomNav({ locale }: { locale: string }) {
  const path = usePathname() ?? '';
  const tabs: [string, string, string, (p: string) => boolean][] = [
    ['home', 'Home', `/${locale}`, p => p === `/${locale}`],
    ['bhutan', 'Dzongkhags', `/${locale}/bhutan`, p => p.startsWith(`/${locale}/`) && !/\/(compare|data-sources|updates|contribute|about|disclaimer)(\/|$)/.test(p)],
    ['compare', 'Compare', `/${locale}/compare`, p => p.startsWith(`/${locale}/compare`)],
    ['sources', 'Sources', `/${locale}/data-sources`, p => p.startsWith(`/${locale}/data-sources`)],
    ['updates', 'Updates', `/${locale}/updates`, p => p.startsWith(`/${locale}/updates`)],
  ];
  return (<nav className="tabbar" aria-label="Main">
    {tabs.map(([k, label, href, on]) => (
      <Link key={k} href={href} aria-current={on(path) ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={ICON[k]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>{label}</span>
      </Link>))}
  </nav>);
}
