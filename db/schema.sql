-- M2OM Proofing Portal schema. Run once against the shared Neon DB (delicate-snow).
-- All tables are prefixed proof_ and are additive. No changes to existing tables.

CREATE TABLE IF NOT EXISTS proof_projects (
  id SERIAL PRIMARY KEY,
  ref TEXT UNIQUE,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  shopify_order_id TEXT,
  neon_lead_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proof_skus (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES proof_projects(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  product_type TEXT NOT NULL,
  variant_label TEXT NOT NULL DEFAULT '',
  group_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'artwork_ordered',
  approved_version_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proof_versions (
  id SERIAL PRIMARY KEY,
  sku_id INTEGER NOT NULL REFERENCES proof_skus(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'proof', -- proof | mockup
  file_url TEXT NOT NULL,
  file_pathname TEXT,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proof_comments (
  id SERIAL PRIMARY KEY,
  sku_id INTEGER NOT NULL REFERENCES proof_skus(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES proof_versions(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES proof_comments(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL, -- client | team
  author_name TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  pin_x NUMERIC,
  pin_y NUMERIC,
  pin_number INTEGER,
  drawing JSONB,
  internal BOOLEAN NOT NULL DEFAULT false,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proof_approvals (
  id SERIAL PRIMARY KEY,
  sku_id INTEGER NOT NULL REFERENCES proof_skus(id) ON DELETE CASCADE,
  version_id INTEGER NOT NULL REFERENCES proof_versions(id),
  typed_name TEXT NOT NULL,
  statement TEXT NOT NULL,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proof_tokens (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES proof_projects(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proof_events (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES proof_projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proof_skus_project ON proof_skus(project_id);
CREATE INDEX IF NOT EXISTS idx_proof_versions_sku ON proof_versions(sku_id);
CREATE INDEX IF NOT EXISTS idx_proof_comments_sku ON proof_comments(sku_id);
CREATE INDEX IF NOT EXISTS idx_proof_tokens_token ON proof_tokens(token);
