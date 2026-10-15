BEGIN;
ALTER TABLE payment_orders ADD COLUMN welcome_email_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE payment_orders ADD COLUMN welcome_email_sent_at TIMESTAMP(3);
-- Historical processed orders may already have received their welcome email.
-- Never resend them automatically when upgrading the server.
UPDATE payment_orders SET welcome_email_status = 'legacy' WHERE processed_at IS NOT NULL;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_welcome_email_status_check
  CHECK (welcome_email_status IN ('pending', 'sending', 'sent', 'unconfirmed', 'legacy'));
COMMIT;
