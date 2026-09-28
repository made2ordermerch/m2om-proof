import { isAdmin, createTokenForProject } from '@/lib/auth';
import { sql } from '@/lib/db';
import { logEvent } from '@/lib/data';
import { sendEmail } from '@/lib/email';
import { inviteEmail } from '@/lib/templates';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  if (!isAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const projectId = Number(params.id);
  const rows = await sql`SELECT * FROM proof_projects WHERE id = ${projectId}`;
  const project = rows[0];
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });

  const { resend } = await request.json().catch(() => ({}));
  // A regenerated link is a revocation: every earlier link stops working now.
  const token = await createTokenForProject(projectId, { retireOthers: true });
  const link = `${process.env.BASE_URL}/p/${token}`;

  if (resend) {
    const mail = inviteEmail({ ref: project.ref, link, clientName: project.client_name });
    await sendEmail({ to: project.client_email, ...mail });
  }
  await logEvent(projectId, 'token_generated', { resend: !!resend, retired_earlier: true });
  return Response.json({ link });
}
