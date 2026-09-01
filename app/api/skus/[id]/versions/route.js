import { isAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { skuWithProject, logEvent } from '@/lib/data';
import { sendEmail } from '@/lib/email';
import { proofReadyEmail } from '@/lib/templates';
import { skuLabel } from '@/lib/statuses';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  if (!isAdmin()) {
    return Response.json({ error: 'Not signed in. Log in again and retry.' }, { status: 401 });
  }

  const skuId = Number(params.id);
  if (!Number.isInteger(skuId)) {
    return Response.json({ error: 'Bad SKU id' }, { status: 400 });
  }

  const { file_url, file_pathname, kind, set_ready, notify } =
    await request.json().catch(() => ({}));

  if (!file_url) return Response.json({ error: 'file_url is required' }, { status: 400 });
  if (!['proof', 'mockup'].includes(kind)) {
    return Response.json({ error: `Unknown asset kind "${kind}"` }, { status: 400 });
  }

  const sku = await skuWithProject(skuId);
  if (!sku) return Response.json({ error: 'SKU not found' }, { status: 404 });

  let versionId;
  let versionNumber;
  try {
    const last = await sql`
      SELECT COALESCE(MAX(version_number), 0) AS n
      FROM proof_versions WHERE sku_id = ${skuId} AND kind = ${kind}`;
    versionNumber = Number(last[0].n) + 1;

    const rows = await sql`
      INSERT INTO proof_versions (sku_id, version_number, kind, file_url, file_pathname)
      VALUES (${skuId}, ${versionNumber}, ${kind}, ${file_url}, ${file_pathname || null})
      RETURNING id`;
    versionId = rows[0].id;
  } catch (e) {
    // The file is already in Blob at this point. Say so, so nobody re-uploads
    // three times chasing a database error.
    console.error('[versions] insert failed:', e?.message || e);
    return Response.json(
      { error: `The file uploaded but the database rejected it: ${e?.message || 'unknown error'}` },
      { status: 500 }
    );
  }

  await logEvent(sku.p_id, 'version_uploaded', { sku_id: skuId, kind, version: versionNumber });

  // Everything past this point is a nicety. It must never fail the upload,
  // and the outcome is reported back so the admin UI can show what happened.
  let statusChanged = false;
  let notified = false;
  let notifyNote = null;

  if (kind === 'proof' && set_ready) {
    try {
      await sql`UPDATE proof_skus SET status = 'proof_ready' WHERE id = ${skuId}`;
      statusChanged = true;
    } catch (e) {
      console.error('[versions] status update failed:', e?.message || e);
      notifyNote = 'Proof saved but the status could not be set to PROOF READY.';
    }

    if (notify && statusChanged) {
      try {
        const tokens = await sql`
          SELECT token FROM proof_tokens
          WHERE project_id = ${sku.p_id} AND expires_at > now()
          ORDER BY id DESC LIMIT 1`;
        if (!tokens[0]) {
          notifyNote = 'No active portal link for this project, so no email was sent. Generate a link first.';
        } else {
          const link = `${process.env.BASE_URL}/p/${tokens[0].token}`;
          const mail = proofReadyEmail({
            ref: sku.p_ref,
            link,
            clientName: sku.p_client_name,
            skuText: skuLabel(sku),
            versionNumber,
          });
          await sendEmail({ to: sku.p_client_email, ...mail });
          notified = true;
        }
      } catch (e) {
        console.error('[versions] notify failed:', e?.message || e);
        notifyNote = 'Proof saved but the client email did not send.';
      }
    }
  }

  return Response.json({
    id: versionId,
    version_number: versionNumber,
    kind,
    status_changed: statusChanged,
    notified,
    note: notifyNote,
  });
}
