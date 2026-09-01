import { put, del } from '@vercel/blob';
import { isAdmin } from '@/lib/auth';
import { BLOB_ACCESS, withSignedUrls } from '@/lib/blob';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Admin only. Proves, from the server, whether the Blob store is attached and
// the token is valid. If this passes and a browser upload still fails, the
// problem is in the browser leg (token route, content type, network), not the
// store. Uploads and then deletes a 1x1 PNG so nothing is left behind.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

export async function GET() {
  if (!isAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const out = {
    BLOB_READ_WRITE_TOKEN_present: !!process.env.BLOB_READ_WRITE_TOKEN,
    BASE_URL: process.env.BASE_URL || null,
    callback_url_the_browser_will_be_told_to_use: process.env.BASE_URL
      ? `${process.env.BASE_URL.replace(/\/+$/, '')}/api/upload`
      : 'BASE_URL not set, the SDK will guess from the browser address bar',
  };

  // Vercel Blob calls this URL after a client upload lands. If BASE_URL points
  // somewhere unreachable the browser leg can stall waiting on it, so prove the
  // route answers before blaming the file.
  if (process.env.BASE_URL) {
    const url = `${process.env.BASE_URL.replace(/\/+$/, '')}/api/upload`;
    try {
      const probe = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'probe' }),
        signal: AbortSignal.timeout(8000),
      });
      out.callback_route_reachable = true;
      out.callback_route_status = probe.status;
    } catch (e) {
      out.callback_route_reachable = false;
      out.callback_route_error = e?.message || String(e);
    }
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    out.result = 'FAIL';
    out.reason = 'No BLOB_READ_WRITE_TOKEN. Attach a Blob store to this Vercel project, then redeploy.';
    return Response.json(out);
  }

  try {
    const blob = await put(`diagnostics/blob-test-${Date.now()}.png`, ONE_PIXEL_PNG, {
      access: BLOB_ACCESS,
      contentType: 'image/png',
      addRandomSuffix: true,
    });
    out.store_access_mode = BLOB_ACCESS;
    out.wrote = blob.url;

    // A private store also has to be able to mint read URLs, or every proof
    // renders as a broken image even though the upload worked.
    const [signed] = await withSignedUrls([
      { file_url: blob.url, file_pathname: blob.pathname },
    ]);
    if (signed?.signed_url) {
      out.read_signing = 'PASS';
      out.signed_url_sample = `${signed.signed_url.slice(0, 90)}…`;
    } else {
      out.read_signing = 'FAIL';
      out.read_signing_reason = signed?.signed_error || 'No signed URL produced.';
    }

    out.result = out.read_signing === 'PASS' ? 'PASS' : 'FAIL';
    try {
      await del(blob.url);
      out.cleaned_up = true;
    } catch {
      out.cleaned_up = false;
    }
  } catch (e) {
    out.result = 'FAIL';
    out.reason = e?.message || String(e);
  }

  return Response.json(out);
}
