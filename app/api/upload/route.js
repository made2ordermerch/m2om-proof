import { handleUpload } from '@vercel/blob/client';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!isAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/jpeg', 'image/png', 'video/mp4'],
        maximumSizeInBytes: 200 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: e?.message || 'Upload failed' }, { status: 400 });
  }
}
