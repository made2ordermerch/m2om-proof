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

const PROOF_TYPES = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png'];
const MOCKUP_TYPES = ['video/mp4'];
const MAX_BYTES = 200 * 1024 * 1024;

// Blob pathnames are URLs. A designer's filename like
// "Acme Coffee 6x9 v2 (final) #2.jpg" contains characters that break the PUT or
// silently truncate the stored path. Reduce it to something URL safe and keep
// the extension so the browser still renders it as an image.
function safePathSegment(name) {
  const raw = String(name || 'file').split(/[\\/]/).pop();
  const dot = raw.lastIndexOf('.');
  const base = dot > 0 ? raw.slice(0, dot) : raw;
  const ext = (dot > 0 ? raw.slice(dot + 1) : '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const clean =
    base
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file';
  return ext ? `${clean}.${ext}` : clean;
}

function mb(bytes) {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

export default function AdminProject({ bundle, portalLink }) {
  const router = useRouter();
  const { project, skus, versions, comments, approvals } = bundle;
  const [openSkuId, setOpenSkuId] = useState(skus.length === 1 ? skus[0].id : null);
  const [busy, setBusy] = useState(false);
  const [newSku, setNewSku] = useState({ size: '', product_type: 'Stand Up Pouch', variant_label: '', group_label: '' });
  const [notifyOnReady, setNotifyOnReady] = useState(true);

  // Per SKU and per kind upload state, so one upload never disables the whole
  // page and every failure stays on screen instead of vanishing with an alert.
  const [uploads, setUploads] = useState({});

  function setUploadState(key, patch) {
    setUploads((u) => ({ ...u, [key]: { ...(u[key] || {}), ...patch } }));
  }
  function clearUploadState(key) {
    setUploads((u) => {
      const next = { ...u };
      delete next[key];
      return next;
    });
  }

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

  async function uploadFile(sku, kind, inputEl) {
    const file = inputEl?.files?.[0];
    // Clearing the input immediately is what lets the same file be picked again
    // after a failure. Without it the change event never fires on retry and the
    // button appears completely dead.
    if (inputEl) inputEl.value = '';
    if (!file) return;

    const key = `${sku.id}:${kind}`;
    const allowed = kind === 'proof' ? PROOF_TYPES : MOCKUP_TYPES;

    setUploadState(key, { active: true, stage: 'Checking file', error: null, note: null, name: file.name });

    try {
      if (file.size > MAX_BYTES) {
        throw new Error(`That file is ${mb(file.size)}. The limit is 200 MB.`);
      }
      if (!allowed.includes(file.type)) {
        throw new Error(
          `This file reports its type as "${file.type || 'unknown'}". ` +
            (kind === 'proof' ? 'Proofs must be JPG or PNG.' : 'Mockups must be MP4.') +
            ' Re-export it and try again.'
        );
      }

      setUploadState(key, { stage: `Uploading ${mb(file.size)}` });
      const pathname = `proofs/${project.id}/${sku.id}/${safePathSegment(file.name)}`;
      const blob = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        contentType: file.type || undefined,
      });

      setUploadState(key, { stage: 'Saving version' });
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
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Could not save the version (HTTP ${res.status}).`);

      const label = kind === 'proof' ? `Proof v${j.version_number}` : `Mockup v${j.version_number}`;
      setUploadState(key, {
        active: false,
        stage: j.notified ? `${label} uploaded and the client was emailed.` : `${label} uploaded.`,
        note: j.note || null,
        error: null,
      });
      router.refresh();
      if (!j.note) setTimeout(() => clearUploadState(key), 6000);
    } catch (e) {
      console.error('[proof upload]', e);
      setUploadState(key, {
        active: false,
        stage: null,
        error: e?.message || 'Upload failed for an unknown reason. Check the browser console.',
      });
    }
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

  function UploadStatus({ skuId, kind }) {
    const s = uploads[`${skuId}:${kind}`];
    if (!s) return null;
    if (s.error) {
      return (
        <div className="notice mt" style={{ borderColor: '#080808' }}>
          <strong>{kind === 'proof' ? 'PROOF' : 'MOCKUP'} UPLOAD FAILED.</strong>{' '}
          {s.error}
          {s.name ? <div className="small mt">File: {s.name}</div> : null}
          <button
            className="btn sm mt"
            onClick={() => clearUploadState(`${skuId}:${kind}`)}
          >
            DISMISS
          </button>
        </div>
      );
    }
    return (
      <div className="notice mt">
        {s.active ? `${s.stage}…` : s.stage}
        {s.note ? <div className="small mt">{s.note}</div> : null}
      </div>
    );
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
        const proofBusy = !!uploads[`${sku.id}:proof`]?.active;
        const mockupBusy = !!uploads[`${sku.id}:mockup`]?.active;

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

                  <label className="btn sm" style={proofBusy ? { opacity: 0.5 } : undefined}>
                    {proofBusy ? 'UPLOADING…' : 'UPLOAD PROOF (JPG/PNG)'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                      style={{ display: 'none' }}
                      disabled={proofBusy}
                      onChange={(e) => uploadFile(sku, 'proof', e.target)}
                    />
                  </label>
                  <label className="btn sm" style={mockupBusy ? { opacity: 0.5 } : undefined}>
                    {mockupBusy ? 'UPLOADING…' : 'UPLOAD MOCKUP (MP4)'}
                    <input
                      type="file"
                      accept="video/mp4,.mp4"
                      style={{ display: 'none' }}
                      disabled={mockupBusy}
                      onChange={(e) => uploadFile(sku, 'mockup', e.target)}
                    />
                  </label>
                </div>

                <UploadStatus skuId={sku.id} kind="proof" />
                <UploadStatus skuId={sku.id} kind="mockup" />

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
