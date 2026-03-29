-- BugPulse Proxy D1 Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL UNIQUE,
  hmac_secret TEXT NOT NULL,
  stripe_customer_id TEXT,
  plan TEXT DEFAULT 'free' CHECK(plan IN ('free', 'starter', 'pro', 'beta')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('linear', 'github', 'jira', 'slack_webhook', 'webhook')),
  config TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routing_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  conditions TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS report_hashes (
  hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  PRIMARY KEY (hash, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_user ON integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_user ON routing_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_report_hashes_expires ON report_hashes(expires_at);
