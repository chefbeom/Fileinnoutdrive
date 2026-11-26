ALTER TABLE file_info
    ADD COLUMN IF NOT EXISTS vault_origin_parent_id BIGINT NULL;
