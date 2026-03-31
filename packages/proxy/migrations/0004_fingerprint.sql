-- Add fingerprint column for Smart Feed grouping
ALTER TABLE reports ADD COLUMN fingerprint TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_fingerprint ON reports(fingerprint);
CREATE INDEX IF NOT EXISTS idx_reports_user_fingerprint ON reports(user_id, fingerprint, created_at);
