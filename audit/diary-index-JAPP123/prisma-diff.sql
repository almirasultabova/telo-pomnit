-- CreateIndex
CREATE INDEX "diary_entries_user_created_id_idx" ON "diary_entries"("user_id", "created_at" DESC, "id" DESC);
