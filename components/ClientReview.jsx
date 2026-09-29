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

  // Auto-select the newest proof when a new version lands mid-session.
  const latestProofId = proofs.length ? proofs[proofs.length - 1].id : null;
  const prevLatestRef = useRef(latestProofId);
  useEffect(() => {
    if (latestProofId !== prevLatestRef.current) {
      prevLatestRef.current = latestProofId;
      if (latestProofId && !approval) setSelectedId(latestProofId);
      return;
    }
    if (!selectedId && (latestProofId || mockups.length)) {
      setSelectedId(latestProofId ?? mockups[0].id);
    }
  }, [latestProofId, selectedId, mockups, approval]);

  const [pinMode, setPinMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [pendingPin, setPendingPin] = useState(null);
  const [pendingDrawing, setPendingDrawing] = useState(null);
  const [composerText, setComposerText] = useState('');
  const [activePinId, setActivePinId] = useState(null);
  const [panelText, setPanelText] = useState('');
  const [replyFor, setReplyFor] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  // Signed proof links expire. Track a failed image load so the client is told
  // to reload rather than staring at an empty frame.
  const [linkExpired, setLinkExpired] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [editsOpen, setEditsOpen] = useState(false);
  const [checks, setChecks] = useState(APPROVAL_CHECKS.map(() => false));
  const [typedName, setTypedName] = useState('');
  const [editsNote, setEditsNote] = useState('');
  // Errors show in the page, not in a browser alert. On a phone an alert
  // covers the artwork and reads like the site crashed.
  const [notice, setNotice] = useState(null); // { text, stale }
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
  const threads = comments.filter((c) => !c.parent_id);
  const replies = (id) => comments.filter((c) => c.parent_id === id);
  const anchored = [...pins, ...drawingThreads];
  const openCount = comments.filter((c) => !c.parent_id && !c.resolved).length;

  const isLockedState = ['approved', 'in_production'].includes(sku.status);
  // Once edits are requested the round is closed. The client waits for the
  // next version; the only thing still open is answering a question the team
  // asks in a thread.
  const withTeam = sku.status === 'edits_requested';
  const canComment = proofs.length > 0 && !isLockedState && !withTeam;
  const canAct = canComment;
  const [justSent, setJustSent] = useState(false);
  const threadHasTeam = (c) =>
    c.author_role === 'team' || replies(c.id).some((r) => r.author_role === 'team');
  const canReply = (c) => canComment || (withTeam && threadHasTeam(c));

  async function post(url, body) {
    setBusy(true);
    setNotice(null);
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch {
      setBusy(false);
      setNotice({ text: 'No connection. Check your signal and try again.' });
      return false;
    }
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setNotice({ text: 'This portal link has expired. Reload to request a fresh one.', stale: true });
      } else {
        setNotice({ text: j.error || 'Something went wrong. Try again.', stale: !!j.stale });
      }
      if (j.stale) router.refresh();
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
    }
  }

  // Same endpoint, same thread list. The only difference is that nothing is
  // anchored to a spot on the artwork.
  async function submitPanelComment() {
    if (!panelText.trim()) return;
    const ok = await post('/api/comments', {
      sku_id: sku.id,
      version_id: selected?.id || null,
      body: panelText.trim(),
    });
    if (ok) setPanelText('');
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
    const ok = await post(`/api/skus/${sku.id}/request-edits`, { note: editsNote.trim() });
    if (ok) {
      setEditsOpen(false);
      setEditsNote('');
      setJustSent(true);
      exitPinMode();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function approve() {
    if (!checks.every(Boolean) || !typedName.trim()) return;
    const latest = proofs[proofs.length - 1];
    const ok = await post(`/api/skus/${sku.id}/approve`, {
      typed_name: typedName.trim(),
      agreed: true,
      version_id: latest?.id,
    });
    setApproveOpen(false);
    if (ok) {
      setTypedName('');
      setChecks(APPROVAL_CHECKS.map(() => false));
    }
  }

  const latestProof = proofs.length ? proofs[proofs.length - 1] : null;
  const viewingOlder = !!(selected && selected.kind === 'proof' && latestProof && selected.id !== latestProof.id);

  function jumpToPin(id) {
    setActivePinId(id);
    // No tab to switch to now, the thread is always in the one list.
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

  function versionLabelFor(c) {
    if (!c.version_id) return null;
    const v = versions.find((x) => x.id === c.version_id);
    if (!v) return null;
    return `V${v.version_number}`;
  }

  function Thread({ c }) {
    const isAnchor = c.pin_number || c.drawing;
    const vLabel = versionLabelFor(c);
    return (
      <div
        ref={(el) => { threadRefs.current[c.id] = el; }}
        className={`comment ${c.resolved ? 'resolved' : ''}`}
      >
        <div className="meta">
          {c.pin_number ? `PIN ${c.pin_number} · ` : c.drawing ? 'MARKUP · ' : ''}
          {vLabel ? `${vLabel} · ` : ''}
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
              {canReply(c) && (
                <button className="btn sm" onClick={() => { setReplyFor(c.id); setReplyText(''); }}>REPLY</button>
              )}
              {canComment && (
                <button className="btn sm" disabled={busy} onClick={() => toggleResolve(c)}>
                  {c.resolved ? 'REOPEN' : 'RESOLVE'}
                </button>
              )}
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
          <div className="sub">
            <span>{project.ref}</span>
            <StatusBadge status={sku.status} audience="client" />
          </div>
        </div>
      </div>

      <div className="wrap" style={{ paddingTop: 16 }}>
        {notice && (
          <div className="notice error" role="alert">
            {notice.text}
            <div className="row mt">
              {notice.stale && (
                <button className="btn sm bk" onClick={() => window.location.reload()}>RELOAD</button>
              )}
              <button className="btn sm ghost" onClick={() => setNotice(null)}>DISMISS</button>
            </div>
          </div>
        )}

        {showHint && (
          <div className="card yl" style={{ animation: 'fadeUp 0.25s ease both' }}>
            <h3 className="display mb">HOW TO REVIEW</h3>
            <p><strong>1.</strong> Zoom in and check every detail: spelling, sizing, weights, barcodes, colors.</p>
            <p><strong>2.</strong> Tap COMMENT ON THE ARTWORK, then tap the exact spot.</p>
            <p><strong>3.</strong> One thorough round beats five quick ones. Flag everything you see, then approve when it is perfect.</p>
            <button className="btn sm bk mt" onClick={dismissHint}>GOT IT</button>
          </div>
        )}

        {(withTeam || justSent) && (
          <div className="card yl" style={{ animation: 'fadeUp 0.25s ease both' }}>
            <h2 className="display">{justSent ? 'EDITS SENT' : 'WITH THE DESIGN TEAM'}</h2>
            <p className="mt">
              Your comments{justSent ? ' are on their way to' : ' are with'} the design team.
              Nothing more is needed from you on this design. You will get an email the moment
              v{latestProof ? latestProof.version_number + 1 : 2} is ready to review.
            </p>
            <p className="small mt">
              Forgot something? Reply to your proof email, or text 614-353-2369, and we will add it to this round.
            </p>
            <button className="btn bk mt" onClick={onBack}>BACK TO ALL DESIGNS</button>
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
                    v{v.version_number}{v.locked ? ' ✓' : ''}{latestProof && v.id === latestProof.id && proofs.length > 1 ? ' · LATEST' : ''}
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

            {viewingOlder && !isLockedState && (
              <div className="notice mb">
                You are looking at v{selected.version_number}. The latest is v{latestProof.version_number}, which is the one that gets approved.
                <button className="btn sm mt" onClick={() => { setSelectedId(latestProof.id); setActivePinId(null); exitPinMode(); }}>SHOW LATEST</button>
              </div>
            )}

            {!selected && (
              <div className="card off">
                <p>No proofs uploaded yet. You will get an email the moment your first proof is ready.</p>
              </div>
            )}

            {selected && selected.kind === 'mockup' && (
              <div className="zoom-frame">
                <video src={selected.signed_url || selected.file_url} controls playsInline style={{ display: 'block', width: '100%' }} />
              </div>
            )}

            {selected && selected.kind === 'proof' && (
              <ZoomViewer
                imageUrl={selected.signed_url || selected.file_url}
                pins={pins}
                drawings={drawingsData}
                pinMode={pinMode}
                drawMode={drawMode}
                pendingPin={pendingPin}
                activePinId={activePinId}
                onPlacePin={(p) => { setPendingPin(p); setPendingDrawing(null); }}
                onFinishDrawing={(pts) => { setPendingDrawing(pts); setPendingPin(null); }}
                onSelectPin={jumpToPin}
                onImageError={() => setLinkExpired(true)}
              />
            )}

            {linkExpired && (
              <div className="notice mt">
                This proof link has expired for security. Reload the page to get a fresh one.
                <button className="btn sm mt" onClick={() => router.refresh()}>RELOAD</button>
              </div>
            )}

            {selected && selected.kind === 'proof' && !pinMode && canComment && (
              <div className="mt" style={{ display: 'flex' }}>
                <button className="btn yl" style={{ flex: 1 }} onClick={enterPinMode}>
                  + COMMENT ON THE ARTWORK
                </button>
              </div>
            )}
          </div>

          <div className="panel-col mt">
            <div className="group-header">COMMENTS ({threads.length})</div>

            {threads.length === 0 && (
              <div className="card off">
                <p>
                  {canComment
                    ? <>No comments yet. Write one below, or tap <strong>COMMENT ON THE ARTWORK</strong> to pin it to an exact spot.</>
                    : 'No comments on this design.'}
                </p>
              </div>
            )}

            {threads.map((c) => <Thread key={c.id} c={c} />)}

            {canComment && (
            <div className="card off mt">
              <textarea
                className="textarea"
                value={panelText}
                onChange={(e) => setPanelText(e.target.value)}
                placeholder="Write a comment"
              />
              <button
                className="btn sm bk mt"
                disabled={busy || !panelText.trim()}
                onClick={submitPanelComment}
              >
                {busy ? 'POSTING...' : 'POST COMMENT'}
              </button>
              <p className="small mt">
                To point at an exact spot on the artwork, use COMMENT ON THE ARTWORK instead.
              </p>
            </div>
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
              <textarea
                className="textarea mt"
                value={editsNote}
                onChange={(e) => setEditsNote(e.target.value)}
                placeholder="Anything to add about the whole design? (optional)"
                rows={3}
              />
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
            {viewingOlder && (
              <div className="notice mt">
                You were viewing v{selected.version_number}. Approval always applies to the latest version, v{latestProof.version_number}.
              </div>
            )}
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
