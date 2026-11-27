import type { Metadata, Viewport } from 'next';
import './globals.css';
import { RegisterSW } from '@/components/AppShell';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'DrukView – Every Ngultrum Accounted For', template: '%s · DrukView' },
  description: "Track projects. Follow funds. Build trust. See where Bhutan's public money goes – by dzongkhag, funder and agency – with every figure linked to its source.",
  applicationName: 'DrukView',
  appleWebApp: { capable: true, title: 'DrukView', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ffffff' }, { media: '(prefers-color-scheme: dark)', color: '#16161b' }] };

export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<RegisterSW /></body></html>;
}
