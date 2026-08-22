'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ZoomViewer from './ZoomViewer';
import { skuLabel, StatusBadge } from './SkuReview';

const APPROVAL_STATEMENT =
  'I have reviewed and verified all spelling, content, sizing, dimensions, and colors in this design. I approve this version for print production. I understand that Made 2 Order Merch is not responsible for errors present in the artwork I have approved.';

const APPROVAL_CHECKS = [
  'Spelling and all text content are correct',
  'Sizes and dimensions are correct',
  'Weights, barcodes, and required label info are correct',
  'Colors are what I expect',
];

export default function ClientReview({ project, sku, versions, comments, approval, token, onBack }) {
  const router = useRouter();
  const proofs = versions.filter((v) => v.kind === 'proof');
  const mockups = versions.filter((v) => v.kind === 'mockup');
  const approvedProof = approval ? proofs.find((v) => v.id === approval.version_id) : null;
  const [selectedId, setSelectedId] = useState(
    approvedProof?.id ?? (proofs.length ? proofs[proofs.length - 1].id : mockups[0]?.id ?? null)
  );
  const selected = versions.find((v) => v.id === selectedId) || null;

  const [pinMode, setPinMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [pendingPin, setPendingPin] = useState(null);
  const [pendingDrawing, setPendingDrawing] = useState(null);
  const [composerText, setComposerText] = useState('');
  const [activePinId, setActivePinId] = useState(null);
  const [tab, setTab] = useState('pinned');
  const [generalText, setGeneralText] = useState('');
  const [replyFor, setReplyFor] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [editsOpen, setEditsOpen] = useState(false);
  const [checks, setChecks] = useState(APPROVAL_CHECKS.map(() => false));
  const [typedName, setTypedName] = useState('');
  const threadRefs = useRef({});

  useEffect(() => {
    try {
      if (!window.localStorage.getItem('m2om_review_hint')) setShowHint(true);
    } catch {}
  }, []);

  function dismissHint() {
    setShowHint(false);
    try { window.localStorage.setItem('m2om_review_hint', '1'); } catch {}
  }

  const headers = { 'Content-Type': 'application/json', 'x-proof-token': token };

  const versionComments = comments.filter((c) => c.version_id === selected?.id);
  const pins = versionComments.filter((c) => c.pin_x !== null && !c.parent_id);
  const drawingThreads = versionComments.filter((c) => c.drawing && !c.parent_id);
  const drawingsData = drawingThreads.map((c) => ({ id: c.id, points: c.drawing, resolved: c.resolved }));
  const generals = comments.filter((c) => !c.parent_id && c.pin_x === null && !c.drawing);
  const replies = (id) => comments.filter((c) => c.parent_id === id);
  const anchored = [...pins, ...drawingThreads];
  const openCount = comments.filter((c) => !c.parent_id && !c.resolved).length;

  const isLockedState = ['approved', 'in_production'].includes(sku.status);
  const canAct = proofs.length > 0 && !isLockedState;

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

  async function submitComposer() {
    if (!composerText.trim() && !pendingDrawing) return;
    const ok = await post('/api/comments', {
      sku_id: sku.id,
      version_id: selected.id,
      body: composerText.trim(),
      pin: pendingPin,
      drawing: pendingDrawing,
    });
    if (ok) {
      setComposerText('');
      setPendingPin(null);
      setPendingDrawing(null);
      setPinMode(false);
      setDrawMode(false);
      setTab('pinned');
    }
  }

  async function submitGeneral() {
    if (!generalText.trim()) return;
    const ok = await post('/api/comments', { sku_id: sku.id, version_id: null, body: generalText.trim() });
    if (ok) setGeneralText('');
  }

  async function submitReply(parentId) {
    if (!replyText.trim()) return;
    const ok = await post('/api/comments', {
      sku_id: sku.id,
      version_id: selected?.id || null,
      parent_id: parentId,
      body: replyText.trim(),
    });
    if (ok) {
      setReplyText('');
      setReplyFor(null);
    }
  }

  async function toggleResolve(c) {
    setBusy(true);
    await fetch(`/api/comments/${c.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ resolved: !c.resolved }),
    });
    setBusy(false);
    router.refresh();
  }

  async function requestEdits() {
    const ok = await post(`/api/skus/${sku.id}/request-edits`, {});
    if (ok) setEditsOpen(false);
  }

  async function approve() {
    if (!checks.every(Boolean) || !typedName.trim()) return;
    const latest = proofs[proofs.length - 1];
    const ok = await post(`/api/skus/${sku.id}/approve`, {
      typed_name: typedName.trim(),
      agreed: true,
      version_id: latest?.id,
    });
    if (ok) {
      setApproveOpen(false);
      setTypedName('');
      setChecks(APPROVAL_CHECKS.map(() => false));
    }
  }

  function jumpToPin(id) {
    setActivePinId(id);
    setTab('pinned');
    const el = threadRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  function enterPinMode() {
    setPinMode(true);
    setDrawMode(false);
    setPendingPin(null);
    setPendingDrawing(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function exitPinMode() {
    setPinMode(false);
    setDrawMode(false);
    setPendingPin(null);
    setPendingDrawing(null);
    setComposerText('');
  }

  function Thread({ c }) {
    const isAnchor = c.pin_number || c.drawing;
    return (
      <div
        ref={(el) => { threadRefs.current[c.id] = el; }}
        className={`comment ${c.resolved ? 'resolved' : ''}`}
      >
        <div className="meta">
          {c.pin_number ? `PIN ${c.pin_number} · ` : c.drawing ? 'MARKUP · ' : ''}
          {c.author_role === 'team' ? 'DESIGN TEAM' : c.author_name}
          {c.resolved ? ' · RESOLVED' : ''}
        </div>
        {c.body && <div>{c.body}</div>}
        {c.drawing && !c.body && <div className="small">Drawn markup on the artwork.</div>}
        {replies(c.id).map((r) => (
          <div key={r.id} className="replies">
            <div className="meta">{r.author_role === 'team' ? 'DESIGN TEAM' : r.author_name}</div>
            <div>{r.body}</div>
          </div>
        ))}
        <div className="row mt">
          {replyFor === c.id ? (
            <div style={{ width: '100%' }}>
              <textarea
                className="textarea"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply"
                autoFocus
              />
              <div className="row mt">
                <button className="btn sm yl" disabled={busy} onClick={() => submitReply(c.id)}>REPLY</button>
                <button className="btn sm ghost" onClick={() => setReplyFor(null)}>CANCEL</button>
              </div>
            </div>
          ) : (
            <>
              <button className="btn sm" onClick={() => { setReplyFor(c.id); setReplyText(''); }}>REPLY</button>
              <button className="btn sm" disabled={busy} onClick={() => toggleResolve(c)}>
                {c.resolved ? 'REOPEN' : 'RESOLVE'}
              </button>
              {isAnchor && selected && c.version_id === selected.id && !c.resolved && (
                <button className="btn sm ghost" onClick={() => setActivePinId(c.id)}>SHOW ON ARTWORK</button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="review">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back to all designs">←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title">{skuLabel(sku)}</div>
          <div className="sub">{project.ref}</div>
        </div>
        <StatusBadge status={sku.status} />
      </div>

      <div className="wrap" style={{ paddingTop: 16 }}>
        {showHint && (
          <div className="card yl" style={{ animation: 'fadeUp 0.25s ease both' }}>
            <h3 className="display mb">HOW TO REVIEW</h3>
            <p><strong>1.</strong> Zoom in and check every detail: spelling, sizing, weights, barcodes, colors.</p>
            <p><strong>2.</strong> Tap ADD COMMENT, then tap the exact spot on the artwork.</p>
            <p><strong>3.</strong> One thorough round beats five quick ones. Flag everything you see, then approve when it is perfect.</p>
            <button className="btn sm bk mt" onClick={dismissHint}>GOT IT</button>
          </div>
        )}

        {approval && (
          <div className="notice">
            Approved for print by {approval.typed_name} on {new Date(approval.created_at).toLocaleString()}. This version is locked.
          </div>
        )}

        <div className="review-grid">
          <div className="art-col">
            {(proofs.length > 1 || mockups.length > 0) && (
              <div className="row mb">
                {proofs.map((v) => (
                  <button
                    key={v.id}
                    className={`pill ${v.id === selectedId ? 'active' : ''}`}
                    onClick={() => { setSelectedId(v.id); setActivePinId(null); exitPinMode(); }}
                  >
                    v{v.version_number}{v.locked ? ' ✓' : ''}
                  </button>
                ))}
                {mockups.map((v) => (
                  <button
                    key={v.id}
                    className={`pill ${v.id === selectedId ? 'active' : ''}`}
                    onClick={() => { setSelectedId(v.id); setActivePinId(null); exitPinMode(); }}
                  >
                    3D MOCKUP{mockups.length > 1 ? ` ${v.version_number}` : ''}
                  </button>
                ))}
              </div>
            )}

            {pinMode && !pendingPin && !pendingDrawing && (
              <div className="pin-instruction">
                <span>{drawMode ? 'DRAW ON THE ARTWORK' : 'TAP THE EXACT SPOT'}</span>
                <span className="row" style={{ gap: 8 }}>
                  <button className={`pill ${drawMode ? 'active' : ''}`} onClick={() => setDrawMode(!drawMode)}>✎ DRAW</button>
                  <button className="pill" onClick={exitPinMode}>CANCEL</button>
                </span>
              </div>
            )}

            {!selected && (
              <div className="card off">
                <p>No proofs uploaded yet. You will get an email the moment your first proof is ready.</p>
              </div>
            )}

            {selected && selected.kind === 'mockup' && (
              <div className="zoom-frame">
                <video src={selected.file_url} controls playsInline style={{ display: 'block', width: '100%' }} />
              </div>
            )}

            {selected && selected.kind === 'proof' && (
              <ZoomViewer
                imageUrl={selected.file_url}
                pins={pins}
                drawings={drawingsData}
                pinMode={pinMode}
                drawMode={drawMode}
                pendingPin={pendingPin}
                activePinId={activePinId}
                onPlacePin={(p) => { setPendingPin(p); setPendingDrawing(null); }}
                onFinishDrawing={(pts) => { setPendingDrawing(pts); setPendingPin(null); }}
                onSelectPin={jumpToPin}
              />
            )}

            {selected && selected.kind === 'proof' && !pinMode && (
              <div className="mt" style={{ display: 'flex' }}>
                <button className="btn yl" style={{ flex: 1 }} onClick={enterPinMode}>
                  + COMMENT ON THE ARTWORK
                </button>
              </div>
            )}
          </div>

          <div className="panel-col mt">
            <div className="tabs">
              <button className={tab === 'pinned' ? 'active' : ''} onClick={() => setTab('pinned')}>
                ON ARTWORK ({anchored.length})
              </button>
              <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>
                GENERAL ({generals.length})
              </button>
            </div>

            {tab === 'pinned' && (
              <>
                {anchored.length === 0 && (
                  <div className="card off">
                    <p>No comments on this version yet. Tap <strong>COMMENT ON THE ARTWORK</strong> and then the exact spot you want changed.</p>
                  </div>
                )}
                {anchored.map((c) => <Thread key={c.id} c={c} />)}
              </>
            )}

            {tab === 'general' && (
              <>
                {generals.map((c) => <Thread key={c.id} c={c} />)}
                <textarea
                  className="textarea"
                  value={generalText}
                  onChange={(e) => setGeneralText(e.target.value)}
                  placeholder="Overall thoughts, direction, anything not tied to one spot"
                />
                <button className="btn sm mt" disabled={busy} onClick={submitGeneral}>POST GENERAL COMMENT</button>
              </>
            )}
          </div>
        </div>
      </div>

      {canAct && !pinMode && (
        <div className="actionbar">
          <div className="inner">
            <button className="btn" disabled={busy} onClick={() => setEditsOpen(true)}>REQUEST EDITS</button>
            <button className="btn yl" disabled={busy} onClick={() => setApproveOpen(true)}>APPROVE FOR PRINT</button>
          </div>
        </div>
      )}

      {(pendingPin || pendingDrawing) && (
        <>
          <div className="sheet-backdrop" onClick={() => { setPendingPin(null); setPendingDrawing(null); }} />
          <div className="sheet">
            <div className="inner">
              <h3>{pendingDrawing ? 'YOUR MARKUP' : 'PIN A COMMENT'}</h3>
              <textarea
                className="textarea"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder="What needs to change here?"
                autoFocus
              />
              <div className="row mt">
                <button className="btn bk" disabled={busy || (!composerText.trim() && !pendingDrawing)} onClick={submitComposer}>
                  {busy ? 'POSTING...' : 'POST COMMENT'}
                </button>
                <button className="btn ghost" onClick={() => { setPendingPin(null); setPendingDrawing(null); setComposerText(''); }}>
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {editsOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setEditsOpen(false)} />
          <div className="sheet">
            <div className="inner">
              <h3>SEND FOR EDITS?</h3>
              <p>
                This sends <strong>{skuLabel(sku)}</strong> back to the design team with your comments.
              </p>
              <p className="mt">
                <strong>{openCount} open comment{openCount === 1 ? '' : 's'}</strong> will go with it. One thorough
                round beats five quick ones, so make sure everything you want changed is pinned or commented first.
              </p>
              <div className="row mt">
                <button className="btn bk" disabled={busy} onClick={requestEdits}>
                  {busy ? 'SENDING...' : 'SEND FOR EDITS'}
                </button>
                <button className="btn ghost" onClick={() => setEditsOpen(false)}>KEEP REVIEWING</button>
              </div>
            </div>
          </div>
        </>
      )}

      {approveOpen && (
        <div className="modal-backdrop" onClick={() => setApproveOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="display mb">FINAL APPROVAL</h2>
            <p style={{ fontWeight: 800 }}>{skuLabel(sku)} · v{proofs[proofs.length - 1]?.version_number}</p>
            <p className="mt mb">Once approved, this design locks and goes to print. Confirm each check:</p>
            {APPROVAL_CHECKS.map((label, i) => (
              <label key={i} className={`check-item ${checks[i] ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checks[i]}
                  onChange={(e) => setChecks(checks.map((v, j) => (j === i ? e.target.checked : v)))}
                />
                <span>{label}</span>
              </label>
            ))}
            <div className="finestatement">{APPROVAL_STATEMENT}</div>
            <label className="label" htmlFor="typedName">Type your full name to approve</label>
            <input
              id="typedName"
              className="input"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Full name"
            />
            <div className="row mt">
              <button
                className="btn bk"
                disabled={!checks.every(Boolean) || !typedName.trim() || busy}
                onClick={approve}
              >
                {busy ? 'APPROVING...' : 'APPROVE FOR PRINT'}
              </button>
              <button className="btn ghost" onClick={() => setApproveOpen(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
