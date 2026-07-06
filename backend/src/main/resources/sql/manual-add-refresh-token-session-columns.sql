-- Add session timestamps for administrator session visibility.
-- Run this before starting a production profile that uses ddl-auto=validate.
ALTER TABLE refresh_token ADD COLUMN IF NOT EXISTS created_at DATETIME(6) NULL;
ALTER TABLE refresh_token ADD COLUMN IF NOT EXISTS updated_at DATETIME(6) NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_token_email_id ON refresh_token (email, id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_expiry_date ON refresh_token (expiry_date);