import { Pool, type QueryResultRow } from 'pg';

const g = globalThis as unknown as { __pool?: Pool };

export function pool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  g.__pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: /sslmode=require|neon\.tech|supabase/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined });
  return g.__pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query<T>(text, params)).rows;
}

export type DbStatus = 'no-url' | 'unreachable' | 'no-schema' | 'ok';

/** Distinguishes "not configured", "cannot connect", "connected but tables missing" and "ready". */
export async function dbStatus(): Promise<DbStatus> {
  if (!process.env.DATABASE_URL) return 'no-url';
  try {
    const r = await pool().query("select to_regclass('public.dzongkhags') is not null as ok");
    return r.rows[0]?.ok ? 'ok' : 'no-schema';
  } catch { return 'unreachable'; }
}

let synced = false; // pending migrations + reference data applied once per server process

export async function dbReady(): Promise<boolean> {
  let st = await dbStatus();
  // Empty database → create everything. Existing database → apply any migrations added since it was created (once per process).
  if (st === 'no-schema' || (st === 'ok' && !synced)) {
    try { const { ensureSchema } = await import('./setup'); await ensureSchema(); synced = true; st = await dbStatus(); }
    catch (e) { console.error('[drukview] database setup/migration failed:', (e as Error).message); }
  }
  return st === 'ok';
}
