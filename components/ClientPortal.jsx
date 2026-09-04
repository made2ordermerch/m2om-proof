'use client';

import { useEffect, useState } from 'react';
import useLiveRefresh from '@/lib/useLiveRefresh';
import ClientReview from './ClientReview';
import { skuLabel, StatusBadge } from './SkuReview';

export default function ClientPortal({ token, bundle, returning = false }) {
  const { project, skus, versions, comments, approvals } = bundle;
  const [openSkuId, setOpenSkuId] = useState(null);
  // A brand that has approved with us before does not need the walkthrough
  // opened for them again. An explicit choice below still overrides this.
  const [howOpen, setHowOpen] = useState(!returning);

  // Clients leave this tab open waiting on a proof. Keep it current.
  useLiveRefresh();

  // First visit gets the full explainer. After someone collapses it, respect
  // that on every return visit rather than making them dismiss it each time.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`m2om-how-${project.ref}`);
      if (stored === 'closed') setHowOpen(false);
      if (stored === 'open') setHowOpen(true);
    } catch {}
  }, [project.ref]);

  function toggleHow() {
    const next = !howOpen;
    setHowOpen(next);
    try {
      window.localStorage.setItem(`m2om-how-${project.ref}`, next ? 'open' : 'closed');
    } catch {}
  }

  const openSku = skus.find((s) => s.id === openSkuId);

  if (openSku) {
    return (
      <ClientReview
        project={project}
        sku={openSku}
        versions={versions.filter((v) => v.sku_id === openSku.id)}
        comments={comments.filter((c) => c.sku_id === openSku.id)}
        approval={approvals.find((a) => a.sku_id === openSku.id)}
        token={token}
        onBack={() => setOpenSkuId(null)}
      />
    );
  }

  const doneCount = skus.filter((s) => ['approved', 'in_production'].includes(s.status)).length;

  return (
    <main className="wrap" style={{ paddingTop: 28 }}>
      <h1 className="display" style={{ fontSize: 44 }}>M2OM PROOFING</h1>
      <p className="mb" style={{ fontWeight: 800 }}>
        {project.ref} · {project.client_name}
      </p>

      <div className="card">
        <div className="spread">
          <h2 className="display">HOW THIS WORKS</h2>
          <button className="btn sm ghost" onClick={toggleHow}>
            {howOpen ? 'HIDE' : 'SHOW ME AGAIN'}
          </button>
        </div>

        {howOpen && (
          <div className="mt">
            <p>
              This is where you review your artwork and give us the go ahead to print.
              Every design in your order is reviewed and approved on its own, so you can
              sign off on one while another is still being worked on.
            </p>

            <ol className="how-list">
              <li>
                <strong>We upload a proof.</strong> You get an email each time one is ready.
                Nothing needs doing until then.
              </li>
              <li>
                <strong>You look it over.</strong> Open a design and zoom in as far as you
                need. Check spelling, sizes, weights, barcodes, and colors.
              </li>
              <li>
                <strong>You tell us what to change.</strong> Write a comment, or tap
                COMMENT ON THE ARTWORK and point at the exact spot. Being specific here
                saves a round.
              </li>
              <li>
                <strong>We send a new version.</strong> Your comments stay attached to the
                version they were written on, so nothing gets lost between rounds. Go back
                and forth as many times as it takes.
              </li>
              <li>
                <strong>You approve for print.</strong> Confirm the checklist, type your
                name, and that design goes into production.
              </li>
            </ol>

            <div className="notice mt">
              <strong>What approval means.</strong> We print exactly the file you approved.
              Once a design is approved it moves into production and can no longer be
              changed, so please read it closely first. Colors on a screen are a guide, not
              an exact match to printed material.
            </div>

            <p className="small mt">
              Anything you are unsure about, leave it as a comment and we will answer it here.
            </p>
          </div>
        )}
      </div>

      {skus.length > 0 && (
        <div className="card off" style={{ animation: 'fadeUp 0.25s ease both' }}>
          <h2 className="display">
            {doneCount} OF {skus.length} DESIGN{skus.length === 1 ? '' : 'S'} APPROVED
        </h2>
          <div className="progress-track">
            {skus.map((s) => (
              <div
                key={s.id}
                className={`progress-seg ${
                  s.status === 'in_production' ? 'prod' : s.status === 'approved' ? 'done' : ''
                }`}
                title={skuLabel(s)}
              />
            ))}
          </div>
        </div>
      )}

      {skus.length === 0 && (
        <div className="card">
          <p>Your designs will appear here as soon as work begins. You will get an email the moment the first proof is ready.</p>
        </div>
      )}

      {(() => {
        const groupOrder = [];
        for (const s of skus) {
          const g = s.group_label || '';
          if (!groupOrder.includes(g)) groupOrder.push(g);
        }
        let i = -1;
        return groupOrder.map((g) => (
          <div key={g || '__ungrouped'}>
            {g && <div className="group-header">{g}</div>}
            {skus.filter((s) => (s.group_label || '') === g).map((sku) => {
              i += 1;
        const proofsForSku = versions.filter((v) => v.sku_id === sku.id && v.kind === 'proof');
        const latest = proofsForSku[proofsForSku.length - 1];
        const openComments = comments.filter(
          (c) => c.sku_id === sku.id && !c.parent_id && !c.resolved
        ).length;
        const needsYou = sku.status === 'proof_ready';

        return (
          <button
            key={sku.id}
            className="tile"
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => setOpenSkuId(sku.id)}
          >
            <span className="thumb">
              {latest ? (
                <img src={latest.signed_url || latest.file_url} alt="" />
              ) : (
                <span className="noart">IN THE WORKS</span>
              )}
            </span>
            <span className="body">
              <span className="name">{skuLabel(sku)}</span>
              <span className="meta-row">
                <StatusBadge status={sku.status} />
                {latest && <span className="small" style={{ fontWeight: 800 }}>v{latest.version_number}</span>}
                {openComments > 0 && (
                  <span className="small" style={{ fontWeight: 800 }}>
                    {openComments} open comment{openComments === 1 ? '' : 's'}
                  </span>
                )}
              </span>
              {needsYou && (
                <span
                  className="small"
                  style={{
                    fontWeight: 800,
                    background: 'var(--yl)',
                    border: '1.5px solid var(--bk)',
                    padding: '2px 8px',
                    alignSelf: 'flex-start',
                  }}
                >
                  READY FOR YOUR REVIEW
                </span>
              )}
            </span>
            <span className="chev">→</span>
          </button>
        );
            })}
          </div>
        ));
      })()}

      <p className="small mt">
        Questions? Call 1-888-207-8731, text 614-353-2369, or email design@made2ordermerch.com.
      </p>
    </main>
  );
}
