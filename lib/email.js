import { google } from 'googleapis';

const SENDER = 'design@made2ordermerch.com';
const FROM = `M2OM Design Team <${SENDER}>`;

export async function sendEmail({ to, subject, html }) {
  try {
    if (!process.env.GOOGLE_SA_KEY) {
      console.warn('GOOGLE_SA_KEY not set, skipping email:', subject);
      return;
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
    if (!toLine) return;
    const msg = [
      `From: ${FROM}`,
      `To: ${toLine}`,
      `Subject: ${subject}`,
      `Reply-To: ${SENDER}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      html,
    ].join('\r\n');
    const raw = Buffer.from(msg)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  } catch (e) {
    // Never let email failures break the request.
    console.error('email send failed:', e?.message);
  }
}

export function internalRecipients() {
  const list = [SENDER];
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL !== SENDER) {
    list.push(process.env.ADMIN_EMAIL);
  }
  return list;
}
