export const STATUSES = [
  'artwork_ordered',
  'being_designed',
  'proof_ready',
  'edits_requested',
  'approved',
  'in_production',
];

export const STATUS_LABELS = {
  artwork_ordered: 'ARTWORK ORDERED',
  being_designed: 'BEING DESIGNED',
  proof_ready: 'PROOF READY',
  edits_requested: 'EDITS REQUESTED',
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
