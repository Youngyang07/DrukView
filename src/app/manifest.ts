import type { MetadataRoute } from 'next';

/** Makes DrukView installable ("Add to Home Screen"): it opens full-screen from its own icon, like an app.
 *  The site is the app — there is no separate mobile codebase. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/en',
    name: 'DrukView – Every Ngultrum Accounted For',
    short_name: 'DrukView',
    description: "See where Bhutan's public money goes, by dzongkhag, funder and agency, with every figure linked to its source.",
    start_url: '/en?source=app',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#faf7f2',
    theme_color: '#8a1c2b',
    lang: 'en',
    categories: ['government', 'news', 'education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Bhutan', url: '/en/bhutan', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Compare dzongkhags', url: '/en/compare', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Jobs and vacancies', url: '/en/bhutan/economy', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
