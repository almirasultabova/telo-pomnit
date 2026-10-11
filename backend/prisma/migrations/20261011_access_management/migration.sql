BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_app_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admission_lease_until TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS admission_delivered_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS access_basis TEXT;
CREATE TABLE IF NOT EXISTS access_actions (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, target_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'approved',
 role TEXT NOT NULL DEFAULT 'PARTICIPANT', stream_id TEXT, basis TEXT NOT NULL DEFAULT 'none',
 stream_choices JSONB NOT NULL DEFAULT '[]', expires_at TIMESTAMP(3) NOT NULL,
 used_at TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS access_actions_expires_at_idx ON access_actions(expires_at);
CREATE TABLE IF NOT EXISTS access_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, target_id TEXT NOT NULL,
 action_id TEXT NOT NULL UNIQUE, "before" JSONB NOT NULL, "after" JSONB NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS access_audit_target_id_created_at_idx ON access_audit(target_id,created_at);
CREATE TABLE IF NOT EXISTS operational_metrics (
 day TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (day,kind)
);
COMMIT;
