import { JOBS, runJob, type JobName } from '../src/server/ingest';
import { pool } from '../src/server/db';
const job = process.argv[2] as JobName;
if (!JOBS.includes(job)) { console.error('usage: npm run job -- <' + JOBS.join('|') + '>'); process.exit(2); }
runJob(job).then(r => { console.log(r); return pool().end(); }).then(() => process.exit(0));
