import { cookies } from 'next/headers';

export async function POST() {
  cookies().delete('m2om_proof_admin');
  return Response.json({ ok: true });
}
