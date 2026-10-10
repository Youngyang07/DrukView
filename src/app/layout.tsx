import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'DrukView – Every Ngultrum Accounted For', template: '%s · DrukView' },
  description: "Track projects. Follow funds. Build trust. See where Bhutan's public money goes – by dzongkhag, funder and agency – with every figure linked to its source.",
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#8a1c2b' };

export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
