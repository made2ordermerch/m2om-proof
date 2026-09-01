'use client';

import { useState } from 'react';
import ClientReview from './ClientReview';
import { skuLabel, StatusBadge } from './SkuReview';

export default function ClientPortal({ token, bundle }) {
  const { project, skus, versions, comments, approvals } = bundle;
  const [openSkuId, setOpenSkuId] = useState(null);

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
