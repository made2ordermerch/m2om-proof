import { sql } from './db';
import { withSignedUrls } from './blob';

// Full project bundle. includeInternal=false strips internal comments (client view).
export async function getProjectBundle(projectId, { includeInternal }) {
  const projects = await sql`SELECT * FROM proof_projects WHERE id = ${projectId}`;
  const project = projects[0];
  if (!project) return null;

  const skus = await sql`SELECT * FROM proof_skus WHERE project_id = ${projectId} ORDER BY id`;
  const rawVersions = await sql`
    SELECT v.* FROM proof_versions v
    JOIN proof_skus s ON s.id = v.sku_id
    WHERE s.project_id = ${projectId}
    ORDER BY v.id`;
  // The store is private, so raw file_url values are not fetchable by a browser.
  // Every version leaves here with a short-lived signed_url attached.
  const versions = await withSignedUrls(rawVersions);
  const comments = includeInternal
    ? await sql`
        SELECT c.* FROM proof_comments c
        JOIN proof_skus s ON s.id = c.sku_id
        WHERE s.project_id = ${projectId}
        ORDER BY c.id`
    : await sql`
        SELECT c.* FROM proof_comments c
        JOIN proof_skus s ON s.id = c.sku_id
        WHERE s.project_id = ${projectId} AND c.internal = false
        ORDER BY c.id`;
  const approvals = await sql`
    SELECT a.* FROM proof_approvals a
    JOIN proof_skus s ON s.id = a.sku_id
    WHERE s.project_id = ${projectId}
    ORDER BY a.id`;

  return { project, skus, versions, comments, approvals };
}

export async function skuWithProject(skuId) {
  const rows = await sql`
    SELECT s.*, p.id AS p_id, p.ref AS p_ref, p.client_name AS p_client_name,
           p.client_email AS p_client_email
    FROM proof_skus s JOIN proof_projects p ON p.id = s.project_id
    WHERE s.id = ${skuId}`;
  return rows[0] || null;
}

export async function logEvent(projectId, type, payload) {
  try {
    await sql`INSERT INTO proof_events (project_id, type, payload)
              VALUES (${projectId}, ${type}, ${JSON.stringify(payload || {})})`;
  } catch (e) {
    console.error('event log failed', e?.message);
  }
}
