// Email templates. Plain direct voice. No em dashes. No location.
// Client emails carry no project reference. The [PRJ-####] tag stays on internal
// emails only, where it is used to match threads to projects.
// Contact is limited to phone, SMS, and email.

const CONTACT =
  'Questions? Reply to this email, call 1-888-207-8731, or text 614-353-2369.';

// Anything a client typed goes through here before it lands in HTML.
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function btn(href, label) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#fffb00;border:1.5px solid #080808;box-shadow:4px 4px 0 #080808;">
  <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#080808;text-decoration:none;letter-spacing:1px;">${label}</a>
  </td></tr></table>`;
}

function wrap(inner) {
  return `<div style="background:#f4f3ee;padding:24px 12px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1.5px solid #080808;box-shadow:4px 4px 0 #080808;padding:32px 28px;font-family:Arial,sans-serif;color:#080808;font-size:16px;line-height:1.55;">
  ${inner}
  <p style="margin:28px 0 0;font-size:14px;color:#080808;">${CONTACT}</p>
  <p style="margin:16px 0 0;font-size:14px;color:#080808;"><strong>M2OM Design Team</strong><br>Made 2 Order Merch</p>
  </div></div>`;
}

// A list of open comments, used in the internal round emails so the team can
// read the whole round from the inbox before opening admin.
function commentList(comments) {
  if (!comments || !comments.length) return '<p>No open comments on this design.</p>';
  const items = comments
    .map((c) => {
      const kind = c.drawing ? 'Markup' : c.pin_x !== null && c.pin_x !== undefined ? 'Pin' : 'Comment';
      const where = c.pin_number ? `#${c.pin_number} ${kind}` : kind;
      const v = c.version_number ? ` on v${c.version_number}` : '';
      const body = c.body ? esc(c.body) : '<em>Drawn markup, no text.</em>';
      return `<li style="margin:0 0 10px;"><strong>${where}${v}:</strong> ${body}</li>`;
    })
    .join('');
  return `<ol style="padding-left:20px;margin:12px 0;">${items}</ol>`;
}

export function inviteEmail({ ref, link, clientName }) {
  return {
    subject: 'Your M2OM design portal',
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">Your design portal is ready</h1>
      <p>Hi ${esc(clientName)},</p>
      <p>This is where your design project lives from here on out. Review proofs, leave comments directly on the artwork, request edits, and approve final designs, all in one place.</p>
      ${btn(link, 'OPEN YOUR PORTAL')}
      <p style="font-size:14px;">This link works for 30 days. If it expires, request a fresh one anytime at the portal login page.</p>
    `),
  };
}

export function proofReadyEmail({ ref, link, clientName, skuText, versionNumber }) {
  return {
    subject: `Your proof is ready: ${skuText}`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">Proof v${versionNumber} is ready for review</h1>
      <p>Hi ${esc(clientName)},</p>
      <p>A new proof for <strong>${esc(skuText)}</strong> is ready in your portal.</p>
      ${btn(link, 'REVIEW YOUR PROOF')}
      <p>One thorough round of feedback keeps your project moving fast. Go through every detail: spelling, sizing, weights, barcodes, colors, and required label info. Flag everything you see in this round.</p>
    `),
  };
}

export function teamRepliedEmail({ ref, link, clientName, skuText }) {
  return {
    subject: `The design team replied: ${skuText}`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">New reply from the design team</h1>
      <p>Hi ${esc(clientName)},</p>
      <p>The design team responded to your feedback on <strong>${esc(skuText)}</strong>.</p>
      ${btn(link, 'VIEW THE REPLY')}
    `),
  };
}

export function approvalConfirmedEmail({ ref, link, clientName, skuText, versionNumber, typedName }) {
  return {
    subject: `Design approved and finalized: ${skuText}`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">Your design is approved</h1>
      <p>Hi ${esc(clientName)},</p>
      <p>This confirms your final approval of <strong>${esc(skuText)}</strong>, version v${versionNumber}, approved by ${esc(typedName)}.</p>
      <p>Your approved files are now locked and will be submitted for production to begin on the next business day.</p>
      <p><strong>You have 4 business hours from receipt of this email to flag anything.</strong> After that window, the approved files go to print exactly as approved.</p>
      ${btn(link, 'VIEW APPROVED DESIGN')}
    `),
  };
}

export function internalEmail({ ref, adminLink, title, detail }) {
  return {
    subject: `[${ref}] ${title}`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">${esc(title)}</h1>
      <p>${detail}</p>
      ${btn(adminLink, 'OPEN IN ADMIN')}
    `),
  };
}

// Sent once when a client posts their first comment on a version. Later
// comments in the same round are silent; the full list arrives with the
// edits request.
export function reviewStartedEmail({ ref, adminLink, clientName, skuText, versionNumber, body }) {
  return {
    subject: `[${ref}] ${clientName} started reviewing: ${skuText}`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">${esc(clientName)} started reviewing v${versionNumber}</h1>
      <p>First comment on <strong>${esc(skuText)}</strong>:</p>
      <p style="border-left:3px solid #080808;padding-left:12px;">${body ? esc(body) : '<em>Drawn markup, no text.</em>'}</p>
      <p>More comments in this round will not email you one by one. You get the full list when they send it for edits.</p>
      ${btn(adminLink, 'OPEN IN ADMIN')}
    `),
  };
}

// Sent when the client hits REQUEST EDITS. Carries every open comment so the
// round can be read in full from the inbox.
export function editsRequestedEmail({ ref, adminLink, clientName, skuText, versionNumber, note, openComments }) {
  return {
    subject: `[${ref}] EDITS REQUESTED: ${skuText} (v${versionNumber}, ${openComments.length} open)`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">Edits requested on v${versionNumber}</h1>
      <p><strong>${esc(clientName)}</strong> sent <strong>${esc(skuText)}</strong> back for edits.</p>
      ${note ? `<p><strong>Their note for this round:</strong></p><p style="border-left:3px solid #080808;padding-left:12px;">${esc(note)}</p>` : ''}
      <p><strong>Open comments (${openComments.length}):</strong></p>
      ${commentList(openComments)}
      <p>Upload the next version when it is ready. The status is now EDITS REQUESTED.</p>
      ${btn(adminLink, 'OPEN IN ADMIN')}
    `),
  };
}

export function clientRepliedEmail({ ref, adminLink, clientName, skuText, body }) {
  return {
    subject: `[${ref}] ${clientName} replied: ${skuText}`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">${esc(clientName)} replied to the design team</h1>
      <p>On <strong>${esc(skuText)}</strong>:</p>
      <p style="border-left:3px solid #080808;padding-left:12px;">${esc(body)}</p>
      ${btn(adminLink, 'OPEN IN ADMIN')}
    `),
  };
}
