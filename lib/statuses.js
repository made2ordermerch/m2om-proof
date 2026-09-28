export const STATUSES = [
  'artwork_ordered',
  'being_designed',
  'proof_ready',
  'edits_requested',
  'approved',
  'in_production',
];

// Internal names. Used in admin and in team emails.
export const STATUS_LABELS = {
  artwork_ordered: 'ARTWORK ORDERED',
  being_designed: 'BEING DESIGNED',
  proof_ready: 'PROOF READY',
  edits_requested: 'EDITS REQUESTED',
  approved: 'APPROVED',
  in_production: 'IN PRODUCTION',
};

// What the client sees. Written from their side of the table: whose turn it
// is, not which internal stage the file is at.
export const CLIENT_STATUS_LABELS = {
  artwork_ordered: 'IN THE WORKS',
  being_designed: 'IN THE WORKS',
  proof_ready: 'READY FOR YOUR REVIEW',
  edits_requested: 'WITH THE DESIGN TEAM',
  approved: 'APPROVED',
  in_production: 'IN PRODUCTION',
};

export const APPROVAL_STATEMENT =
  'I have reviewed and verified all spelling, content, sizing, dimensions, and colors in this design. I approve this version for print production. I understand that Made 2 Order Merch is not responsible for errors present in the artwork I have approved.';

export function skuLabel(sku) {
  const parts = [sku.size, sku.product_type];
  if (sku.variant_label) parts.push(sku.variant_label);
  return parts.join(' - ');
}

// Client portal link, optionally deep-linked straight into one design.
export function portalLink(token, skuId) {
  const base = (process.env.BASE_URL || '').replace(/\/+$/, '');
  return `${base}/p/${token}${skuId ? `?sku=${skuId}` : ''}`;
}
