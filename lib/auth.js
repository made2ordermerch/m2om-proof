import crypto from 'crypto';
import { cookies } from 'next/headers';
import { sql } from './db';

const SECRET = () => process.env.AUTH_SECRET || 'set-AUTH_SECRET';

export function adminCookieValue() {
  return crypto.createHmac('sha256', SECRET()).update('m2om-proof-admin').digest('hex');
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

export async function createTokenForProject(projectId) {
  const token = newToken();
  await sql`INSERT INTO proof_tokens (project_id, token, expires_at)
            VALUES (${projectId}, ${token}, now() + interval '30 days')`;
  return token;
}
