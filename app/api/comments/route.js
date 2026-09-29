import { isAdmin, projectFromToken, activeTokenForProject } from '@/lib/auth';
import { sql } from '@/lib/db';
import { skuWithProject, logEvent, notifiedRecently } from '@/lib/data';
import { sendEmail, internalRecipients } from '@/lib/email';
import { teamRepliedEmail, reviewStartedEmail, clientRepliedEmail } from '@/lib/templates';
import { skuLabel, portalLink } from '@/lib/statuses';

export const dynamic = 'force-dynamic';

// A back-and-forth inside one review round should read as one conversation,
// not one email per message. Replies within this window after a notice for
// the same design ride on that earlier notice.
const REPLY_QUIET_MINUTES = 30;

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

  // A closed round stays closed. While the design is with the team the client
  // can only answer a thread the team has spoken in.
  if (!admin && sku.status === 'edits_requested') {
    let allowed = false;
    if (parent_id) {
      const rows = await sql`
        SELECT 1 FROM proof_comments
        WHERE (id = ${Number(parent_id)} OR parent_id = ${Number(parent_id)})
          AND author_role = 'team' AND internal = false
        LIMIT 1`;
      allowed = rows.length > 0;
    }
    if (!allowed) {
      return Response.json(
        { error: 'This design is with the design team. You will be able to comment again when the next version is ready.' },
        { status: 400 }
      );
    }
  }

  // A comment can only be filed against a version of the same design.
  let version = null;
  if (version_id) {
    const rows = await sql`
      SELECT id, version_number FROM proof_versions
      WHERE id = ${Number(version_id)} AND sku_id = ${sku.id}`;
    version = rows[0] || null;
    if (!version) {
      return Response.json({ error: 'That version does not belong to this design.' }, { status: 400 });
    }
  }
  if (parent_id) {
    const rows = await sql`
      SELECT id FROM proof_comments WHERE id = ${Number(parent_id)} AND sku_id = ${sku.id}`;
    if (!rows[0]) {
      return Response.json({ error: 'That thread does not belong to this design.' }, { status: 400 });
    }
  }

  const role = admin ? 'team' : 'client';
  const authorName = admin ? 'M2OM Design Team' : sku.p_client_name;
  const isInternal = admin ? !!internal : false;

  // Every top-level comment on a version is numbered in order, whatever its
  // kind, so a round reads as "1, 2, 3" in the thread, on the artwork, and
  // in the edits email. Internal notes are not numbered: the client never
  // sees them and a gap in their numbering would look like a missing edit.
  let pinNumber = null;
  if (version && !parent_id && !isInternal) {
    const count = await sql`
      SELECT COALESCE(MAX(pin_number), 0) AS n FROM proof_comments
      WHERE version_id = ${version.id} AND pin_number IS NOT NULL`;
    pinNumber = Number(count[0].n) + 1;
  }

  // A markup is anchored where the stroke starts, so it carries a numbered
  // marker on the artwork just like a pin.
  let anchor = pin || null;
  if (!anchor && drawing && Array.isArray(drawing) && Array.isArray(drawing[0])) {
    anchor = { x: Number(drawing[0][0]), y: Number(drawing[0][1]) };
  }

  // Whether this is the first thing the client has said about this version.
  // Decided before the insert so the new row does not count itself.
  let firstOnVersion = false;
  if (role === 'client' && !parent_id && version) {
    const prior = await sql`
      SELECT 1 FROM proof_comments
      WHERE version_id = ${version.id} AND author_role = 'client' AND parent_id IS NULL
      LIMIT 1`;
    firstOnVersion = prior.length === 0;
  }

  const rows = await sql`
    INSERT INTO proof_comments
      (sku_id, version_id, parent_id, author_role, author_name, body,
       pin_x, pin_y, pin_number, drawing, internal)
    VALUES
      (${sku.id}, ${version ? version.id : null},
       ${parent_id ? Number(parent_id) : null}, ${role}, ${authorName}, ${text},
       ${anchor ? anchor.x : null}, ${anchor ? anchor.y : null}, ${pinNumber},
       ${drawing ? JSON.stringify(drawing) : null}, ${isInternal})
    RETURNING id`;
  await logEvent(sku.p_id, 'comment_posted', { comment_id: rows[0].id, role, internal: isInternal });

  // Notifications. One heads-up when a round starts, one when a client answers
  // the team, one when the team answers the client. Everything else in the
  // round is silent, and the full list of comments travels with the edits
  // request.
  const adminLink = `${process.env.BASE_URL}/admin/project/${sku.p_id}`;
  let notified = false;

  if (role === 'client' && parent_id) {
    if (!(await notifiedRecently(sku.p_id, 'notify_client_reply', sku.id, REPLY_QUIET_MINUTES))) {
      const mail = clientRepliedEmail({
        ref: sku.p_ref,
        adminLink,
        clientName: sku.p_client_name,
        skuText: skuLabel(sku),
        body: text || 'Drawn markup, no text.',
      });
      notified = await sendEmail({ to: internalRecipients(), ...mail });
      if (notified) await logEvent(sku.p_id, 'notify_client_reply', { sku_id: sku.id });
    }
  } else if (role === 'client' && firstOnVersion) {
    const mail = reviewStartedEmail({
      ref: sku.p_ref,
      adminLink,
      clientName: sku.p_client_name,
      skuText: skuLabel(sku),
      versionNumber: version.version_number,
      body: text,
    });
    notified = await sendEmail({ to: internalRecipients(), ...mail });
    if (notified) await logEvent(sku.p_id, 'notify_review_started', { sku_id: sku.id, version_id: version.id });
  } else if (role === 'team' && !isInternal) {
    if (!(await notifiedRecently(sku.p_id, 'notify_team_reply', sku.id, REPLY_QUIET_MINUTES))) {
      const token = await activeTokenForProject(sku.p_id);
      if (token) {
        const mail = teamRepliedEmail({
          ref: sku.p_ref,
          link: portalLink(token, sku.id),
          clientName: sku.p_client_name,
          skuText: skuLabel(sku),
        });
        notified = await sendEmail({ to: sku.p_client_email, ...mail });
        if (notified) await logEvent(sku.p_id, 'notify_team_reply', { sku_id: sku.id });
      }
    }
  }

  return Response.json({ id: rows[0].id, notified });
}
