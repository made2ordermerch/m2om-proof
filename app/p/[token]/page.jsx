import { projectFromToken } from '@/lib/auth';
import { getProjectBundle } from '@/lib/data';
import ClientPortal from '@/components/ClientPortal';

export const dynamic = 'force-dynamic';

export default async function ClientPortalPage({ params }) {
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
  return <ClientPortal token={params.token} bundle={bundle} />;
}
