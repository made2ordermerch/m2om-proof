'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminDashboard({ projects }) {
  const router = useRouter();
  const [form, setForm] = useState({
    client_name: '',
    client_email: '',
    shopify_order_id: '',
    neon_lead_id: '',
    send_invite: true,
  });
  const [busy, setBusy] = useState(false);

  async function createProject(e) {
    e.preventDefault();
    if (!form.client_name.trim() || !form.client_email.trim() || busy) return;
    setBusy(true);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (res.ok) {
      const j = await res.json();
      setForm({ client_name: '', client_email: '', shopify_order_id: '', neon_lead_id: '', send_invite: true });
      router.push('/admin/project/' + j.id);
    } else {
      alert('Could not create the project.');
    }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  return (
    <main className="wrap">
      <div className="spread mb">
        <h1 className="display">PROOFING · ADMIN</h1>
        <div className="row">
          <a className="btn sm" href="/api/admin/health" target="_blank" rel="noreferrer">SYSTEM CHECK</a>
          <button className="btn sm" onClick={logout}>LOG OUT</button>
        </div>
      </div>

      <div className="card yl">
        <h2 className="display mb">NEW PROJECT</h2>
        <form onSubmit={createProject}>
          <div className="row">
            <div style={{ flex: '1 1 200px' }}>
              <label className="label">Client name</label>
              <input className="input" value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <label className="label">Client email</label>
              <input className="input" type="email" value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })} />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label className="label">Shopify order # (optional)</label>
              <input className="input" value={form.shopify_order_id}
                onChange={(e) => setForm({ ...form, shopify_order_id: e.target.value })} />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <label className="label">Lead ID (optional)</label>
              <input className="input" value={form.neon_lead_id}
                onChange={(e) => setForm({ ...form, neon_lead_id: e.target.value })} />
            </div>
          </div>
          <label className="row mt small" style={{ fontWeight: 700 }}>
            <input type="checkbox" checked={form.send_invite}
              onChange={(e) => setForm({ ...form, send_invite: e.target.checked })} />
            Email the portal link to the client now
          </label>
          <button className="btn bk mt" disabled={busy} type="submit">CREATE PROJECT</button>
        </form>
      </div>

      <div className="card">
        <h2 className="display mb">PROJECTS</h2>
        {projects.length === 0 && <p>No projects yet.</p>}
        {projects.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="plain">
              <thead>
                <tr>
                  <th>Ref</th><th>Client</th><th>SKUs</th><th>Open pins</th><th>Created</th><th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 800 }}>{p.ref}</td>
                    <td>{p.client_name}<br /><span className="small">{p.client_email}</span></td>
                    <td>{p.sku_count}</td>
                    <td>{p.open_comments}</td>
                    <td className="small">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td><a className="btn sm yl" href={'/admin/project/' + p.id}>OPEN</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
