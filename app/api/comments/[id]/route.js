import { isAdmin, projectFromToken } from '@/lib/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const id = Number(params.id);
  const { resolved } = await request.json().catch(() => ({}));

  const rows = await sql`
    SELECT c.*, s.project_id FROM proof_comments c
    JOIN proof_skus s ON s.id = c.sku_id
    WHERE c.id = ${id}`;
  const comment = rows[0];
  if (!comment) return Response.json({ error: 'Not found' }, { status: 404 });

  if (!isAdmin()) {
    const project = await projectFromToken(request.headers.get('x-proof-token'));
    if (!project || project.id !== comment.project_id || comment.internal) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  await sql`UPDATE proof_comments SET resolved = ${!!resolved} WHERE id = ${id}`;
  return Response.json({ ok: true });
}
