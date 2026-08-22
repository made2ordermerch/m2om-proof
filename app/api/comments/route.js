import { isAdmin, projectFromToken } from '@/lib/auth';
import { sql } from '@/lib/db';
import { skuWithProject, logEvent } from '@/lib/data';
import { sendEmail, internalRecipients } from '@/lib/email';
import { teamRepliedEmail, internalEmail } from '@/lib/templates';
import { skuLabel } from '@/lib/statuses';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { sku_id, version_id, parent_id, pin, drawing, internal } = body;
  const text = (body.body || '').trim();

  const admin = isAdmin();
  let project = null;
  if (!admin) {
    project = await projectFromToken(request.headers.get('x-proof-token'));
    if (!project) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sku = await skuWithProject(Number(sku_id));
  if (!sku) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!admin && sku.project_id !== project.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (!text && !drawing) {
    return Response.json({ error: 'Write a comment first.' }, { status: 400 });
  }

  const role = admin ? 'team' : 'client';
  const authorName = admin ? 'M2OM Design Team' : sku.p_client_name;
  const isInternal = admin ? !!internal : false;

  let pinNumber = null;
  if (pin && version_id && !parent_id) {
    const count = await sql`
      SELECT COALESCE(MAX(pin_number), 0) AS n FROM proof_comments
      WHERE version_id = ${Number(version_id)} AND pin_number IS NOT NULL`;
    pinNumber = Number(count[0].n) + 1;
  }

  const rows = await sql`
    INSERT INTO proof_comments
      (sku_id, version_id, parent_id, author_role, author_name, body,
       pin_x, pin_y, pin_number, drawing, internal)
    VALUES
      (${sku.id}, ${version_id ? Number(version_id) : null},
       ${parent_id ? Number(parent_id) : null}, ${role}, ${authorName}, ${text},
       ${pin ? pin.x : null}, ${pin ? pin.y : null}, ${pinNumber},
       ${drawing ? JSON.stringify(drawing) : null}, ${isInternal})
    RETURNING id`;
  await logEvent(sku.p_id, 'comment_posted', { comment_id: rows[0].id, role, internal: isInternal });

  // Notifications
  if (role === 'client') {
    const adminLink = `${process.env.BASE_URL}/admin/project/${sku.p_id}`;
    const mail = internalEmail({
      ref: sku.p_ref,
      adminLink,
      title: `Client comment: ${skuLabel(sku)}`,
      detail: `${sku.p_client_name} commented on ${skuLabel(sku)}: "${text.slice(0, 300)}"`,
    });
    await sendEmail({ to: internalRecipients(), ...mail });
  } else if (!isInternal) {
    const tokens = await sql`
      SELECT token FROM proof_tokens
      WHERE project_id = ${sku.p_id} AND expires_at > now()
      ORDER BY id DESC LIMIT 1`;
    if (tokens[0]) {
      const link = `${process.env.BASE_URL}/p/${tokens[0].token}`;
      const mail = teamRepliedEmail({
        ref: sku.p_ref,
        link,
        clientName: sku.p_client_name,
        skuText: skuLabel(sku),
      });
      await sendEmail({ to: sku.p_client_email, ...mail });
    }
  }

  return Response.json({ id: rows[0].id });
}
