-- Add file version history table used by object version preservation.
CREATE TABLE IF NOT EXISTS file_version (
    idx BIGINT NOT NULL AUTO_INCREMENT,
    file_idx BIGINT NOT NULL,
    user_idx BIGINT NOT NULL,
    version_number INT NOT NULL,
    file_origin_name VARCHAR(255) NOT NULL,
    file_format VARCHAR(255) NOT NULL,
    file_save_name VARCHAR(255) NOT NULL,
    file_save_path VARCHAR(255) NOT NULL,
    file_size BIGINT NULL,
    created_at DATETIME(6) NULL,
    PRIMARY KEY (idx),
    INDEX idx_file_version_file_user (file_idx, user_idx),
    INDEX idx_file_version_user (user_idx),
    CONSTRAINT fk_file_version_file FOREIGN KEY (file_idx) REFERENCES file_info (idx),
    CONSTRAINT fk_file_version_user FOREIGN KEY (user_idx) REFERENCES user (idx)
);