package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileShareAuditAction;
import com.example.WaffleBear.file.share.model.FileShareStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
class ShareTreeStatusService {

    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final ShareRepository shareRepository;
    private final ShareAuditService shareAuditService;

    int changeTreeStatus(FileShare rootShare, FileShareStatus status, Long actorIdx, FileShareAuditAction action) {
        FileInfo root = rootShare == null ? null : rootShare.getFile();
        Long recipientIdx = recipientId(rootShare);
        if (root == null || root.getIdx() == null || recipientIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        Long ownerIdx = root.getUser() != null ? root.getUser().getIdx() : ownerId(rootShare);
        if (ownerIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        var childrenByParentId = ShareFileTree.groupChildrenByParentId(fileUpDownloadRepository.findAllByUser_Idx(ownerIdx));
        List<FileInfo> targetTree = ShareFileTree.collectRevocableShareTree(root, childrenByParentId);

        List<FileShare> changed = new ArrayList<>();
        for (FileInfo targetFile : targetTree) {
            shareRepository.findByFile_IdxAndRecipient_Idx(targetFile.getIdx(), recipientIdx)
                    .filter(targetShare -> Objects.equals(ownerId(targetShare), ownerIdx))
                    .filter(targetShare -> targetShare.getEffectiveStatus() != status)
                    .ifPresent(targetShare -> {
                        targetShare.changeStatus(status);
                        changed.add(targetShare);
                    });
        }

        if (!changed.isEmpty()) {
            shareRepository.saveAll(changed);
            changed.forEach(share -> shareAuditService.record(share, actorIdx, action));
        }
        return changed.size();
    }

    private Long ownerId(FileShare share) {
        return share != null && share.getOwner() != null ? share.getOwner().getIdx() : null;
    }

    private Long recipientId(FileShare share) {
        return share != null && share.getRecipient() != null ? share.getRecipient().getIdx() : null;
    }
}