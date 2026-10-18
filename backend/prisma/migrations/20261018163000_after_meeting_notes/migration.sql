BEGIN;
CREATE TABLE "after_meeting_notes" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "meeting_date" DATE NOT NULL,
  "text" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "after_meeting_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "after_meeting_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "after_meeting_notes_kind_check" CHECK ("kind" IN ('analysis','practice')),
  CONSTRAINT "after_meeting_notes_text_check" CHECK (length(btrim("text")) BETWEEN 1 AND 20000),
  CONSTRAINT "after_meeting_notes_revision_check" CHECK ("revision" >= 1)
);
CREATE UNIQUE INDEX "after_meeting_notes_user_id_client_id_key" ON "after_meeting_notes"("user_id", "client_id");
CREATE INDEX "after_meeting_notes_user_id_meeting_date_idx" ON "after_meeting_notes"("user_id", "meeting_date");
COMMIT;
