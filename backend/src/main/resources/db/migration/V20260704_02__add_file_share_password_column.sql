-- Add optional password protection for public share links.
ALTER TABLE file_share ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;