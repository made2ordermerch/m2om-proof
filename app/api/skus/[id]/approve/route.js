import { projectFromToken } from '@/lib/auth';
import { sql } from '@/lib/db';
import { skuWithProject, logEvent } from '@/lib/data';
import { sendEmail, internalRecipients } from '@/lib/email';
import { approvalConfirmedEmail, internalEmail } from '@/lib/templates';
import { skuLabel, APPROVAL_STATEMENT, portalLink } from '@/lib/statuses';

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
    return Response.json({ error: 'Already approved.' }, { status: 400 });
  }

  const { typed_name, agreed, version_id } = await request.json().catch(() => ({}));
  if (!agreed || !typed_name || !typed_name.trim()) {
    return Response.json(
      { error: 'Type your full name and confirm the approval statement.' },
      { status: 400 }
    );
  }

  const versions = await sql`
    SELECT * FROM proof_versions
    WHERE sku_id = ${skuId} AND kind = 'proof'
    ORDER BY version_number DESC`;
  if (!versions.length) {
    return Response.json({ error: 'No proof to approve yet.' }, { status: 400 });
  }

  // Only the newest proof can ever be approved. The browser says which version
  // it is looking at; if a newer one has landed since that tab loaded, the
  // approval is refused and the client is told to reload. Without this a
  // client on a stale tab could sign off v1 after v2 was uploaded, and v1 is
  // what would lock and go to print.
  const latest = versions[0];
  if (version_id && Number(version_id) !== latest.id) {
    return Response.json(
      {
        error: `A newer proof (v${latest.version_number}) has been uploaded since this page loaded. Reload to review the latest version before approving.`,
        stale: true,
        latest_version_id: latest.id,
      },
      { status: 409 }
    );
  }
  const version = latest;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null;

  await sql`
    INSERT INTO proof_approvals (sku_id, version_id, typed_name, statement, ip)
    VALUES (${skuId}, ${version.id}, ${typed_name.trim()}, ${APPROVAL_STATEMENT}, ${ip})`;
  await sql`UPDATE proof_versions SET locked = true WHERE id = ${version.id}`;
  await sql`
    UPDATE proof_skus SET status = 'approved', approved_version_id = ${version.id}
    WHERE id = ${skuId}`;
  await logEvent(project.id, 'approved', {
    sku_id: skuId,
    version_id: version.id,
    typed_name: typed_name.trim(),
  });

  const link = portalLink(token, skuId);
  const clientMail = approvalConfirmedEmail({
    ref: project.ref,
    link,
    clientName: project.client_name,
    skuText: skuLabel(sku),
    versionNumber: version.version_number,
    typedName: typed_name.trim(),
  });
  await sendEmail({ to: project.client_email, ...clientMail });

  const adminLink = `${process.env.BASE_URL}/admin/project/${project.id}`;
  const teamMail = internalEmail({
    ref: project.ref,
    adminLink,
    title: `APPROVED: ${skuLabel(sku)} (v${version.version_number})`,
    detail: `${project.client_name} approved ${skuLabel(sku)} v${version.version_number}, signed as "${typed_name.trim()}". The version is locked. Submit for production to begin the next business day, then flip the status to IN PRODUCTION.`,
  });
  await sendEmail({ to: internalRecipients(), ...teamMail });

  return Response.json({ ok: true, version_number: version.version_number });
}
