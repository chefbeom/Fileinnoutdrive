-- Add tokenized download share links with expiry, max download limits, and optional password protection.
CREATE TABLE IF NOT EXISTS file_download_share_link (
    idx BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(96) NOT NULL,
    file_idx BIGINT NOT NULL,
    owner_idx BIGINT NOT NULL,
    duration_minutes INT NULL,
    expires_at DATETIME(6) NOT NULL,
    max_downloads INT NULL,
    download_count INT NOT NULL DEFAULT 0,
    password_hash VARCHAR(255) NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at DATETIME(6) NULL,
    last_downloaded_at DATETIME(6) NULL,
    created_at DATETIME(6) NULL,
    CONSTRAINT fk_file_download_share_link_file FOREIGN KEY (file_idx) REFERENCES file_info (idx) ON DELETE CASCADE,
    CONSTRAINT fk_file_download_share_link_owner FOREIGN KEY (owner_idx) REFERENCES user (idx) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_file_download_share_link_token ON file_download_share_link (token);
CREATE INDEX IF NOT EXISTS idx_file_download_share_link_file_owner ON file_download_share_link (file_idx, owner_idx, created_at);
CREATE INDEX IF NOT EXISTS idx_file_download_share_link_owner_created ON file_download_share_link (owner_idx, created_at);
