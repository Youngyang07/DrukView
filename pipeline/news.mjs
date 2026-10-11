// News watch for leadership changes.
//
// This deliberately NEVER supplies or edits a name. Newspaper headlines are written for readers, not
// for machines: "Dasho takes charge in Trongsa" or a name in Dzongkha script would both be mangled by
// any extractor we could write, and a wrong name on a government transparency site is worse than a late
// one. So a matching article only raises a dated, linked flag next to the dzongkhag it names, inviting
// a human to check the entry against the official source.
//
// Feeds verified on 2026-10-11: The Bhutanese serves RSS 2.0 at /feed/, Kuensel serves Atom at
// /feed/posts. Both are optional — one failing never fails the run.
import { fetchText } from './lib.mjs';

export const FEEDS = [
  { id: 'kuensel', name: 'Kuensel', url: process.env.KUENSEL_FEED || 'https://kuenselonline.com/feed/posts', home: 'https://kuenselonline.com/' },
  { id: 'thebhutanese', name: 'The Bhutanese', url: process.env.BHUTANESE_FEED || 'https://thebhutanese.bt/feed/', home: 'https://thebhutanese.bt/' },
];

export const SOURCE = {
  id: 'news-watch',
  name: 'Kuensel and The Bhutanese – leadership-change watch',
  url: 'https://kuenselonline.com/',
  kind: 'rss',
  notes: 'Reads the two papers\' public feeds and flags articles that look like a leadership change in a named dzongkhag. Flags are prompts to re-check an entry against the official source; no name on DrukView ever comes from a newspaper.',
};

/** Words that make an article worth flagging. Kept narrow so ordinary coverage is not flagged. */
const TOPIC = /\b(dzongdag|dzongda|dzongrab|thrompon)\b/i;
const CHANGE = /\b(appoint|appointed|appointment|new|welcom|transfer|reshuffl|takes? (?:over|charge)|assumes?|joins?|relieved|retire[sd]?|promot)/i;

const strip = s => String(s ?? '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, m => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#8217;': '’', '&#8216;': '‘', '&#8220;': '“', '&#8221;': '”', '&nbsp;': ' ' }[m.toLowerCase()] ?? ' '))
  .replace(/\s+/g, ' ').trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? strip(m[1]) : null;
};

/** Atom puts the URL in <link href="…"/>; RSS puts it in <link>…</link>. */
function itemLink(xml) {
  const href = xml.match(/<link\b[^>]*\brel=["']?alternate["']?[^>]*\bhref=["']([^"']+)["']/i)
    || xml.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i);
  if (href) return href[1];
  return tag(xml, 'link');
}

const toIso = v => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Parse an RSS 2.0 or Atom document into {title, url, published, summary}. */
export function parseFeed(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const body = m[2];
    const title = tag(body, 'title');
    if (!title) continue;
    out.push({
      title,
      url: itemLink(body),
      published: toIso(tag(body, 'pubDate') || tag(body, 'published') || tag(body, 'updated') || tag(body, 'dc:date')),
      summary: tag(body, 'description') || tag(body, 'summary') || null,
    });
  }
  return out;
}

/** Is this article about a change of office-holder? Title and summary only — never the body. */
export const looksLikeLeadershipChange = (text) => TOPIC.test(text) && CHANGE.test(text);

/** Turn feed items into per-dzongkhag flags. `dzongkhags` are rows of {id, name, aliases}. */
export function flagsFrom(items, dzongkhags, opts) {
  const { feed, maxAgeDays = 120, now = Date.now() } = opts;
  const flags = [];
  const cutoff = now - maxAgeDays * 86400e3;
  for (const it of items) {
    const text = `${it.title} ${it.summary ?? ''}`;
    if (!looksLikeLeadershipChange(text)) continue;
    if (it.published && Date.parse(it.published) < cutoff) continue;
    // Which dzongkhags does the headline name? Longest alias first so "Trashi Yangtse" beats "Trashigang".
    const hit = new Set();
    for (const d of dzongkhags) {
      for (const a of [d.name, ...(d.aliases ?? [])]) {
        if (a.length >= 4 && new RegExp(`(?<![\\p{L}])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'iu').test(text)) { hit.add(d.id); break; }
      }
    }
    for (const id of hit) {
      flags.push({
        dzongkhag: id, title: it.title, url: it.url, published: it.published,
        source_name: feed.name, source_url: feed.home, fetched_at: new Date(now).toISOString(),
      });
    }
  }
  return flags;
}

/** Read every feed. A feed that fails is reported in `failed` instead of killing the run. */
export async function fetchNewsFlags(dzongkhags, { feeds = FEEDS, now = Date.now() } = {}) {
  const flags = [], failed = [];
  await Promise.all(feeds.map(async feed => {
    try {
      const xml = await fetchText(feed.url, { retries: 1, timeoutMs: 12000, accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8' });
      flags.push(...flagsFrom(parseFeed(xml), dzongkhags, { feed, now }));
    } catch (e) {
      failed.push(`${feed.name}: ${String(e.message ?? e).slice(0, 200)}`);
    }
  }));
  // newest first, and never let one busy day crowd out the rest
  flags.sort((a, b) => String(b.published ?? '').localeCompare(String(a.published ?? '')));
  return { flags: flags.slice(0, 60), failed };
}
