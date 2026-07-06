package com.example.WaffleBear.file.share;

import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileShareAuditAction;
import com.example.WaffleBear.file.share.model.FileShareAuditLog;
import com.example.WaffleBear.file.share.model.ShareDto;
import com.example.WaffleBear.user.model.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class ShareAuditService {

    private final ShareAuditLogRepository shareAuditLogRepository;

    public void record(FileShare share, Long actorIdx, FileShareAuditAction action) {
        if (share == null || action == null) {
            return;
        }

        FileInfo file = share.getFile();
        User owner = share.getOwner();
        User recipient = share.getRecipient();
        User actor = resolveActor(actorIdx, owner, recipient);

        shareAuditLogRepository.save(FileShareAuditLog.builder()
                .shareIdx(share.getIdx())
                .fileIdx(file != null ? file.getIdx() : null)
                .fileName(file != null ? file.getFileOriginName() : null)
                .ownerIdx(owner != null ? owner.getIdx() : null)
                .ownerEmail(owner != null ? owner.getEmail() : null)
                .ownerName(owner != null ? owner.getName() : null)
                .recipientIdx(recipient != null ? recipient.getIdx() : null)
                .recipientEmail(recipient != null ? recipient.getEmail() : null)
                .recipientName(recipient != null ? recipient.getName() : null)
                .actorIdx(actorIdx)
                .actorEmail(actor != null ? actor.getEmail() : null)
                .actorName(actor != null ? actor.getName() : null)
                .action(action)
                .permission(share.getEffectivePermission().name())
                .status(share.getEffectiveStatus().name())
                .expiresAt(share.getExpiresAt())
                .downloadLimit(share.getDownloadLimit())
                .downloadCount(share.getDownloadCount())
                .build());
    }

    public List<ShareDto.ShareAuditRes> listForUser(Long userIdx) {
        return shareAuditLogRepository
                .findTop100ByOwnerIdxOrRecipientIdxOrActorIdxOrderByCreatedAtDesc(userIdx, userIdx, userIdx)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public List<ShareDto.ShareAuditRes> listForAdministrator() {
        return shareAuditLogRepository.findTop200ByOrderByCreatedAtDesc()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private User resolveActor(Long actorIdx, User owner, User recipient) {
        if (actorIdx == null) {
            return null;
        }
        if (owner != null && Objects.equals(owner.getIdx(), actorIdx)) {
            return owner;
        }
        if (recipient != null && Objects.equals(recipient.getIdx(), actorIdx)) {
            return recipient;
        }
        return null;
    }

    private ShareDto.ShareAuditRes toResponse(FileShareAuditLog log) {
        return new ShareDto.ShareAuditRes(
                log.getIdx(),
                log.getShareIdx(),
                log.getFileIdx(),
                log.getFileName(),
                log.getOwnerIdx(),
                log.getOwnerEmail(),
                log.getOwnerName(),
                log.getRecipientIdx(),
                log.getRecipientEmail(),
                log.getRecipientName(),
                log.getActorIdx(),
                log.getActorEmail(),
                log.getActorName(),
                log.getAction() != null ? log.getAction().name() : null,
                log.getPermission(),
                log.getStatus(),
                log.getExpiresAt(),
                log.getDownloadLimit(),
                log.getDownloadCount(),
                log.getCreatedAt()
        );
    }
}
