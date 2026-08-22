import { isAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Admin-only system check. Confirms which database the app is connected to,
// whether writes are landing, and lists every project with its SKU/version
// counts so duplicate test projects are obvious. No secrets are exposed.
export async function GET() {
  if (!isAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const out = {
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      GOOGLE_SA_KEY: !!process.env.GOOGLE_SA_KEY,
      BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
      ADMIN_EMAIL: !!process.env.ADMIN_EMAIL,
      BASE_URL: process.env.BASE_URL || null,
    },
  };

  try {
    const meta = await sql`SELECT current_database() AS db, current_user AS role`;
    out.database = meta[0];

    const counts = await sql`SELECT
      (SELECT count(*) FROM proof_projects) AS projects,
      (SELECT count(*) FROM proof_skus) AS skus,
      (SELECT count(*) FROM proof_versions) AS versions,
      (SELECT count(*) FROM proof_comments) AS comments,
      (SELECT count(*) FROM proof_tokens WHERE expires_at > now()) AS active_tokens`;
    out.counts = counts[0];

    out.projects = await sql`SELECT p.id, p.ref, p.client_email, p.created_at,
      (SELECT count(*) FROM proof_skus s WHERE s.project_id = p.id) AS skus,
      (SELECT count(*) FROM proof_versions v JOIN proof_skus s ON s.id = v.sku_id
        WHERE s.project_id = p.id) AS versions
      FROM proof_projects p ORDER BY p.id`;

    out.recent_versions = await sql`SELECT id, sku_id, kind, version_number,
      left(file_url, 70) AS file_url_start, created_at
      FROM proof_versions ORDER BY id DESC LIMIT 10`;
  } catch (e) {
    out.db_error = e?.message || String(e);
  }

  return Response.json(out);
}
