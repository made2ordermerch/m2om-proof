import { isAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { logEvent } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  if (!isAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const projectId = Number(params.id);
  const { size, product_type, variant_label } = await request.json().catch(() => ({}));
  if (!size || !product_type) {
    return Response.json({ error: 'Size and product type are required' }, { status: 400 });
  }
  const rows = await sql`
    INSERT INTO proof_skus (project_id, size, product_type, variant_label)
    VALUES (${projectId}, ${size.trim()}, ${product_type.trim()}, ${(variant_label || '').trim()})
    RETURNING id`;
  await logEvent(projectId, 'sku_added', { sku_id: rows[0].id, size, product_type, variant_label });
  return Response.json({ id: rows[0].id });
}
