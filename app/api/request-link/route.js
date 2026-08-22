import { sql } from '@/lib/db';
import { createTokenForProject } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { inviteEmail } from '@/lib/templates';

export const dynamic = 'force-dynamic';

// Always responds ok so the form can't be used to probe which emails exist.
export async function POST(request) {
  const { email } = await request.json().catch(() => ({}));
  if (!email || typeof email !== 'string') return Response.json({ ok: true });

  const projects = await sql`
    SELECT * FROM proof_projects
    WHERE lower(client_email) = ${email.trim().toLowerCase()}
    ORDER BY id DESC LIMIT 5`;

  for (const project of projects) {
    const token = await createTokenForProject(project.id);
    const link = `${process.env.BASE_URL}/p/${token}`;
    const mail = inviteEmail({ ref: project.ref, link, clientName: project.client_name });
    await sendEmail({ to: project.client_email, ...mail });
  }

  return Response.json({ ok: true });
}
