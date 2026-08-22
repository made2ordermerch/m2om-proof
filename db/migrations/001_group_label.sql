-- Run once in the Neon SQL editor (safe to re-run).
ALTER TABLE proof_skus ADD COLUMN IF NOT EXISTS group_label TEXT NOT NULL DEFAULT '';
