import { neon } from '@neondatabase/serverless';

let _sql = null;

// The Neon driver runs every query over fetch(). On Vercel, Next.js caches
// fetch() responses in its Data Cache unless told otherwise, and a page that
// never reads cookies or headers (the client portal) can be served rows from
// an earlier render: a proof uploaded after the client's first visit never
// appears, even on a fresh request from a new device. cache: 'no-store' makes
// every query go to the database, on every route, every time.
export function sql(strings, ...values) {
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL, {
      fetchOptions: { cache: 'no-store' },
    });
  }
  return _sql(strings, ...values);
}
