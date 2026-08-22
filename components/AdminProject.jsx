'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import SkuReview, { skuLabel, StatusBadge } from './SkuReview';

const STATUSES = [
  'artwork_ordered',
  'being_designed',
  'proof_ready',
  'edits_requested',
  'approved',
  'in_production',
];

export default function AdminProject({ bundle, portalLink }) {
  const router = useRouter();
  const { project, skus, versions, comments, approvals } = bundle;
  const [openSkuId, setOpenSkuId] = useState(skus.length === 1 ? skus[0].id : null);
  const [busy, setBusy] = useState(false);
  const [newSku, setNewSku] = useState({ size: '', product_type: 'Stand Up Pouch', variant_label: '', group_label: '' });
  const [notifyOnReady, setNotifyOnReady] = useState(true);

  async function addSku(e) {
    e.preventDefault();
    if (!newSku.size.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${project.id}/skus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSku),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert('Could not add SKU: ' + (j.error || res.status));
      return;
    }
    setNewSku({ size: '', product_type: newSku.product_type, variant_label: '', group_label: newSku.group_label });
    router.refresh();
  }

  async function setStatus(sku, status) {
    setBusy(true);
    const res = await fetch(`/api/skus/${sku.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notify: status === 'proof_ready' && notifyOnReady }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert('Status change failed: ' + (j.error || res.status));
    }
    router.refresh();
  }

  async function saveGroup(sku, value) {
    if ((sku.group_label || '') === value.trim()) return;
    const res = await fetch(`/api/skus/${sku.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_label: value.trim() }),
    });
    if (!res.ok) alert('Could not save group.');
    router.refresh();
  }

  async function uploadFile(sku, file, kind) {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await upload(`proofs/${project.id}/${sku.id}/${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      });
      const res = await fetch(`/api/skus/${sku.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: blob.url,
          file_pathname: blob.pathname,
          kind,
          set_ready: kind === 'proof',
          notify: notifyOnReady,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert('File uploaded but saving the version failed: ' + (j.error || res.status));
      }
      router.refresh();
    } catch (e) {
      alert('Upload failed: ' + (e?.message || 'unknown error'));
    }
    setBusy(false);
  }

  async function regenerateLink(resend) {
    setBusy(true);
    const res = await fetch(`/api/projects/${project.id}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resend }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (j.link) {
      try { await navigator.clipboard.writeText(j.link); } catch {}
      alert((resend ? 'New link emailed to the client.\n\n' : '') + 'Portal link copied:\n' + j.link);
      router.refresh();
    }
  }

  return (
    <main className="wrap">
      <div className="spread mb">
        <div>
          <h1 className="display">{project.ref}</h1>
          <p style={{ fontWeight: 700 }}>
            {project.client_name} · {project.client_email}
            {project.shopify_order_id ? ` · Shopify ${project.shopify_order_id}` : ''}
          </p>
        </div>
        <a className="btn sm" href="/admin">← ALL PROJECTS</a>
      </div>

      <div className="card off">
        <div className="spread">
          <div className="small" style={{ wordBreak: 'break-all' }}>
            <strong>PORTAL LINK:</strong>{' '}
            {portalLink || 'No active link. Generate one below.'}
          </div>
          <div className="row">
            <button className="btn sm" disabled={busy} onClick={() => regenerateLink(false)}>
              NEW LINK + COPY
            </button>
            <button className="btn sm yl" disabled={busy} onClick={() => regenerateLink(true)}>
              NEW LINK + EMAIL CLIENT
            </button>
          </div>
        </div>
        <label className="row mt small" style={{ fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={notifyOnReady}
            onChange={(e) => setNotifyOnReady(e.target.checked)}
          />
          Email the client when a proof is marked ready
        </label>
      </div>

      {(() => {
        const groupOrder = [];
        for (const s of skus) {
          const g = s.group_label || '';
          if (!groupOrder.includes(g)) groupOrder.push(g);
        }
        return groupOrder.map((g) => (
          <div key={g || '__ungrouped'}>
            {g && <div className="group-header">{g}</div>}
            {skus.filter((s) => (s.group_label || '') === g).map((sku) => {
        const skuVersions = versions.filter((v) => v.sku_id === sku.id);
        const skuComments = comments.filter((c) => c.sku_id === sku.id);
        const approval = approvals.find((a) => a.sku_id === sku.id);
        const open = openSkuId === sku.id;

        return (
          <div className="card" key={sku.id}>
            <div className="spread" style={{ cursor: 'pointer' }} onClick={() => setOpenSkuId(open ? null : sku.id)}>
              <h2 className="display">{skuLabel(sku)}</h2>
              <div className="row">
                <StatusBadge status={sku.status} />
                <span className="btn sm ghost">{open ? '▲' : '▼'}</span>
              </div>
            </div>

            {open && (
              <div className="mt">
                {approval && (
                  <div className="notice">
                    Approved by {approval.typed_name} on{' '}
                    {new Date(approval.created_at).toLocaleString()}.
                  </div>
                )}

                <div className="row mb">
                  <input
                    className="input"
                    style={{ maxWidth: 220 }}
                    placeholder="Group (optional)"
                    defaultValue={sku.group_label || ''}
                    onBlur={(e) => saveGroup(sku, e.target.value)}
                  />
                </div>
                <div className="row mb">
                  <select
                    className="select"
                    style={{ maxWidth: 260 }}
                    value={sku.status}
                    disabled={busy}
                    onChange={(e) => setStatus(sku, e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>
                    ))}
                  </select>

                  <label className="btn sm">
                    UPLOAD PROOF (JPG/PNG)
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      style={{ display: 'none' }}
                      disabled={busy}
                      onChange={(e) => uploadFile(sku, e.target.files?.[0], 'proof')}
                    />
                  </label>
                  <label className="btn sm">
                    UPLOAD MOCKUP (MP4)
                    <input
                      type="file"
                      accept="video/mp4"
                      style={{ display: 'none' }}
                      disabled={busy}
                      onChange={(e) => uploadFile(sku, e.target.files?.[0], 'mockup')}
                    />
                  </label>
                </div>

                <SkuReview
                  sku={sku}
                  versions={skuVersions}
                  comments={skuComments}
                  role="team"
                  token={null}
                  showInternalToggle
                />
              </div>
            )}
          </div>
        );
            })}
          </div>
        ));
      })()}

      <div className="card yl">
        <h2 className="display mb">ADD A SKU</h2>
        <form onSubmit={addSku}>
          <div className="row">
            <div style={{ flex: '1 1 120px' }}>
              <label className="label">Size</label>
              <input
                className="input"
                placeholder="6x9"
                value={newSku.size}
                onChange={(e) => setNewSku({ ...newSku, size: e.target.value })}
              />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <label className="label">Product type</label>
              <select
                className="select"
                value={newSku.product_type}
                onChange={(e) => setNewSku({ ...newSku, product_type: e.target.value })}
              >
                <option>Stand Up Pouch</option>
                <option>Box Pouch</option>
                <option>Flat Pouch</option>
                <option>Box</option>
                <option>Label</option>
                <option>Sticker</option>
              </select>
            </div>
            <div style={{ flex: '2 1 200px' }}>
              <label className="label">Flavor / variant</label>
              <input
                className="input"
                placeholder="Espresso Blend"
                value={newSku.variant_label}
                onChange={(e) => setNewSku({ ...newSku, variant_label: e.target.value })}
              />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <label className="label">Group (optional)</label>
              <input
                className="input"
                placeholder="Coffee Line"
                list="sku-groups"
                value={newSku.group_label}
                onChange={(e) => setNewSku({ ...newSku, group_label: e.target.value })}
              />
              <datalist id="sku-groups">
                {[...new Set(skus.map((s) => s.group_label).filter(Boolean))].map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
          </div>
          <button className="btn bk mt" disabled={busy} type="submit">ADD SKU</button>
        </form>
      </div>
    </main>
  );
}
