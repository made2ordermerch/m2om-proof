import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import AdminDashboard from '@/components/AdminDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  if (!isAdmin()) redirect('/admin/login');

  const projects = await sql`
    SELECT p.*,
      (SELECT count(*) FROM proof_skus s WHERE s.project_id = p.id) AS sku_count,
      (SELECT count(*) FROM proof_comments c
        JOIN proof_skus s ON s.id = c.sku_id
        WHERE s.project_id = p.id AND c.resolved = false AND c.parent_id IS NULL) AS open_comments
    FROM proof_projects p
    ORDER BY p.id DESC`;

  return <AdminDashboard projects={projects} />;
}
