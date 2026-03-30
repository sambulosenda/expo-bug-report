-- Phase 2.5: bidirectional feedback, failed reports, analytics support

-- Report status tracking (bidirectional feedback)
CREATE TABLE IF NOT EXISTS report_status (
  report_hash TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  issue_url TEXT,
  linear_issue_id TEXT,
  push_token TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (report_hash, user_id)
);

CREATE INDEX IF NOT EXISTS idx_report_status_linear ON report_status(linear_issue_id);

-- Failed reports for webhook replay
CREATE TABLE IF NOT EXISTS failed_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  report_payload TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  retries INTEGER DEFAULT 0
);

-- New columns on report_hashes for analytics
ALTER TABLE report_hashes ADD COLUMN severity TEXT;
ALTER TABLE report_hashes ADD COLUMN screen TEXT;

-- Analytics index
CREATE INDEX IF NOT EXISTS idx_report_hashes_analytics ON report_hashes(user_id, created_at, screen);
