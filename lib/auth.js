import crypto from 'crypto';
import { cookies } from 'next/headers';
import { sql } from './db';

const SECRET = () => process.env.AUTH_SECRET || 'set-AUTH_SECRET';

// The cookie value is derived from the password as well as the secret. That
// makes ADMIN_PASSWORD the revocation lever: change it in Vercel and every
// signed-in session, on every device, is logged out on the next request.
export function adminCookieValue() {
  return crypto
    .createHmac('sha256', SECRET())
    .update(`m2om-proof-admin:${process.env.ADMIN_PASSWORD || ''}`)
    .digest('hex');
}

export function isAdmin() {
  try {
    const c = cookies().get('m2om_proof_admin');
    return !!c && c.value === adminCookieValue();
  } catch {
    return false;
  }
}

export function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

export async function projectFromToken(token) {
  if (!token) return null;
  const rows = await sql`
    SELECT p.* FROM proof_tokens t
    JOIN proof_projects p ON p.id = t.project_id
    WHERE t.token = ${token} AND t.expires_at > now()
    LIMIT 1`;
  return rows[0] || null;
}

// Mints a fresh 30-day link. With retireOthers, every earlier link for the
// project stops working at once, so a link that leaked or went to the wrong
// inbox cannot keep being used after a new one is issued.
export async function createTokenForProject(projectId, { retireOthers = false } = {}) {
  const token = newToken();
  const rows = await sql`INSERT INTO proof_tokens (project_id, token, expires_at)
            VALUES (${projectId}, ${token}, now() + interval '30 days')
            RETURNING id`;
  if (retireOthers) {
    await sql`UPDATE proof_tokens SET expires_at = now()
              WHERE project_id = ${projectId} AND id <> ${rows[0].id} AND expires_at > now()`;
  }
  return token;
}

// The newest working link for a project, or null when none is active.
export async function activeTokenForProject(projectId) {
  const rows = await sql`
    SELECT token FROM proof_tokens
    WHERE project_id = ${projectId} AND expires_at > now()
    ORDER BY id DESC LIMIT 1`;
  return rows[0]?.token || null;
}
