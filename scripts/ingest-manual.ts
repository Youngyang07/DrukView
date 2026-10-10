import { runJob } from '../src/server/ingest';
import { pool } from '../src/server/db';
runJob('manual').then(r => { console.log(r.status === 'ok' ? `manual ingest ok: ${r.records} rows` : r.message); return pool().end().then(() => process.exit(r.status === 'ok' ? 0 : 1)); });
