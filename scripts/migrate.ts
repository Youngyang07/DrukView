import { pool } from '../src/server/db';
import { migrate } from '../src/server/setup';
export { migrate };
if (process.argv[1]?.endsWith('migrate.ts')) migrate().then(a => { console.log('applied:', a.join(', ') || '(none)'); return pool().end(); }, e => { console.error(e.message); process.exit(1); });
