package com.example.WaffleBear.file.share;

import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import com.example.WaffleBear.user.model.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class ShareInheritanceService {

    private final ShareRepository shareRepository;
    private final FileUpDownloadRepository fileUpDownloadRepository;

    public void inheritParentShares(FileInfo parentFolder, FileInfo child) {
        if (parentFolder == null || child == null || parentFolder.getIdx() == null || child.getIdx() == null) {
            return;
        }

        List<FileShare> parentShares = shareRepository.findAllByFile_Idx(parentFolder.getIdx());
        if (parentShares.isEmpty()) {
            return;
        }

        boolean childSharedFlagChanged = false;
        for (FileShare parentShare : parentShares) {
            User recipient = parentShare.getRecipient();
            if (recipient == null || recipient.getIdx() == null) {
                continue;
            }

            FileSharePermission inheritedPermission = parentShare.getEffectivePermission();
            FileShareStatus inheritedStatus = parentShare.getEffectiveStatus();
            Optional<FileShare> existing = shareRepository.findByFile_IdxAndRecipient_Idx(child.getIdx(), recipient.getIdx());
            if (existing.isPresent()) {
                FileShare currentShare = existing.get();
                boolean changed = false;
                if (shouldAdoptInheritedPermission(currentShare.getEffectivePermission(), inheritedPermission)) {
                    currentShare.changePermission(inheritedPermission);
                    changed = true;
                }
                if (currentShare.getEffectiveStatus() == FileShareStatus.PENDING && inheritedStatus.isAccepted()) {
                    currentShare.accept();
                    changed = true;
                }
                if (changed) {
                    shareRepository.save(currentShare);
                }
                continue;
            }

            User owner = child.getUser() != null ? child.getUser() : parentFolder.getUser();
            if (owner == null) {
                continue;
            }

            shareRepository.save(FileShare.builder()
                    .file(child)
                    .owner(owner)
                    .recipient(recipient)
                    .permission(inheritedPermission)
                    .status(inheritedStatus)
                    .respondedAt(parentShare.getRespondedAt())
                    .build());
            childSharedFlagChanged = true;
        }

        if (childSharedFlagChanged && !child.isSharedFile()) {
            child.changeSharedFile(true);
            fileUpDownloadRepository.save(child);
        }
    }

    private boolean shouldAdoptInheritedPermission(
            FileSharePermission currentPermission,
            FileSharePermission inheritedPermission
    ) {
        return permissionRank(inheritedPermission) > permissionRank(currentPermission);
    }

    private int permissionRank(FileSharePermission permission) {
        if (permission == null) {
            return 0;
        }
        return switch (permission) {
            case READ -> 1;
            case DOWNLOAD -> 2;
            case UPLOAD -> 3;
            case WRITE -> 4;
        };
    }
}
