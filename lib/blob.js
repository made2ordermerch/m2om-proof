import { issueSignedToken, presignUrl } from '@vercel/blob';

// The Blob store is private, so a raw file_url is not fetchable by a browser.
// Every read has to be a presigned URL. The browser still fetches straight from
// Vercel's CDN with the signature attached, so our functions stay out of the
// data path and there is no per-view streaming cost.
//
// Access mode is fixed at store creation and cannot be changed, so this is not
// a switch that can be flipped back. Uploads must use access: 'private' to
// match, see components/AdminProject.jsx.
export const BLOB_ACCESS = 'private';

// How long a generated proof link stays good. Pages are force-dynamic, so a
// fresh set is minted on every page load. This only matters for a tab that has
// been sitting open, which the viewers handle with a reload prompt.
export const READ_URL_TTL_MS = 12 * 60 * 60 * 1000;

// Older rows may predate file_pathname being stored. Recover it from the URL.
export function pathnameForVersion(version) {
  if (version?.file_pathname) return version.file_pathname;
  try {
    return decodeURIComponent(new URL(version.file_url).pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

// Adds signed_url to each version row. Never throws: a signing failure returns
// the rows with signed_url null and signed_error set, so the page still renders
// and the reason is visible instead of a blank frame.
export async function withSignedUrls(versions) {
  if (!Array.isArray(versions) || versions.length === 0) return versions || [];

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return versions.map((v) => ({
      ...v,
      signed_url: null,
      signed_error: 'BLOB_READ_WRITE_TOKEN is missing on this deployment.',
    }));
  }

  const validUntil = Date.now() + READ_URL_TTL_MS;

  let signedToken;
  try {
    // One delegation per request, read only, then a per-pathname signature off
    // the back of it. Scoping operations to get means a leaked link cannot
    // write or delete.
    signedToken = await issueSignedToken({
      pathname: '*',
      operations: ['get'],
      validUntil,
    });
  } catch (e) {
    console.error('[blob] issueSignedToken failed:', e?.message || e);
    return versions.map((v) => ({
      ...v,
      signed_url: null,
      signed_error: e?.message || 'Could not issue a signed token.',
    }));
  }

  return Promise.all(
    versions.map(async (v) => {
      const pathname = pathnameForVersion(v);
      if (!pathname) {
        return { ...v, signed_url: null, signed_error: 'No stored pathname for this version.' };
      }
      try {
        const { presignedUrl } = await presignUrl(signedToken, {
          operation: 'get',
          access: BLOB_ACCESS,
          pathname,
          validUntil,
        });
        return { ...v, signed_url: presignedUrl, signed_expires_at: validUntil };
      } catch (e) {
        console.error('[blob] presignUrl failed for %s: %s', pathname, e?.message || e);
        return { ...v, signed_url: null, signed_error: e?.message || 'Could not sign this file.' };
      }
    })
  );
}
