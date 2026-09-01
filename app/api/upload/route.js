import { handleUpload } from '@vercel/blob/client';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Browsers do not always report the same string for the same file. Windows and
// some export tools report image/jpg or image/pjpeg for an ordinary JPG. If the
// reported type is not on this list Vercel Blob rejects the PUT and the upload
// dies with no obvious cause.
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'video/mp4',
];

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const type = body?.type;

  // Only the browser asking for an upload token needs an admin session.
  //
  // blob.upload-completed is a server to server callback fired by Vercel Blob
  // after the file lands. It carries no cookies, so an isAdmin() check at the
  // top of this route 401s every callback. handleUpload authenticates that
  // event properly by verifying the x-vercel-signature header against the read
  // write token, which is why the guard has to be scoped to the token event.
  if (type === 'blob.generate-client-token' && !isAdmin()) {
    return Response.json({ error: 'Not signed in. Log in again and retry.' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: 'BLOB_READ_WRITE_TOKEN is missing on this deployment. Attach a Blob store in Vercel, then redeploy.' },
      { status: 500 }
    );
  }

  // The SDK no longer infers the callback host from the browser address bar, so
  // it has to be stated. Without this the completion callback never arrives.
  const callbackUrl = process.env.BASE_URL
    ? `${process.env.BASE_URL.replace(/\/+$/, '')}/api/upload`
    : undefined;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: 200 * 1024 * 1024,
        addRandomSuffix: true,
        // Default is one hour. A large mockup on a slow uplink can outrun that,
        // and the failure reads as a generic access denied.
        validUntil: Date.now() + 2 * 60 * 60 * 1000,
        ...(callbackUrl ? { callbackUrl } : {}),
      }),
      onUploadCompleted: async () => {
        // The version row is written by /api/skus/[id]/versions once the browser
        // has the blob URL. Nothing to do here, but the handler must exist and
        // must not throw.
      },
    });
    return Response.json(json);
  } catch (e) {
    console.error('[upload] event=%s error=%s', type, e?.message || e);
    return Response.json({ error: e?.message || 'Upload failed' }, { status: 400 });
  }
}
