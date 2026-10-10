import { dbReady, freshness } from '@/server/queries';
export const dynamic = 'force-dynamic';
export async function GET() {
  const ok = await dbReady();
  return Response.json({ ok, db: ok, freshness: ok ? await freshness() : null }, { status: ok ? 200 : 503 });
}
