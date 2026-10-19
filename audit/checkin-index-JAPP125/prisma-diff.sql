-- CreateIndex
CREATE INDEX "checkins_user_created_id_idx" ON "checkins"("user_id", "created_at" DESC, "id" DESC);
