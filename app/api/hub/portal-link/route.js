import { sql } from '@/lib/db';
import { createTokenForProject } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// For the FD99 hub: GET /api/hub/portal-link?shopify_order_id=...&secret=...
// Returns { link } for the project mapped to that order, minting a fresh 30-day token.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const orderId = searchParams.get('shopify_order_id');
  if (!process.env.HUB_SECRET || secret !== process.env.HUB_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!orderId) return Response.json({ error: 'shopify_order_id required' }, { status: 400 });

  const rows = await sql`
    SELECT id FROM proof_projects WHERE shopify_order_id = ${orderId}
    ORDER BY id DESC LIMIT 1`;
  if (!rows[0]) return Response.json({ error: 'No project for that order' }, { status: 404 });

  const token = await createTokenForProject(rows[0].id);
  return Response.json({ link: `${process.env.BASE_URL}/p/${token}` });
}
