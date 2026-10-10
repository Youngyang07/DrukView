import { pool } from '../src/server/db';
import { seed } from '../src/server/setup';
export { seed };
if (process.argv[1]?.endsWith('seed.ts')) seed().then(n => { console.log('seeded dzongkhags:', n); return pool().end(); }, e => { console.error(e.message); process.exit(1); });
