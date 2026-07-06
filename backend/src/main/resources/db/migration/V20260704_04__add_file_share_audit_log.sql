-- Add immutable share audit events. These rows intentionally snapshot IDs and names
-- instead of using foreign keys so history survives share cancellation and cleanup.
CREATE TABLE IF NOT EXISTS file_share_audit_log (
    idx BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    share_idx BIGINT NULL,
    file_idx BIGINT NULL,
    file_name VARCHAR(255) NULL,
    owner_idx BIGINT NULL,
    owner_email VARCHAR(255) NULL,
    owner_name VARCHAR(255) NULL,
    recipient_idx BIGINT NULL,
    recipient_email VARCHAR(255) NULL,
    recipient_name VARCHAR(255) NULL,
    actor_idx BIGINT NULL,
    actor_email VARCHAR(255) NULL,
    actor_name VARCHAR(255) NULL,
    action VARCHAR(64) NULL,
    permission VARCHAR(32) NULL,
    status VARCHAR(32) NULL,
    expires_at DATETIME(6) NULL,
    download_limit INT NULL,
    download_count INT NULL,
    created_at DATETIME(6) NULL
);

CREATE INDEX IF NOT EXISTS idx_file_share_audit_owner_created ON file_share_audit_log (owner_idx, created_at);
CREATE INDEX IF NOT EXISTS idx_file_share_audit_recipient_created ON file_share_audit_log (recipient_idx, created_at);
CREATE INDEX IF NOT EXISTS idx_file_share_audit_actor_created ON file_share_audit_log (actor_idx, created_at);