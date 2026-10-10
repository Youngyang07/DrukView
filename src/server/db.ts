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

/** True when a database is configured and reachable; pages degrade to an honest "no data" state otherwise. */
export async function dbReady(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try { await pool().query('select 1'); return true; } catch { return false; }
}
