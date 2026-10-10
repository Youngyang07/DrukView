import Link from 'next/link';
import DzSearch from '@/components/DzSearch';
import Explorer from '@/components/Explorer';
import { Fresh, NoDatabase, Stat } from '@/components/ui';
import { money, num } from '@/lib/format';
import { getExplorerData } from '@/server/explorer';
import { dbReady, freshness, getDzongkhags, projectStats } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const ready = await dbReady();
  const [dz, st, ex, fr] = ready ? await Promise.all([getDzongkhags(), projectStats(null), getExplorerData(), freshness()]) : [[], null, null, null];
  return (<>
    <section className="hero"><div className="wrap">
      <h1>Your dzongkhag. Your data. Your right.</h1>
      <p>Track projects. Follow funds. Build trust. See where Bhutan’s public money goes — budgets, allocations and development projects by dzongkhag, with the funding source and the original document behind every figure.</p>
      {ready ? <DzSearch items={dz.map(d => ({ slug: d.slug, name: d.name }))} locale={locale} /> : null}
    </div></section>
    <div className="wrap page">
      {!ready ? <NoDatabase /> : null}
      {st ? <div className="kpis">
        <Stat label="Projects tracked" value={num(st.total)} sub={`${num(st.active)} active · ${num(st.completed)} completed`} />
        <Stat label="Partner commitments" value={st.total ? money(st.usd, 'USD') : 'n/a'} sub="US$, World Bank + ADB" />
        <Stat label="Funders" value={num(st.funders)} sub="in the data" />
        <Stat label="Last project refresh" value={<Fresh at={fr?.projects} />} sub="automated daily" />
      </div> : null}
      {st && st.total === 0 ? <div className="banner info"><b>No project data has been loaded yet</b>Open <Link href={`/${locale}/data-sources`}>Data sources</Link> and press <b>Load / refresh data now</b> (about a minute). It also refreshes automatically every day. Until then DrukView shows nothing rather than estimates.</div> : null}
      {ex ? <Explorer dz={ex.dz} geo={ex.geo} hasAlloc={ex.hasAlloc} locale={locale} /> : null}
    </div>
  </>);
}
