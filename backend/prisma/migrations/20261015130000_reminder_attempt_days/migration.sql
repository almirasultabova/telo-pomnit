BEGIN;
ALTER TABLE users ADD COLUMN daily_reminder_attempt_day TEXT;
ALTER TABLE users ADD COLUMN questionnaire_reminder_attempt_day TEXT;
COMMIT;
