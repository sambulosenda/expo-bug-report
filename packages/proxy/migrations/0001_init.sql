-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL UNIQUE,
  hmac_secret TEXT NOT NULL,
  stripe_customer_id TEXT,
  plan TEXT DEFAULT 'free',
  first_report_sent INTEGER DEFAULT 0,
  grace_expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_integrations_user ON integrations(user_id);

-- Report hashes for dedup
CREATE TABLE IF NOT EXISTS report_hashes (
  hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  issue_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  PRIMARY KEY (hash, user_id)
);

-- Spike detection counters
CREATE TABLE IF NOT EXISTS screen_reports (
  screen TEXT NOT NULL,
  user_id TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  window_start TEXT NOT NULL,
  PRIMARY KEY (screen, user_id, window_start)
);
