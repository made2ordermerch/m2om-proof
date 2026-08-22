import { projectFromToken } from '@/lib/auth';
import { sql } from '@/lib/db';
import { skuWithProject, logEvent } from '@/lib/data';
import { sendEmail, internalRecipients } from '@/lib/email';
import { approvalConfirmedEmail, internalEmail } from '@/lib/templates';
import { skuLabel, APPROVAL_STATEMENT } from '@/lib/statuses';

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

  // Approve the latest proof version, or the one explicitly passed if it belongs here.
  let versions = await sql`
    SELECT * FROM proof_versions
    WHERE sku_id = ${skuId} AND kind = 'proof'
    ORDER BY version_number DESC`;
  if (!versions.length) {
    return Response.json({ error: 'No proof to approve yet.' }, { status: 400 });
  }
  let version = versions[0];
  if (version_id) {
    const match = versions.find((v) => v.id === Number(version_id));
    if (match) version = match;
  }

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

  const link = `${process.env.BASE_URL}/p/${token}`;
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

  return Response.json({ ok: true });
}
