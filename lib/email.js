import { google } from 'googleapis';

const SENDER = 'design@made2ordermerch.com';
const FROM = `M2OM Design Team <${SENDER}>`;

// Plain-text rendering of an HTML email body. Mail providers score HTML-only
// messages as more likely to be spam, and a text part is what a preview pane
// or a screen reader gets. Links come through as "LABEL: url" so the portal
// link survives the conversion.
export function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, label) => {
      const text = label.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      return text ? `${text}: ${href}` : href;
    })
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}

function encodeSubject(subject) {
  // RFC 2047 so a subject with any non-ASCII character does not get mangled.
  return /^[\x20-\x7e]*$/.test(subject) ? subject : `=?UTF-8?B?${b64(subject)}?=`;
}

export async function sendEmail({ to, subject, html, text }) {
  try {
    if (!process.env.GOOGLE_SA_KEY) {
      console.warn('GOOGLE_SA_KEY not set, skipping email:', subject);
      return false;
    }
    const key = JSON.parse(process.env.GOOGLE_SA_KEY);
    const auth = new google.auth.JWT(
      key.client_email,
      null,
      key.private_key,
      ['https://www.googleapis.com/auth/gmail.send'],
      SENDER
    );
    const gmail = google.gmail({ version: 'v1', auth });
    const toLine = Array.isArray(to) ? to.filter(Boolean).join(', ') : to;
    if (!toLine) return false;

    const boundary = `m2om_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const plain = text || htmlToText(html);
    const msg = [
      `From: ${FROM}`,
      `To: ${toLine}`,
      `Subject: ${encodeSubject(subject)}`,
      `Reply-To: ${SENDER}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(plain),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(html),
      `--${boundary}--`,
      '',
    ].join('\r\n');
    const raw = Buffer.from(msg)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return true;
  } catch (e) {
    // Never let email failures break the request.
    console.error('email send failed:', e?.message);
    return false;
  }
}

export function internalRecipients() {
  const list = [SENDER];
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL !== SENDER) {
    list.push(process.env.ADMIN_EMAIL);
  }
  return list;
}
