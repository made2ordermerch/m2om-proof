'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProofViewer from './ProofViewer';

const STATUS_LABELS = {
  artwork_ordered: 'ARTWORK ORDERED',
  being_designed: 'BEING DESIGNED',
  proof_ready: 'PROOF READY',
  edits_requested: 'EDITS REQUESTED',
  approved: 'APPROVED',
  in_production: 'IN PRODUCTION',
};

export function skuLabel(sku) {
  const parts = [sku.size, sku.product_type];
  if (sku.variant_label) parts.push(sku.variant_label);
  return parts.join(' - ');
}

export function StatusBadge({ status }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status] || status}</span>;
}

// role: 'client' | 'team'. token: proof token for client requests (null for admin).
// showInternalToggle: admin can post internal-only comments.
export default function SkuReview({ sku, versions, comments, role, token, showInternalToggle }) {
  const router = useRouter();
  const proofs = versions.filter((v) => v.kind === 'proof');
  const mockups = versions.filter((v) => v.kind === 'mockup');
  const [selectedId, setSelectedId] = useState(
    proofs.length ? proofs[proofs.length - 1].id : mockups.length ? mockups[0].id : null
  );
  const selected = versions.find((v) => v.id === selectedId) || null;

  const [mode, setMode] = useState('browse');
  const [drawMode, setDrawMode] = useState(false);
  const [pendingPin, setPendingPin] = useState(null);
  const [pendingDrawing, setPendingDrawing] = useState(null);
  const [activePinId, setActivePinId] = useState(null);
  const [pinText, setPinText] = useState('');
  const [generalText, setGeneralText] = useState('');
  const [replyText, setReplyText] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-proof-token'] = token;

  const versionComments = useMemo(
    () => comments.filter((c) => c.version_id === selected?.id),
    [comments, selected]
  );
  const pins = versionComments.filter((c) => c.pin_x !== null && !c.parent_id);
  const drawingsData = versionComments
    .filter((c) => c.drawing && !c.parent_id)
    .map((c) => ({ id: c.id, points: c.drawing, resolved: c.resolved }));
  const generals = comments.filter(
    (c) => c.sku_id === sku.id && !c.parent_id && c.pin_x === null && !c.drawing
  );
  const replies = (parentId) => comments.filter((c) => c.parent_id === parentId);

  async function post(url, body) {
    setBusy(true);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || 'Something went wrong. Try again.');
      return false;
    }
    router.refresh();
    return true;
  }

  async function submitPin() {
    if (!pinText.trim() && !pendingDrawing) return;
    const ok = await post('/api/comments', {
      sku_id: sku.id,
      version_id: selected.id,
      body: pinText.trim(),
      pin: pendingPin,
      drawing: pendingDrawing,
      internal: showInternalToggle ? internal : false,
    });
    if (ok) {
      setPinText('');
      setPendingPin(null);
      setPendingDrawing(null);
      setDrawMode(false);
      setMode('browse');
    }
  }

  async function submitGeneral() {
    if (!generalText.trim()) return;
    const ok = await post('/api/comments', {
      sku_id: sku.id,
      version_id: null,
      body: generalText.trim(),
      internal: showInternalToggle ? internal : false,
    });
    if (ok) setGeneralText('');
  }

  async function submitReply(parentId) {
    if (!replyText.trim()) return;
    const ok = await post('/api/comments', {
      sku_id: sku.id,
      version_id: selected?.id || null,
      parent_id: parentId,
      body: replyText.trim(),
      internal: showInternalToggle ? internal : false,
    });
    if (ok) {
      setReplyText('');
      setActivePinId(null);
    }
  }

  async function toggleResolve(comment) {
    setBusy(true);
    await fetch(`/api/comments/${comment.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ resolved: !comment.resolved }),
    });
    setBusy(false);
    router.refresh();
  }

  const activePin = pins.find((p) => p.id === activePinId);

  function Thread({ c, anchored }) {
    return (
      <div className={`comment ${c.internal ? 'internal' : ''} ${c.resolved ? 'resolved' : ''}`}>
        <div className="meta">
          {anchored && c.pin_number ? `PIN ${c.pin_number} · ` : ''}
          {c.author_name}
          {c.internal ? ' · INTERNAL' : ''}
          {c.resolved ? ' · RESOLVED' : ''}
        </div>
        {c.body && <div>{c.body}</div>}
        {c.drawing && !c.body && <div className="small">Markup on the artwork.</div>}
        {replies(c.id).map((r) => (
          <div key={r.id} className="replies">
            <div className="meta">{r.author_name}{r.internal ? ' · INTERNAL' : ''}</div>
            <div>{r.body}</div>
          </div>
        ))}
        <div className="row mt">
          {activePinId === c.id ? (
            <div style={{ width: '100%' }}>
              <textarea
                className="textarea"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply"
              />
              <div className="row mt">
                <button className="btn sm yl" disabled={busy} onClick={() => submitReply(c.id)}>
                  REPLY
                </button>
                <button className="btn sm ghost" onClick={() => setActivePinId(null)}>
                  CANCEL
                </button>
              </div>
            </div>
          ) : (
            <>
              <button className="btn sm" onClick={() => { setActivePinId(c.id); setReplyText(''); }}>
                REPLY
              </button>
              <button className="btn sm" disabled={busy} onClick={() => toggleResolve(c)}>
                {c.resolved ? 'REOPEN' : 'RESOLVE'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Version selector */}
      <div className="row mb">
        {proofs.map((v) => (
          <button
            key={v.id}
            className={`pill ${v.id === selectedId ? 'active' : ''}`}
            onClick={() => { setSelectedId(v.id); setPendingPin(null); setActivePinId(null); }}
          >
            v{v.version_number}{v.locked ? ' ✓' : ''}
          </button>
        ))}
        {mockups.map((v) => (
          <button
            key={v.id}
            className={`pill ${v.id === selectedId ? 'active' : ''}`}
            onClick={() => { setSelectedId(v.id); setPendingPin(null); setActivePinId(null); }}
          >
            MOCKUP {v.version_number}
          </button>
        ))}
      </div>

      {!selected && (
        <div className="card off">
          <p>No proofs uploaded yet. You will get an email the moment the first proof is ready.</p>
        </div>
      )}

      {selected && selected.kind === 'mockup' && (
        <div className="viewer-frame">
          <video src={selected.file_url} controls playsInline style={{ display: 'block', width: '100%' }} />
        </div>
      )}

      {selected && selected.kind === 'proof' && (
        <>
          {/* Mode toggle */}
          <div className="row mb">
            <button
              className={`pill ${mode === 'browse' ? 'active' : ''}`}
              onClick={() => { setMode('browse'); setDrawMode(false); setPendingPin(null); }}
            >
              BROWSE
            </button>
            <button
              className={`pill ${mode === 'pin' ? 'active' : ''}`}
              onClick={() => setMode('pin')}
            >
              PIN A COMMENT
            </button>
            {mode === 'pin' && (
              <button
                className={`pill ${drawMode ? 'active' : ''}`}
                onClick={() => { setDrawMode(!drawMode); setPendingPin(null); }}
              >
                ✎ DRAW
              </button>
            )}
          </div>

          {mode === 'pin' && !pendingPin && !pendingDrawing && (
            <p className="small mb" style={{ fontWeight: 700 }}>
              {drawMode
                ? 'Draw directly on the artwork, then add your note.'
                : 'Tap the exact spot on the artwork you want to comment on.'}
            </p>
          )}

          <ProofViewer
            imageUrl={selected.file_url}
            pins={pins}
            drawings={drawingsData}
            mode={mode}
            drawMode={drawMode}
            pendingPin={pendingPin}
            activePinId={activePinId}
            onPlacePin={(p) => { setPendingPin(p); setPendingDrawing(null); }}
            onFinishDrawing={(points) => { setPendingDrawing(points); setPendingPin(null); }}
            onSelectPin={(id) => { setActivePinId(id === activePinId ? null : id); setReplyText(''); }}
          />

          {(pendingPin || pendingDrawing) && (
            <div className="card yl mt">
              <div className="meta" style={{ fontWeight: 800, marginBottom: 6 }}>
                {pendingDrawing ? 'YOUR MARKUP' : 'NEW PIN'}
              </div>
              <textarea
                className="textarea"
                value={pinText}
                onChange={(e) => setPinText(e.target.value)}
                placeholder="What needs to change here?"
                autoFocus
              />
              {showInternalToggle && (
                <label className="row mt small" style={{ fontWeight: 700 }}>
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                  Internal only (client never sees this)
                </label>
              )}
              <div className="row mt">
                <button className="btn sm bk" disabled={busy} onClick={submitPin}>
                  POST COMMENT
                </button>
                <button
                  className="btn sm ghost"
                  onClick={() => { setPendingPin(null); setPendingDrawing(null); setPinText(''); }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}

          {/* Pinned threads for this version */}
          {pins.length > 0 && (
            <div className="mt">
              <h3 className="display mb">PINNED COMMENTS · v{selected.version_number}</h3>
              {pins.map((p) => <Thread key={p.id} c={p} anchored />)}
            </div>
          )}
          {drawingsData.length > 0 && versionComments.filter((c) => c.drawing && !c.parent_id).map((c) => (
            <Thread key={c.id} c={c} anchored />
          ))}
        </>
      )}

      {/* General comments at the design level */}
      <div className="mt">
        <h3 className="display mb">GENERAL COMMENTS</h3>
        {generals.length === 0 && <p className="small mb">No general comments yet.</p>}
        {generals.map((c) => <Thread key={c.id} c={c} />)}
        <textarea
          className="textarea"
          value={generalText}
          onChange={(e) => setGeneralText(e.target.value)}
          placeholder="Leave a general comment about this design"
        />
        {showInternalToggle && (
          <label className="row mt small" style={{ fontWeight: 700 }}>
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
            Internal only (client never sees this)
          </label>
        )}
        <button className="btn sm mt" disabled={busy} onClick={submitGeneral}>
          POST GENERAL COMMENT
        </button>
      </div>
    </div>
  );
}
