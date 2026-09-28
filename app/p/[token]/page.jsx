import { unstable_noStore as noStore } from 'next/cache';
import { projectFromToken } from '@/lib/auth';
import { getProjectBundle, hasApprovedBefore } from '@/lib/data';
import ClientPortal from '@/components/ClientPortal';

export const dynamic = 'force-dynamic';

export default async function ClientPortalPage({ params, searchParams }) {
  // This page reads no cookies or headers, so nothing else marks it as
  // uncacheable. Say so explicitly: a client must never see a render that
  // predates the latest proof.
  noStore();
  const project = await projectFromToken(params.token);

  if (!project) {
    return (
      <main className="wrap" style={{ maxWidth: 560, paddingTop: 60 }}>
        <h1 className="display" style={{ fontSize: 40 }}>LINK EXPIRED</h1>
        <div className="card mt">
          <p>
            This portal link has expired or is not valid. Links work for 30 days for security.
          </p>
          <a className="btn yl mt" href="/">REQUEST A FRESH LINK</a>
        </div>
      </main>
    );
  }

  const bundle = await getProjectBundle(project.id, { includeInternal: false });
  const returning = await hasApprovedBefore(project.client_email, project.id);
  // ?sku=<id> from an email lands the client straight on that design.
  const initialSkuId = Number(searchParams?.sku) || null;
  return (
    <ClientPortal
      token={params.token}
      bundle={bundle}
      returning={returning}
      initialSkuId={initialSkuId}
    />
  );
}
