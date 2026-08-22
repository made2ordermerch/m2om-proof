import { isAdmin, createTokenForProject } from '@/lib/auth';
import { sql } from '@/lib/db';
import { logEvent } from '@/lib/data';
import { sendEmail } from '@/lib/email';
import { inviteEmail } from '@/lib/templates';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!isAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { client_name, client_email, shopify_order_id, neon_lead_id, send_invite } = body;
  if (!client_name || !client_email) {
    return Response.json({ error: 'Name and email are required' }, { status: 400 });
  }

  const rows = await sql`
    INSERT INTO proof_projects (client_name, client_email, shopify_order_id, neon_lead_id)
    VALUES (${client_name.trim()}, ${client_email.trim().toLowerCase()},
            ${shopify_order_id || null}, ${neon_lead_id ? Number(neon_lead_id) : null})
    RETURNING id`;
  const id = rows[0].id;
  const ref = `PRJ-${1000 + id}`;
  await sql`UPDATE proof_projects SET ref = ${ref} WHERE id = ${id}`;

  const token = await createTokenForProject(id);
  await logEvent(id, 'project_created', { ref });

  if (send_invite) {
    const link = `${process.env.BASE_URL}/p/${token}`;
    const mail = inviteEmail({ ref, link, clientName: client_name.trim() });
    await sendEmail({ to: client_email.trim(), ...mail });
    await logEvent(id, 'invite_sent', {});
  }

  return Response.json({ id, ref });
}
