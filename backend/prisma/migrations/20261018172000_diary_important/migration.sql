BEGIN;
CREATE TABLE "diary_important" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "diary_important_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "diary_important_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "diary_important_source_check" CHECK ("source" IN ('body','state','reaction','meeting'))
);
CREATE UNIQUE INDEX "diary_important_user_id_source_entry_id_key" ON "diary_important"("user_id","source","entry_id");
COMMIT;
