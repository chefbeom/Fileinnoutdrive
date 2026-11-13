package com.example.WaffleBear.file.sharelink;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.secret.PinAttemptLimiter;
import com.example.WaffleBear.file.secret.SecretTreeRules;
import com.example.WaffleBear.file.service.FileObjectDownloadService;
import com.example.WaffleBear.file.sharelink.dto.DownloadShareLinkDto;
import com.example.WaffleBear.file.sharelink.model.FileDownloadShareLink;
import com.example.WaffleBear.file.util.FileContentUtils;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;

/**
 * Manages lifecycle and enforcement of tokenized presigned download share links.
 */
@Service
@RequiredArgsConstructor
public class DownloadShareLinkService {

    static final int DEFAULT_DURATION_MINUTES = 30;
    static final int MAX_DURATION_MINUTES = 43200; // 30 days
    static final int MAX_DOWNLOAD_LIMIT = 10000;
    static final int MIN_PASSWORD_LENGTH = 4;
    static final int MAX_PASSWORD_LENGTH = 64;
    static final int PRESIGNED_URL_MAX_SECONDS_LIMITED = 300;
    static final int PRESIGNED_URL_MAX_SECONDS_UNLIMITED = 3600;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final FileDownloadShareLinkRepository shareLinkRepository;
    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final UserRepository userRepository;
    private final FileObjectDownloadService fileObjectDownloadService;
    private final PasswordEncoder passwordEncoder;
    private final PinAttemptLimiter pinAttemptLimiter;

