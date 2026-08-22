import { projectFromToken } from '@/lib/auth';
import { sql } from '@/lib/db';
import { skuWithProject, logEvent } from '@/lib/data';
import { sendEmail, internalRecipients } from '@/lib/email';
import { internalEmail } from '@/lib/templates';
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

  await sql`UPDATE proof_skus SET status = 'edits_requested' WHERE id = ${skuId}`;
  await logEvent(project.id, 'edits_requested', { sku_id: skuId });

  const adminLink = `${process.env.BASE_URL}/admin/project/${project.id}`;
  const mail = internalEmail({
    ref: project.ref,
    adminLink,
    title: `Edits requested: ${skuLabel(sku)}`,
    detail: `${project.client_name} requested edits on ${skuLabel(sku)}. Their comments are in the portal.`,
  });
  await sendEmail({ to: internalRecipients(), ...mail });

  return Response.json({ ok: true });
}
