package com.example.WaffleBear.file.secret;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.model.FileInfo;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class SecretAccessGuard {

    private final SecretTokenService secretTokenService;
    private final SecretRequestContext secretRequestContext;

    public boolean hasValidVaultToken(Long userIdx) {
        if (userIdx == null || userIdx <= 0) {
            return false;
        }
        return secretTokenService.isValidVaultToken(userIdx, secretRequestContext.getVaultToken());
    }

    public void requireVaultUnlocked(Long userIdx) {
        if (!hasValidVaultToken(userIdx)) {
            throw BaseException.from(BaseResponseStatus.VAULT_UNLOCK_REQUIRED);
        }
    }

    public Set<Long> getUnlockedFolderIds(Long userIdx) {
        return secretTokenService.extractUnlockedFolderIds(userIdx, secretRequestContext.getFolderTokens());
    }

    public boolean isFolderUnlocked(Long userIdx, FileInfo folder) {
        if (folder == null) {
            return true;
        }
        if (folder.isVaultSpace() && !hasValidVaultToken(userIdx)) {
            return false;
        }
        Set<Long> unlockedIds = getUnlockedFolderIds(userIdx);
        return areAllPinAncestorsUnlocked(folder, unlockedIds);
    }

    public void assertNodeAccess(Long userIdx, FileInfo node, boolean allowRevealedHidden) {
        if (node == null) {
            return;
        }

        Set<Long> unlockedIds = getUnlockedFolderIds(userIdx);
        FileInfo cursor = node;
        Set<Long> visited = new HashSet<>();

        while (cursor != null) {
            Long idx = cursor.getIdx();
            if (idx != null && !visited.add(idx)) {
                break;
            }
            if (cursor.isVaultSpace()) {
                requireVaultUnlocked(userIdx);
            }
            if (cursor.isHiddenFolder()) {
                if (!allowRevealedHidden) {
                    throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_UNLOCK_REQUIRED);
                }
                if (cursor.isFolderPinEnabled() && (idx == null || !unlockedIds.contains(idx))) {
                    throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_UNLOCK_REQUIRED);
                }
            }
            cursor = cursor.getParent();
        }
    }

    private boolean areAllPinAncestorsUnlocked(FileInfo node, Set<Long> unlockedIds) {
        FileInfo cursor = node;
        Set<Long> visited = new HashSet<>();
        while (cursor != null) {
            Long idx = cursor.getIdx();
            if (idx != null && !visited.add(idx)) {
                break;
            }
            if (cursor.isHiddenFolder()
                    && cursor.isFolderPinEnabled()
                    && (idx == null || !unlockedIds.contains(idx))) {
                return false;
            }
            cursor = cursor.getParent();
        }
        return true;
    }
}