    /**
     * Issues a new tokenized download link for an owned, non-secret, unlocked file.
     */
    @Transactional
    public DownloadShareLinkDto.LinkRes createDownloadLink(
            Long userIdx,
            Long fileIdx,
            DownloadShareLinkDto.CreateReq request
    ) {
        if (userIdx == null || fileIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        User owner = userRepository.findById(userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.USER_NOT_FOUND));
        FileInfo file = fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.FILE_EMPTY));

        validateEligibleForDownloadLink(file);

        LocalDateTime now = LocalDateTime.now();
        ResolvedExpiry resolvedExpiry = resolveExpiry(request, now);
        Integer maxDownloads = resolveMaxDownloads(request);
        String passwordHash = encodeOptionalPassword(request != null ? request.getPassword() : null);

        FileDownloadShareLink saved = shareLinkRepository.save(FileDownloadShareLink.builder()
                .token(generateUniqueToken())
                .file(file)
                .owner(owner)
                .durationMinutes(resolvedExpiry.durationMinutes())
                .expiresAt(resolvedExpiry.expiresAt())
                .maxDownloads(maxDownloads)
                .downloadCount(0)
                .passwordHash(passwordHash)
                .revoked(false)
                .build());

        return toLinkRes(saved, now);
    }

    /**
     * Lists previously created download links for a specific file owned by the user.
     */
    @Transactional(readOnly = true)
    public List<DownloadShareLinkDto.LinkRes> getFileDownloadLinks(Long userIdx, Long fileIdx) {
        if (userIdx == null || fileIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.FILE_EMPTY));

        LocalDateTime now = LocalDateTime.now();
        return shareLinkRepository.findAllByFile_IdxAndOwner_IdxOrderByCreatedAtDescIdxDesc(fileIdx, userIdx)
                .stream()
                .map(link -> toLinkRes(link, now))
                .toList();
    }

    /**
     * Lists all download links issued by the authenticated owner.
     */
    @Transactional(readOnly = true)
    public List<DownloadShareLinkDto.LinkRes> getMyDownloadLinks(Long userIdx) {
        if (userIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        LocalDateTime now = LocalDateTime.now();
        return shareLinkRepository.findAllByOwner_IdxOrderByCreatedAtDescIdxDesc(userIdx)
                .stream()
                .map(link -> toLinkRes(link, now))
                .toList();
    }

    /**
     * Revokes an issued download link so no further downloads are allowed.
     */
    @Transactional
    public DownloadShareLinkDto.LinkRes revokeDownloadLink(Long userIdx, Long linkIdx) {
        if (userIdx == null || linkIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        FileDownloadShareLink link = shareLinkRepository.findByIdxAndOwner_Idx(linkIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.SHARE_LINK_NOT_FOUND));

        LocalDateTime now = LocalDateTime.now();
        if (!link.isRevoked()) {
            link.revoke(now);
            shareLinkRepository.save(link);
        }
        return toLinkRes(link, now);
    }

    /**
     * Returns public metadata for a share token without consuming any download slot.
     */
    @Transactional(readOnly = true)
    public DownloadShareLinkDto.PublicMetaRes getPublicLinkMetadata(String token) {
        FileDownloadShareLink link = findLinkByToken(token);
        LocalDateTime now = LocalDateTime.now();
        String status = resolveStatus(link, now);
        FileInfo file = link.getFile();
        String fileName = FileContentUtils.sanitizeDownloadFileName(
                file != null ? file.getFileOriginName() : null,
                file != null ? file.getFileSaveName() : "file"
        );
        String ownerName = resolveOwnerDisplayName(link.getOwner());

        return DownloadShareLinkDto.PublicMetaRes.builder()
                .token(link.getToken())
                .fileName(fileName)
                .fileFormat(file != null ? file.getFileFormat() : "")
                .fileSize(file != null ? file.getFileSize() : null)
                .ownerName(ownerName)
                .durationMinutes(link.getDurationMinutes())
                .createdAt(link.getCreatedAt())
                .expiresAt(link.getExpiresAt())
                .remainingSeconds(computeRemainingSeconds(link.getExpiresAt(), now))
                .maxDownloads(link.getMaxDownloads())
                .downloadCount(link.getDownloadCount())
                .remainingDownloads(link.getRemainingDownloads())
                .passwordProtected(link.isPasswordProtected())
                .downloadable("ACTIVE".equals(status))
                .status(status)
                .build();
    }

    /**
     * Validates access rules, atomically consumes one download slot, and issues
     * a short-lived MinIO presigned attachment URL bounded by the link's remaining lifetime.
     */
    @Transactional
    public DownloadShareLinkDto.PublicDownloadUrlRes issuePresignedDownloadUrl(String token, String rawPassword) {
        FileDownloadShareLink link = findLinkByToken(token);
        LocalDateTime now = LocalDateTime.now();

        ensureLinkDownloadable(link, now);
        verifyPasswordIfProtected(link, rawPassword);

        int previousDownloadCount = link.getDownloadCount();
        int updatedRows = shareLinkRepository.consumeDownloadSlot(link.getIdx(), now);
        if (updatedRows == 0) {
            FileDownloadShareLink refreshed = shareLinkRepository.findByToken(normalizeToken(token))
                    .orElseThrow(() -> BaseException.from(BaseResponseStatus.SHARE_LINK_NOT_FOUND));
            ensureLinkDownloadable(refreshed, LocalDateTime.now());
            throw BaseException.from(BaseResponseStatus.SHARE_LINK_DOWNLOAD_LIMIT_REACHED);
        }

        FileInfo file = link.getFile();
        String downloadName = FileContentUtils.sanitizeDownloadFileName(file.getFileOriginName(), file.getFileSaveName());
        String contentType = FileContentUtils.resolveDownloadContentType(downloadName);
        long remainingLinkSeconds = Math.max(1L, Duration.between(now, link.getExpiresAt()).getSeconds());
        int presignedCap = link.getMaxDownloads() != null
                ? PRESIGNED_URL_MAX_SECONDS_LIMITED
                : PRESIGNED_URL_MAX_SECONDS_UNLIMITED;
        int urlExpirySeconds = (int) Math.max(1L, Math.min(remainingLinkSeconds, presignedCap));

        String presignedUrl = fileObjectDownloadService.generateAttachmentDownloadUrl(
                file.getFileSavePath(),
                downloadName,
                contentType,
                urlExpirySeconds
        );

        int nextDownloadCount = previousDownloadCount + 1;
        Integer remainingDownloads = link.getMaxDownloads() == null
                ? null
                : Math.max(0, link.getMaxDownloads() - nextDownloadCount);
        String nextStatus = (link.getMaxDownloads() != null && nextDownloadCount >= link.getMaxDownloads())
                ? "EXHAUSTED"
                : "ACTIVE";

        return DownloadShareLinkDto.PublicDownloadUrlRes.builder()
                .presignedUrl(presignedUrl)
                .fileName(downloadName)
                .fileFormat(file.getFileFormat())
                .fileSize(file.getFileSize())
                .contentType(contentType)
                .linkExpiresAt(link.getExpiresAt())
                .urlExpiresInSeconds(urlExpirySeconds)
                .maxDownloads(link.getMaxDownloads())
                .downloadCount(nextDownloadCount)
                .remainingDownloads(remainingDownloads)
                .status(nextStatus)
                .build();
    }

    private FileDownloadShareLink findLinkByToken(String rawToken) {
        String token = normalizeToken(rawToken);
        if (token.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.SHARE_LINK_NOT_FOUND);
        }
        return shareLinkRepository.findByToken(token)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.SHARE_LINK_NOT_FOUND));
    }

    private void validateEligibleForDownloadLink(FileInfo file) {
        if (file == null || file.getNodeType() == FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        if (file.isTrashed() || file.isLockedFile() || !hasStoredObjectKey(file)) {
            throw BaseException.from(BaseResponseStatus.SHARE_LINK_FILE_UNAVAILABLE);
        }
        if (SecretTreeRules.hasVaultAncestor(file) || SecretTreeRules.hasHiddenAncestor(file)) {
            throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_NOT_ALLOWED);
        }
    }

    private void ensureLinkDownloadable(FileDownloadShareLink link, LocalDateTime now) {
        if (link.isRevoked()) {
            throw BaseException.from(BaseResponseStatus.SHARE_LINK_REVOKED);
        }
        if (link.isExpired(now)) {
            throw BaseException.from(BaseResponseStatus.SHARE_LINK_EXPIRED);
        }
        if (link.isDownloadLimitReached()) {
            throw BaseException.from(BaseResponseStatus.SHARE_LINK_DOWNLOAD_LIMIT_REACHED);
        }
        FileInfo file = link.getFile();
        if (!isPublicFileDownloadable(file)) {
            throw BaseException.from(BaseResponseStatus.SHARE_LINK_FILE_UNAVAILABLE);
        }
    }

    private void verifyPasswordIfProtected(FileDownloadShareLink link, String rawPassword) {
        if (!link.isPasswordProtected()) {
            return;
        }
        String limiterKey = "share-link:" + link.getToken();
        pinAttemptLimiter.assertNotLocked(limiterKey);

        String candidate = rawPassword == null ? "" : rawPassword.trim();
        if (candidate.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.SHARE_LINK_PASSWORD_REQUIRED);
        }
        if (!passwordEncoder.matches(candidate, link.getPasswordHash())) {
            pinAttemptLimiter.recordFailure(limiterKey);
            throw BaseException.from(BaseResponseStatus.SHARE_LINK_PASSWORD_INVALID);
        }
        pinAttemptLimiter.clearFailures(limiterKey);
    }

    private ResolvedExpiry resolveExpiry(DownloadShareLinkDto.CreateReq request, LocalDateTime now) {
        if (request != null && request.getExpiresAt() != null) {
            LocalDateTime explicit = request.getExpiresAt();
            long minutes = Duration.between(now, explicit).toMinutes();
            if (!explicit.isAfter(now) || Duration.between(now, explicit).toSeconds() < 60) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            if (minutes > MAX_DURATION_MINUTES) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            Integer recordedMinutes = request.getExpiresInMinutes() != null
                    ? request.getExpiresInMinutes()
                    : (int) Math.max(1L, Math.min(MAX_DURATION_MINUTES, minutes));
            return new ResolvedExpiry(explicit, recordedMinutes);
        }

        int minutes = (request != null && request.getExpiresInMinutes() != null)
                ? request.getExpiresInMinutes()
                : DEFAULT_DURATION_MINUTES;
        if (minutes < 1 || minutes > MAX_DURATION_MINUTES) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return new ResolvedExpiry(now.plusMinutes(minutes), minutes);
    }

    private Integer resolveMaxDownloads(DownloadShareLinkDto.CreateReq request) {
        if (request == null || request.getMaxDownloads() == null) {
            return null;
        }
        int limit = request.getMaxDownloads();
        if (limit < 1 || limit > MAX_DOWNLOAD_LIMIT) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return limit;
    }

    private String encodeOptionalPassword(String rawPassword) {
        if (rawPassword == null || rawPassword.isBlank()) {
            return null;
        }
        String normalized = rawPassword.trim();
        if (normalized.length() < MIN_PASSWORD_LENGTH || normalized.length() > MAX_PASSWORD_LENGTH) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return passwordEncoder.encode(normalized);
    }

    private String generateUniqueToken() {
        for (int attempt = 0; attempt < 5; attempt++) {
            byte[] randomBytes = new byte[24];
            SECURE_RANDOM.nextBytes(randomBytes);
            String candidate = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
            if (!shareLinkRepository.existsByToken(candidate)) {
                return candidate;
            }
        }
        throw BaseException.from(BaseResponseStatus.FAIL);
    }

    private String resolveStatus(FileDownloadShareLink link, LocalDateTime now) {
        if (link.isRevoked()) {
            return "REVOKED";
        }
        if (link.isExpired(now)) {
            return "EXPIRED";
        }
        if (link.isDownloadLimitReached()) {
            return "EXHAUSTED";
        }
        if (!isPublicFileDownloadable(link.getFile())) {
            return "UNAVAILABLE";
        }
        return "ACTIVE";
    }

    private boolean isPublicFileDownloadable(FileInfo file) {
        return file != null
                && file.getNodeType() != FileNodeType.FOLDER
                && !file.isTrashed()
                && !file.isLockedFile()
                && hasStoredObjectKey(file)
                && !SecretTreeRules.hasVaultAncestor(file)
                && !SecretTreeRules.hasHiddenAncestor(file);
    }

    private boolean hasStoredObjectKey(FileInfo file) {
        return file.getFileSavePath() != null && !file.getFileSavePath().isBlank();
    }

    private DownloadShareLinkDto.LinkRes toLinkRes(FileDownloadShareLink link, LocalDateTime now) {
        FileInfo file = link.getFile();
        String status = resolveStatus(link, now);
        String token = link.getToken();
        return DownloadShareLinkDto.LinkRes.builder()
                .idx(link.getIdx())
                .token(token)
                .fileIdx(file != null ? file.getIdx() : null)
                .fileName(file != null ? file.getFileOriginName() : null)
                .fileFormat(file != null ? file.getFileFormat() : null)
                .fileSize(file != null ? file.getFileSize() : null)
                .durationMinutes(link.getDurationMinutes())
                .createdAt(link.getCreatedAt())
                .expiresAt(link.getExpiresAt())
                .remainingSeconds(computeRemainingSeconds(link.getExpiresAt(), now))
                .maxDownloads(link.getMaxDownloads())
                .downloadCount(link.getDownloadCount())
                .remainingDownloads(link.getRemainingDownloads())
                .passwordProtected(link.isPasswordProtected())
                .revoked(link.isRevoked())
                .revokedAt(link.getRevokedAt())
                .lastDownloadedAt(link.getLastDownloadedAt())
                .status(status)
                .sharePath("/share-link/" + token)
                .directDownloadPath("/file/share-links/public/" + token + "/download")
                .build();
    }

    private long computeRemainingSeconds(LocalDateTime expiresAt, LocalDateTime now) {
        if (expiresAt == null || !expiresAt.isAfter(now)) {
            return 0L;
        }
        return Duration.between(now, expiresAt).getSeconds();
    }

    private String resolveOwnerDisplayName(User owner) {
        if (owner == null) {
            return "";
        }
        if (owner.getName() != null && !owner.getName().isBlank()) {
            return owner.getName();
        }
        return owner.getEmail() != null ? owner.getEmail() : "";
    }

    private String normalizeToken(String rawToken) {
        return rawToken == null ? "" : rawToken.trim();
    }

    private record ResolvedExpiry(LocalDateTime expiresAt, Integer durationMinutes) {
    }
}
