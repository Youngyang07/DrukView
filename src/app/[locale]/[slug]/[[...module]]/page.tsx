import { notFound } from 'next/navigation';
import ModuleView from '@/components/ModuleView';
import { NoDatabase } from '@/components/ui';
import { MODULES, STATIC_MODULES, type ModuleSlug } from '@/lib/modules';
import { dzBySlug } from '@/lib/reference';
import { dbReady, getDzBySlug } from '@/server/queries';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ locale: string; slug: string; module?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: P) {
  const { slug, module } = await params;
  const m = MODULES.find(x => x.slug === (module?.[0] ?? ''));
  return { title: `${slug === 'bhutan' ? 'Bhutan' : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}${m?.label && m.slug ? ' — ' + m.label : ''}` };
}

export default async function ScopePage({ params, searchParams }: P) {
  const { locale, slug, module } = await params;
  const mod = (module?.[0] ?? '') as ModuleSlug;
  if ((module?.length ?? 0) > 1 || !MODULES.some(m => m.slug === mod)) notFound();
  if (STATIC_MODULES.includes(mod)) {
    const scope = slug === 'bhutan' ? null : dzBySlug(slug);
    if (slug !== 'bhutan' && !scope) notFound();
    return <ModuleView module={mod} scope={scope} locale={locale} filters={{}} />;
  }
  if (!(await dbReady())) return <NoDatabase />;
  const sp = await searchParams; const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string).slice(0, 120) : undefined);
  const scope = slug === 'bhutan' ? null : await getDzBySlug(slug);
  if (slug !== 'bhutan' && !scope) notFound();
  return <ModuleView module={mod} scope={scope} locale={locale} filters={{ funder: one('funder'), status: one('status'), sector: one('sector'), q: one('q') }} />;
}
