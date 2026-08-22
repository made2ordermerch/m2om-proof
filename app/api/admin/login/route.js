import { cookies } from 'next/headers';
import { adminCookieValue } from '@/lib/auth';

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: 'Invalid password' }, { status: 401 });
  }
  cookies().set('m2om_proof_admin', adminCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.json({ ok: true });
}
