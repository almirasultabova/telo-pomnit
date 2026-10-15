ALTER TABLE users ADD COLUMN analytics_excluded BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE diary_entries ADD COLUMN saved_at TIMESTAMP(3);
ALTER TABLE diary_entries ALTER COLUMN saved_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE feedback ADD COLUMN stream_id TEXT REFERENCES streams(id) ON DELETE SET NULL,
 ADD COLUMN needs_reply BOOLEAN, ADD COLUMN submitted_scope JSONB, ADD COLUMN kind TEXT NOT NULL DEFAULT 'unknown',
 ADD COLUMN status TEXT NOT NULL DEFAULT 'unclassified', ADD COLUMN revision INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN assignee_id TEXT, ADD COLUMN taken_at TIMESTAMP(3),
 ADD COLUMN answered_by_id TEXT, ADD COLUMN answered_at TIMESTAMP(3);
CREATE INDEX feedback_stream_id_status_created_at_idx ON feedback(stream_id,status,created_at);
CREATE TABLE stream_overview_grants(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,stream_id));
CREATE TABLE overview_history(id TEXT PRIMARY KEY,started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO overview_history(id) VALUES('eligibility-v1');
CREATE TABLE overview_memberships(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ended_at TIMESTAMP(3),eligible_until TIMESTAMP(3) NOT NULL);
CREATE INDEX overview_memberships_stream_id_started_at_idx ON overview_memberships(stream_id,started_at);
CREATE UNIQUE INDEX overview_memberships_open_idx ON overview_memberships(user_id,stream_id) WHERE ended_at IS NULL;
CREATE TABLE feedback_actions(id TEXT PRIMARY KEY,feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,revision INTEGER NOT NULL,details JSONB NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX feedback_actions_feedback_id_revision_key ON feedback_actions(feedback_id,revision);
-- Prospective eligibility only. Current state is never backdated into historical weeks.
CREATE FUNCTION overview_sync_member(uid TEXT,sid TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cutoff TIMESTAMP(3); existing overview_memberships%ROWTYPE;
BEGIN
 SELECT max(least(coalesce(e.access_expires,((s.end_date AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow')::date::timestamp AT TIME ZONE 'Europe/Moscow' AT TIME ZONE 'UTC' + interval '1 day'),
 ((s.end_date AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow')::date::timestamp AT TIME ZONE 'Europe/Moscow' AT TIME ZONE 'UTC' + interval '1 day')) INTO cutoff
 FROM enrollments e JOIN users u ON u.id=e.user_id JOIN streams s ON s.id=e.stream_id
 WHERE e.user_id=uid AND e.stream_id=sid AND e.status IN ('active','completed')
 AND (e.paid_at IS NOT NULL OR e.access_basis='free' OR e.created_at<'2026-09-22 13:00:00')
 AND u.role='PARTICIPANT' AND u.access_status='approved' AND u.deleted_at IS NULL AND NOT u.analytics_excluded;
 SELECT * INTO existing FROM overview_memberships WHERE user_id=uid AND stream_id=sid AND ended_at IS NULL FOR UPDATE;
 IF existing.id IS NOT NULL AND (cutoff IS NULL OR cutoff<=CURRENT_TIMESTAMP OR existing.eligible_until IS DISTINCT FROM cutoff) THEN
   UPDATE overview_memberships SET ended_at=CURRENT_TIMESTAMP WHERE id=existing.id;
   existing.id:=NULL;
 END IF;
 IF existing.id IS NULL AND cutoff>CURRENT_TIMESTAMP THEN
   INSERT INTO overview_memberships(id,user_id,stream_id,eligible_until) VALUES(gen_random_uuid()::text,uid,sid,cutoff);
 END IF;
END $$;
CREATE FUNCTION overview_enrollment_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN PERFORM overview_sync_member(OLD.user_id,OLD.stream_id);RETURN OLD;END IF;
 PERFORM overview_sync_member(NEW.user_id,NEW.stream_id);
 IF TG_OP='UPDATE' AND (OLD.user_id<>NEW.user_id OR OLD.stream_id<>NEW.stream_id) THEN PERFORM overview_sync_member(OLD.user_id,OLD.stream_id);END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER overview_enrollment AFTER INSERT OR UPDATE OR DELETE ON enrollments FOR EACH ROW EXECUTE FUNCTION overview_enrollment_change();
CREATE FUNCTION overview_user_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid TEXT;
BEGIN
 IF NEW.deleted_at IS NOT NULL THEN
   DELETE FROM overview_memberships WHERE user_id=NEW.id;DELETE FROM stream_overview_grants WHERE user_id=NEW.id;
 ELSE
   FOR sid IN SELECT DISTINCT stream_id FROM enrollments WHERE user_id=NEW.id LOOP PERFORM overview_sync_member(NEW.id,sid);END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER overview_user AFTER UPDATE OF role,access_status,deleted_at,analytics_excluded ON users FOR EACH ROW EXECUTE FUNCTION overview_user_change();
CREATE FUNCTION overview_stream_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid TEXT;
BEGIN
 FOR uid IN SELECT DISTINCT user_id FROM enrollments WHERE stream_id=NEW.id LOOP PERFORM overview_sync_member(uid,NEW.id);END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER overview_stream AFTER UPDATE OF end_date ON streams FOR EACH ROW EXECUTE FUNCTION overview_stream_change();
DO $$ DECLARE r RECORD; BEGIN FOR r IN SELECT DISTINCT user_id,stream_id FROM enrollments LOOP PERFORM overview_sync_member(r.user_id,r.stream_id);END LOOP;END $$;
