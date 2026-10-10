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

/** True only when the database is reachable AND initialised; pages otherwise show an honest setup message. */
export async function dbReady(): Promise<boolean> { return (await dbStatus()) === 'ok'; }
