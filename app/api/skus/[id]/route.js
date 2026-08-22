import { isAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  if (!isAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const skuId = Number(params.id);
  const body = await request.json().catch(() => ({}));
  const { size, product_type, variant_label, group_label } = body;

  await sql`UPDATE proof_skus SET
      size = COALESCE(${size ?? null}, size),
      product_type = COALESCE(${product_type ?? null}, product_type),
      variant_label = COALESCE(${variant_label ?? null}, variant_label),
      group_label = COALESCE(${group_label ?? null}, group_label)
    WHERE id = ${skuId}`;
  return Response.json({ ok: true });
}
