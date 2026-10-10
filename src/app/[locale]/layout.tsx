import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, issueUrl } from '@/lib/modules';

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (<>
    <a className="skip" href="#main">Skip to content</a>
    <header className="top"><div className="wrap top-in">
      <Link href={`/${locale}`} className="brand"><svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--maroon)" /><circle cx="16" cy="16" r="7" fill="none" stroke="var(--saffron)" strokeWidth="3" /></svg>
        <div><b>DrukView</b><span>Every Ngultrum Accounted For</span></div></Link>
      <nav aria-label="Main">
        <Link href={`/${locale}/bhutan`}>Bhutan</Link><Link href={`/${locale}/compare`}>Compare</Link><Link href={`/${locale}/data-sources`}>Data sources</Link>
        <Link href={`/${locale}/updates`}>Update log</Link><Link href={`/${locale}/contribute`}>Contribute</Link>
      </nav></div></header>
    <main id="main" tabIndex={-1}>{children}</main>
    <footer className="foot"><div className="wrap">
      <p>DrukView is an independent transparency tool, not an official Royal Government of Bhutan publication. Figures come from the sources on the <Link href={`/${locale}/data-sources`}>Data sources</Link> page; always check the linked original before relying on a number.</p>
      <p><Link href={`/${locale}/about`}>About</Link> · <Link href={`/${locale}/disclaimer`}>Disclaimer</Link> · <a href={issueUrl('Feedback')} target="_blank" rel="noopener noreferrer">Report a problem</a> · Open source (MIT)</p>
    </div></footer>
  </>);
}
