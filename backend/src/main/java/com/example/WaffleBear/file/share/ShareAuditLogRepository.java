package com.example.WaffleBear.file.share;

import com.example.WaffleBear.file.share.model.FileShareAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ShareAuditLogRepository extends JpaRepository<FileShareAuditLog, Long> {

    List<FileShareAuditLog> findTop100ByOwnerIdxOrRecipientIdxOrActorIdxOrderByCreatedAtDesc(
            Long ownerIdx,
            Long recipientIdx,
            Long actorIdx
    );

    List<FileShareAuditLog> findTop200ByOrderByCreatedAtDesc();
}
