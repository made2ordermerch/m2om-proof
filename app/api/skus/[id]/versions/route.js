import { isAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { skuWithProject, logEvent } from '@/lib/data';
import { sendEmail } from '@/lib/email';
import { proofReadyEmail } from '@/lib/templates';
import { skuLabel } from '@/lib/statuses';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  if (!isAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const skuId = Number(params.id);
  const { file_url, file_pathname, kind, set_ready, notify } = await request.json().catch(() => ({}));
  if (!file_url || !['proof', 'mockup'].includes(kind)) {
    return Response.json({ error: 'file_url and a valid kind are required' }, { status: 400 });
  }
  const sku = await skuWithProject(skuId);
  if (!sku) return Response.json({ error: 'Not found' }, { status: 404 });

  const last = await sql`
    SELECT COALESCE(MAX(version_number), 0) AS n
    FROM proof_versions WHERE sku_id = ${skuId} AND kind = ${kind}`;
  const versionNumber = Number(last[0].n) + 1;

  const rows = await sql`
    INSERT INTO proof_versions (sku_id, version_number, kind, file_url, file_pathname)
    VALUES (${skuId}, ${versionNumber}, ${kind}, ${file_url}, ${file_pathname || null})
    RETURNING id`;
  await logEvent(sku.p_id, 'version_uploaded', { sku_id: skuId, kind, version: versionNumber });

  if (kind === 'proof' && set_ready) {
    await sql`UPDATE proof_skus SET status = 'proof_ready' WHERE id = ${skuId}`;
    if (notify) {
      const tokens = await sql`
        SELECT token FROM proof_tokens
        WHERE project_id = ${sku.p_id} AND expires_at > now()
        ORDER BY id DESC LIMIT 1`;
      if (tokens[0]) {
        const link = `${process.env.BASE_URL}/p/${tokens[0].token}`;
        const mail = proofReadyEmail({
          ref: sku.p_ref,
          link,
          clientName: sku.p_client_name,
          skuText: skuLabel(sku),
          versionNumber,
        });
        await sendEmail({ to: sku.p_client_email, ...mail });
      }
    }
  }

  return Response.json({ id: rows[0].id, version_number: versionNumber });
}
