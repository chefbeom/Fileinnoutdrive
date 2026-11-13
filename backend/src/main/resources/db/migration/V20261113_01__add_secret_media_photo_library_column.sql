ALTER TABLE media_photo_library
    ADD COLUMN IF NOT EXISTS secret_state_json LONGTEXT NULL;
