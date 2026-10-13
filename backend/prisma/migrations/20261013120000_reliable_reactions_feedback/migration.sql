ALTER TABLE "trigger_entries" ADD COLUMN "client_id" TEXT;
CREATE UNIQUE INDEX "trigger_entries_user_id_client_id_key" ON "trigger_entries"("user_id", "client_id");
ALTER TABLE "feedback" ADD COLUMN "operation_id" TEXT;
CREATE UNIQUE INDEX "feedback_user_id_operation_id_key" ON "feedback"("user_id", "operation_id");
ALTER TABLE "questionnaires" ADD COLUMN "form_version" INTEGER NOT NULL DEFAULT 1;
