package com.example.WaffleBear.file.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.secret.PinAttemptLimiter;
import com.example.WaffleBear.file.secret.SecretAccessGuard;
import com.example.WaffleBear.file.secret.SecretTreeRules;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.file.share.model.FileShare;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class FileThumbnailQueryService {

    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final ShareRepository shareRepository;
    private final FileThumbnailService fileThumbnailService;

    @Autowired(required = false)
    private SecretAccessGuard secretAccessGuard;

    @Autowired(required = false)
    private PasswordEncoder passwordEncoder;

    private PinAttemptLimiter pinAttemptLimiter = new PinAttemptLimiter();

    @Autowired(required = false)
    public void setPinAttemptLimiter(PinAttemptLimiter pinAttemptLimiter) {
        if (pinAttemptLimiter != null) {
            this.pinAttemptLimiter = pinAttemptLimiter;
        }
    }

    public FileThumbnailService.ThumbnailPayload loadOwnedThumbnail(Long userIdx, Long fileIdx) {
        requireAuthenticated(userIdx);
        if (fileIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        FileInfo file = fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
        if (secretAccessGuard != null) {
            secretAccessGuard.assertNodeAccess(userIdx, file, true);
        }
        return fileThumbnailService.loadThumbnail(file);
    }

    public FileThumbnailService.ThumbnailPayload loadSharedThumbnail(Long userIdx, Long fileIdx) {
        return loadSharedThumbnail(userIdx, fileIdx, null);
    }

    public FileThumbnailService.ThumbnailPayload loadSharedThumbnail(Long userIdx, Long fileIdx, String sharePassword) {
        requireAuthenticated(userIdx);
        if (fileIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        FileShare share = shareRepository.findByFile_IdxAndRecipient_Idx(fileIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
        if (!share.getEffectiveStatus().isAccepted() || !share.getEffectivePermission().canRead()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        if (share.isExpired(LocalDateTime.now())) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        if (share.isPasswordProtected()) {
            String scopeKey = "share-thumb:" + userIdx + ":" + share.getIdx();
            pinAttemptLimiter.assertNotLocked(scopeKey);
            String candidate = sharePassword == null ? "" : sharePassword.trim();
            if (candidate.isEmpty()) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            if (passwordEncoder == null || !passwordEncoder.matches(candidate, share.getPasswordHash())) {
                pinAttemptLimiter.recordFailure(scopeKey);
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            pinAttemptLimiter.clearFailures(scopeKey);
        }

        FileInfo file = share.getFile();
        if (file == null
                || file.isTrashed()
                || file.isLockedFile()
                || SecretTreeRules.hasVaultAncestor(file)
                || SecretTreeRules.hasHiddenAncestor(file)) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return fileThumbnailService.loadThumbnail(file);
    }

    private void requireAuthenticated(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }
}
