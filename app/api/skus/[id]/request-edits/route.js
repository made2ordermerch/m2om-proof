import { projectFromToken } from '@/lib/auth';
import { sql } from '@/lib/db';
import { skuWithProject, logEvent } from '@/lib/data';
import { sendEmail, internalRecipients } from '@/lib/email';
import { editsRequestedEmail } from '@/lib/templates';
import { skuLabel } from '@/lib/statuses';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const token = request.headers.get('x-proof-token');
  const project = await projectFromToken(token);
  if (!project) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const skuId = Number(params.id);
  const sku = await skuWithProject(skuId);
  if (!sku || sku.project_id !== project.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (['approved', 'in_production'].includes(sku.status)) {
    return Response.json({ error: 'This design is already approved.' }, { status: 400 });
  }
  if (sku.status === 'edits_requested') {
    return Response.json(
      { error: 'This design is already with the design team. You will get an email when the next version is ready.' },
      { status: 400 }
    );
  }

  const latest = await sql`
    SELECT id, version_number FROM proof_versions
    WHERE sku_id = ${skuId} AND kind = 'proof'
    ORDER BY version_number DESC LIMIT 1`;
  if (!latest[0]) {
    return Response.json({ error: 'There is no proof to send back yet.' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const note = String(body.note || '').trim().slice(0, 2000);

  // The round note is a real comment, so it lives in the thread with
  // everything else and is not lost in an inbox.
  if (note) {
    await sql`
      INSERT INTO proof_comments (sku_id, version_id, author_role, author_name, body)
      VALUES (${skuId}, ${latest[0].id}, 'client', ${project.client_name}, ${note})`;
  }

  await sql`UPDATE proof_skus SET status = 'edits_requested' WHERE id = ${skuId}`;

  const openComments = await sql`
    SELECT c.body, c.pin_number, c.drawing IS NOT NULL AS drawing, v.version_number
    FROM proof_comments c
    LEFT JOIN proof_versions v ON v.id = c.version_id
    WHERE c.sku_id = ${skuId} AND c.parent_id IS NULL AND c.resolved = false
      AND c.author_role = 'client'
    ORDER BY c.id`;

  await logEvent(project.id, 'edits_requested', {
    sku_id: skuId,
    version_id: latest[0].id,
    open_comments: openComments.length,
    note: !!note,
  });

  const adminLink = `${process.env.BASE_URL}/admin/project/${project.id}`;
  const mail = editsRequestedEmail({
    ref: project.ref,
    adminLink,
    clientName: project.client_name,
    skuText: skuLabel(sku),
    versionNumber: latest[0].version_number,
    note,
    openComments,
  });
  await sendEmail({ to: internalRecipients(), ...mail });

  return Response.json({ ok: true, open_comments: openComments.length });
}
