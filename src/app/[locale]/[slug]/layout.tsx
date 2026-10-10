import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MODULES, RESERVED } from '@/lib/modules';
import { getDzBySlug } from '@/server/queries';
import SideNav from '@/components/SideNav';

export default async function ScopeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const national = slug === 'bhutan';
  if (!national && RESERVED.has(slug)) notFound();
  const dz = national ? null : await getDzBySlug(slug).catch(() => null);
  if (!national && !dz) notFound();
  const base = `/${locale}/${slug}`;
  return (
    <div className="wrap page">
      <p className="crumbs"><Link href={`/${locale}`}>Home</Link> / {national ? 'Bhutan' : dz!.name}</p>
      <h1 className="pagetitle">{national ? 'Bhutan — national dashboard' : `${dz!.name} Dzongkhag`}</h1>
      <div className="shell">
        <SideNav base={base} items={MODULES.map(m => ({ slug: m.slug, label: m.label }))} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
