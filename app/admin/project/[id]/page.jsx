import { redirect, notFound } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getProjectBundle } from '@/lib/data';
import AdminProject from '@/components/AdminProject';

export const dynamic = 'force-dynamic';

export default async function AdminProjectPage({ params }) {
  if (!isAdmin()) redirect('/admin/login');

  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  const bundle = await getProjectBundle(id, { includeInternal: true });
  if (!bundle) notFound();

  const tokens = await sql`
    SELECT token FROM proof_tokens
    WHERE project_id = ${id} AND expires_at > now()
    ORDER BY id DESC LIMIT 1`;
  const base = process.env.BASE_URL || '';
  const portalLink = tokens[0] ? `${base}/p/${tokens[0].token}` : null;

  return <AdminProject bundle={bundle} portalLink={portalLink} />;
}
