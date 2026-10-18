BEGIN;
CREATE TABLE discussion_notes (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
 client_id TEXT NOT NULL,
 text TEXT NOT NULL DEFAULT '',
 done BOOLEAN NOT NULL DEFAULT false,
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
 source_type TEXT,
 source_id TEXT,
 source_label TEXT NOT NULL DEFAULT '',
 source_day TEXT NOT NULL DEFAULT '',
 excerpt TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL,
 CONSTRAINT discussion_text_length CHECK (char_length(text) <= 6000 AND char_length(excerpt) <= 6000),
 CONSTRAINT discussion_not_empty CHECK (btrim(text) <> '' OR btrim(excerpt) <> ''),
 CONSTRAINT discussion_source_snapshot CHECK (
   (source_type IS NULL AND source_id IS NULL AND source_label = '' AND source_day = '' AND excerpt = '') OR
   (source_type IN ('body','state','reaction','meeting') AND source_id IS NOT NULL AND source_label <> '' AND source_day ~ '^\d{4}-\d{2}-\d{2}$' AND btrim(excerpt) <> '')
 )
);
CREATE UNIQUE INDEX discussion_notes_user_id_client_id_key ON discussion_notes(user_id,client_id);
CREATE INDEX discussion_notes_user_id_created_at_idx ON discussion_notes(user_id,created_at);
COMMIT;
