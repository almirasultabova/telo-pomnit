-- Run outside a transaction. Existing daily uniqueness and five scales are unchanged.
CREATE INDEX CONCURRENTLY "checkins_user_created_id_idx"
ON "checkins" ("user_id", "created_at" DESC, "id" DESC);
