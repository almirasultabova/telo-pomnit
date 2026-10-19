-- Run outside a transaction. No data rewrite or new uniqueness constraint.
CREATE INDEX CONCURRENTLY "diary_entries_user_created_id_idx"
ON "diary_entries" ("user_id", "created_at" DESC, "id" DESC);
