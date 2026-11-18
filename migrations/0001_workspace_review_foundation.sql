-- Content Studio multi-workspace foundation.
-- Apply to a Cloudflare D1 database only after creating it and reviewing the migration.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  notion_data_source_id TEXT,
  notion_profile_database_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  auth_subject TEXT,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'reviewer')),
  invited_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  disabled_at TEXT,
  UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_subject
  ON workspace_members(auth_subject) WHERE auth_subject IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspace_members_email
  ON workspace_members(email);

CREATE TABLE IF NOT EXISTS notion_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  token_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  client_label TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'in_review', 'completed', 'expired', 'revoked')),
  expires_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_batches_workspace
  ON review_batches(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES review_batches(id) ON DELETE CASCADE,
  notion_page_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (batch_id, notion_page_id)
);

CREATE INDEX IF NOT EXISTS idx_review_items_batch_position
  ON review_items(batch_id, position);

CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES review_batches(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
  actor_subject TEXT,
  actor_email TEXT,
  action TEXT NOT NULL CHECK (action IN ('approved', 'changes_requested', 'commented')),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_review_events_item_time
  ON review_events(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_events_workspace_time
  ON review_events(workspace_id, created_at DESC);

-- Public review links store only a SHA-256 token hash, never the bearer token.
CREATE TABLE IF NOT EXISTS review_link_tokens (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL UNIQUE REFERENCES review_batches(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_review_link_tokens_expiry
  ON review_link_tokens(expires_at, revoked_at);
