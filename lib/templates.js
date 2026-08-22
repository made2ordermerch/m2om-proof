// Email templates. Plain direct voice. No em dashes. No location.
// Contact is limited to phone, SMS, and email.

const CONTACT =
  'Questions? Reply to this email, call 1-888-207-8731, or text 614-353-2369.';

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

export function inviteEmail({ ref, link, clientName }) {
  return {
    subject: `[${ref}] Your M2OM design portal`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">Your design portal is ready</h1>
      <p>Hi ${clientName},</p>
      <p>This is where your design project lives from here on out. Review proofs, leave comments directly on the artwork, request edits, and approve final designs, all in one place.</p>
      ${btn(link, 'OPEN YOUR PORTAL')}
      <p style="font-size:14px;">This link works for 30 days. If it expires, request a fresh one anytime at the portal login page.</p>
    `),
  };
}

export function proofReadyEmail({ ref, link, clientName, skuText, versionNumber }) {
  return {
    subject: `[${ref}] Your proof is ready: ${skuText}`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">Proof v${versionNumber} is ready for review</h1>
      <p>Hi ${clientName},</p>
      <p>A new proof for <strong>${skuText}</strong> is ready in your portal.</p>
      ${btn(link, 'REVIEW YOUR PROOF')}
      <p>One thorough round of feedback keeps your project moving fast. Go through every detail: spelling, sizing, weights, barcodes, colors, and required label info. Flag everything you see in this round.</p>
    `),
  };
}

export function teamRepliedEmail({ ref, link, clientName, skuText }) {
  return {
    subject: `[${ref}] The design team replied: ${skuText}`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">New reply from the design team</h1>
      <p>Hi ${clientName},</p>
      <p>The design team responded to your feedback on <strong>${skuText}</strong>.</p>
      ${btn(link, 'VIEW THE REPLY')}
    `),
  };
}

export function approvalConfirmedEmail({ ref, link, clientName, skuText, versionNumber, typedName }) {
  return {
    subject: `[${ref}] Design approved and finalized: ${skuText}`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 16px;">Your design is approved</h1>
      <p>Hi ${clientName},</p>
      <p>This confirms your final approval of <strong>${skuText}</strong>, version v${versionNumber}, approved by ${typedName}.</p>
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
      <h1 style="font-size:24px;margin:0 0 16px;">${title}</h1>
      <p>${detail}</p>
      ${btn(adminLink, 'OPEN IN ADMIN')}
    `),
  };
}
