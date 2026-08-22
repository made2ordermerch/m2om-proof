import { isAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { skuWithProject, logEvent } from '@/lib/data';
import { sendEmail } from '@/lib/email';
import { proofReadyEmail } from '@/lib/templates';
import { STATUSES, skuLabel } from '@/lib/statuses';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  if (!isAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const skuId = Number(params.id);
  const { status, notify } = await request.json().catch(() => ({}));
  if (!STATUSES.includes(status)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 });
  }
  const sku = await skuWithProject(skuId);
  if (!sku) return Response.json({ error: 'Not found' }, { status: 404 });

  await sql`UPDATE proof_skus SET status = ${status} WHERE id = ${skuId}`;
  await logEvent(sku.p_id, 'status_changed', { sku_id: skuId, status });

  if (status === 'proof_ready' && notify) {
    const tokens = await sql`
      SELECT token FROM proof_tokens
      WHERE project_id = ${sku.p_id} AND expires_at > now()
      ORDER BY id DESC LIMIT 1`;
    if (tokens[0]) {
      const versions = await sql`
        SELECT version_number FROM proof_versions
        WHERE sku_id = ${skuId} AND kind = 'proof'
        ORDER BY version_number DESC LIMIT 1`;
      const link = `${process.env.BASE_URL}/p/${tokens[0].token}`;
      const mail = proofReadyEmail({
        ref: sku.p_ref,
        link,
        clientName: sku.p_client_name,
        skuText: skuLabel(sku),
        versionNumber: versions[0]?.version_number || 1,
      });
      await sendEmail({ to: sku.p_client_email, ...mail });
    }
  }

  return Response.json({ ok: true });
}
