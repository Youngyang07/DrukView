'use client';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

export default function DzSearch({ items, locale }: { items: { slug: string; name: string }[]; locale: string }) {
  const r = useRouter(); const id = useId(); const [v, setV] = useState('');
  const go = (val: string) => { const m = items.find(i => i.name.toLowerCase() === val.trim().toLowerCase()); if (m) r.push(`/${locale}/${m.slug}`); };
  return (
    <form className="search" role="search" onSubmit={e => { e.preventDefault(); const m = items.find(i => i.name.toLowerCase().startsWith(v.trim().toLowerCase())); if (m) r.push(`/${locale}/${m.slug}`); }}>
      <label htmlFor={id} className="sr">Find your dzongkhag</label>
      <input id={id} list={`${id}-l`} value={v} placeholder="Find your dzongkhag — e.g. Thimphu" autoComplete="off" onChange={e => { setV(e.target.value); go(e.target.value); }} />
      <datalist id={`${id}-l`}>{items.map(i => <option key={i.slug} value={i.name} />)}</datalist>
      <button type="submit">Go</button>
    </form>
  );
}
