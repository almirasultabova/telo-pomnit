BEGIN;
CREATE TABLE IF NOT EXISTS access_notices (
 id TEXT PRIMARY KEY, action_id TEXT NOT NULL UNIQUE, target_id TEXT NOT NULL,
 status TEXT NOT NULL, delivery TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, lease_until TIMESTAMP(3),
 sent_at TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS access_notices_delivery_next_attempt_at_idx ON access_notices(delivery,next_attempt_at);
COMMIT;
