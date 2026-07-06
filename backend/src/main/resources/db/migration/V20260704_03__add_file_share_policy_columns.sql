-- Add optional share policy fields used by FileInNOut drive sharing.
ALTER TABLE file_share ADD COLUMN IF NOT EXISTS expires_at DATETIME(6) NULL;
ALTER TABLE file_share ADD COLUMN IF NOT EXISTS download_limit INT NULL;
ALTER TABLE file_share ADD COLUMN IF NOT EXISTS download_count INT NOT NULL DEFAULT 0;
UPDATE file_share SET download_count = 0 WHERE download_count IS NULL;