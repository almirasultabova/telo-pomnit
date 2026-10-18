BEGIN;
ALTER TABLE "after_meeting_notes" ADD COLUMN "step_text" TEXT NOT NULL DEFAULT '', ADD COLUMN "step_paused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "after_meeting_notes" ADD CONSTRAINT "after_meeting_notes_step_text_check" CHECK (length("step_text") <= 1200);
CREATE TABLE "after_meeting_step_events" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "note_id" TEXT NOT NULL REFERENCES "after_meeting_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "client_id" TEXT,
 "type" TEXT NOT NULL CHECK ("type" IN ('observation','change')),
 "text" TEXT NOT NULL CHECK (length("text") <= 4000),
 "step_text" TEXT NOT NULL CHECK (length("step_text") <= 1200),
 "previous_step" TEXT NOT NULL DEFAULT '',
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "after_meeting_step_events_content_check" CHECK ("type" <> 'observation' OR length(btrim("text")) > 0 AND "client_id" IS NOT NULL)
);
CREATE UNIQUE INDEX "after_meeting_step_events_user_id_client_id_key" ON "after_meeting_step_events"("user_id","client_id");
CREATE INDEX "after_meeting_step_events_note_id_created_at_idx" ON "after_meeting_step_events"("note_id","created_at");
COMMIT;
