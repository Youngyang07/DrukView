'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SideNav({ base, items }: { base: string; items: { slug: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="side" aria-label="Dashboard modules">
      {items.map(m => {
        const href = m.slug ? `${base}/${m.slug}` : base;
        const on = m.slug ? path.startsWith(href) : path === base;
        return <Link key={m.slug || 'overview'} href={href} aria-current={on ? 'page' : undefined}>{m.label}</Link>;
      })}
    </nav>
  );
}
