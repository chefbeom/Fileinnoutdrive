ALTER TABLE file_info
    ADD COLUMN IF NOT EXISTS encryption_mode VARCHAR(32) NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS encryption_key_version INT NULL,
    ADD COLUMN IF NOT EXISTS wrapped_dek VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS encryption_nonce_prefix VARCHAR(32) NULL,
    ADD COLUMN IF NOT EXISTS encryption_chunk_size INT NULL,
    ADD COLUMN IF NOT EXISTS encrypted_file_size BIGINT NULL;
