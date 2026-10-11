import type { MetadataRoute } from 'next';
import { LOCALES, MODULES } from '@/lib/modules';
import { DZONGKHAGS } from '@/lib/reference';

/** Public pages, so search engines can reach every dzongkhag's dashboard. Built from the same lists the
 *  router uses, so a new module or locale appears here without a second edit. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://drukview.vercel.app').replace(/\/$/, '');
  const lastModified = new Date();
  const out: MetadataRoute.Sitemap = [{ url: `${base}/`, lastModified, priority: 1 }];
  for (const locale of LOCALES) {
    for (const page of ['', 'about', 'compare', 'contribute', 'data-sources', 'updates', 'disclaimer']) {
      out.push({ url: `${base}/${locale}${page ? `/${page}` : ''}`, lastModified, priority: page ? 0.5 : 0.9 });
    }
    for (const slug of ['bhutan', ...DZONGKHAGS.map(d => d.slug)]) {
      for (const m of MODULES) {
        out.push({ url: `${base}/${locale}/${slug}${m.slug ? `/${m.slug}` : ''}`, lastModified, priority: m.slug ? 0.6 : 0.8 });
      }
    }
  }
  return out;
}
