CREATE TABLE IF NOT EXISTS confluence_sync_events (
  id BIGSERIAL PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  page_id TEXT,
  attachment_id TEXT,
  source_version BIGINT,
  source_title TEXT,
  source_url TEXT,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'review', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_until TIMESTAMPTZ,
  error_code TEXT,
  review_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (page_id IS NOT NULL OR attachment_id IS NOT NULL OR status = 'review')
);

CREATE INDEX IF NOT EXISTS confluence_sync_events_ready_idx
  ON confluence_sync_events (available_at, id)
  WHERE status IN ('queued', 'processing');

CREATE TABLE IF NOT EXISTS confluence_sync_state (
  page_id TEXT PRIMARY KEY,
  sanity_document_id TEXT NOT NULL,
  source_version BIGINT,
  source_hash TEXT NOT NULL,
  draft_hash TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft_pending'
    CHECK (status IN ('draft_pending', 'active', 'conflict', 'deletion_review', 'needs_review')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS confluence_sync_assets (
  attachment_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  source_version BIGINT,
  source_updated_at TIMESTAMPTZ,
  sha256 TEXT NOT NULL,
  sanity_asset_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
