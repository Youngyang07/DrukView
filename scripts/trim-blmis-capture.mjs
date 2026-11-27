// Turn a saved BLMIS job-seeker page into tests/fixtures/blmis-jobseeker-real.html.
//
//   node scripts/trim-blmis-capture.mjs <saved page.html> > tests/fixtures/blmis-jobseeker-real.html
//
// The saved page is about 2 MB, almost all of it the full text of one representative listing per row. This
// is a projection, not an edit: it keeps the four panels the collector reads, every row of each, and in each
// row only the fields the collector reads (the count and the name) plus the portal's ids. No value is
// changed, no row is dropped, and the result is re-escaped the way the portal escapes it, so the parser
// runs its real extraction path against it.
import { readFileSync } from 'node:fs';
import { livewireData, PANELS } from '../pipeline/blmis.mjs';

const KEEP = ['count_no', 'dzongkhag_id', 'dzongkhag_name', 'qualification_id', 'qualification', 'job_category_id', 'job_category', 'company_id', 'business_name'];
const data = livewireData(readFileSync(process.argv[2], 'utf8'));
if (!data) throw new Error('no job-seeker panels in that page');
const out = {};
for (const panel of Object.keys(PANELS)) out[panel] = data[panel].map(r => Object.fromEntries(KEEP.filter(k => k in r).map(k => [k, r[k]])));
const json = JSON.stringify({ fingerprint: { name: 'frontpage.jobseeker' }, serverMemo: { data: out } });
const esc = json.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
process.stdout.write(`<!-- BLMIS ${'/jobseeker_page/mispage'}, captured ${process.env.CAPTURED ?? '(date not given)'}; projected by scripts/trim-blmis-capture.mjs -->\n<div wire:id="jobseeker" wire:initial-data="${esc}"></div>\n`);
