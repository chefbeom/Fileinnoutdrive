package com.example.WaffleBear.storageshare.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.sharelink.FileDownloadShareLinkRepository;
import com.example.WaffleBear.file.upload.UploadObjectStorageService;
import com.example.WaffleBear.file.version.FileVersionLifecycleService;
import com.example.WaffleBear.file.version.FileVersionRepository;
import com.example.WaffleBear.file.version.model.FileVersion;
import com.example.WaffleBear.group.model.entity.Relationship;
import com.example.WaffleBear.group.model.entity.RelationshipGroup;
import com.example.WaffleBear.group.model.entity.RelationshipGroupMapping;
import com.example.WaffleBear.group.model.enums.RelationshipStatus;
import com.example.WaffleBear.group.repository.RelationshipGroupMappingRepository;
import com.example.WaffleBear.group.repository.RelationshipGroupRepository;
import com.example.WaffleBear.group.repository.RelationshipRepository;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.storageshare.model.StorageGrant;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.GrantStatus;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.GrantType;
import com.example.WaffleBear.storageshare.model.dto.StorageShareDto;
import com.example.WaffleBear.storageshare.repository.StorageGrantRepository;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Slf4j
public class StorageGrantService {

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final StorageGrantRepository storageGrantRepository;
    private final UserRepository userRepository;
    private final StoragePlanService storagePlanService;
    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final FileVersionRepository fileVersionRepository;
    private final FileVersionLifecycleService fileVersionLifecycleService;
    private final ShareRepository shareRepository;
    private final UploadObjectStorageService uploadObjectStorageService;
    private final RelationshipRepository relationshipRepository;
    private final RelationshipGroupRepository relationshipGroupRepository;
    private final RelationshipGroupMappingRepository relationshipGroupMappingRepository;
    private final NotificationService notificationService;

    @Autowired(required = false)
    private FileDownloadShareLinkRepository fileDownloadShareLinkRepository;

    @Transactional
    public StorageShareDto.CapacityShareOverviewRes getCapacityOverview(Long userIdx) {
        requireUser(userIdx);
        LocalDateTime now = LocalDateTime.now();
        processExpiredAndExpiringGrants(now);
        return buildCapacityOverview(userIdx, now);
    }

    @Transactional
    public StorageShareDto.CapacityShareOverviewRes createGrants(Long userIdx, StorageShareDto.CreateGrantReq request) {
        User granter = requireUser(userIdx);
        if (request == null || request.bytes() == null || request.bytes() < StoragePlanService.GIGABYTE) {
            throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_INVALID_AMOUNT);
        }

        LocalDateTime now = LocalDateTime.now();
        processExpiredAndExpiringGrants(now);

        GrantType grantType = parseGrantType(request.grantType());
        LocalDateTime startAt = request.startAt() != null ? request.startAt() : now;
        LocalDateTime endAt = null;

        if (grantType == GrantType.FIXED) {
            if (request.endAt() == null || !request.endAt().isAfter(startAt) || !request.endAt().isAfter(now)) {
                throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_INVALID_PERIOD);
            }
            endAt = request.endAt();
        }

        Map<Long, ResolvedRecipient> recipients = resolveRecipients(
                granter,
                request.userIds(),
                request.groupIds(),
                request.emails()
        );
        if (recipients.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_NO_RECIPIENT);
        }

        long perRecipientBytes = request.bytes();
        long totalRequiredBytes = Math.multiplyExact(perRecipientBytes, (long) recipients.size());
        long availableBytes = calculateAvailableBytesForUser(userIdx, now);
        if (availableBytes < totalRequiredBytes) {
            throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_INSUFFICIENT_CAPACITY);
        }

        for (ResolvedRecipient resolved : recipients.values()) {
            StorageGrant grant = StorageGrant.builder()
                    .granter(granter)
                    .recipient(resolved.user())
                    .bytes(perRecipientBytes)
                    .grantType(grantType)
                    .status(GrantStatus.ACTIVE)
                    .sourceLabel(resolved.sourceLabel())
                    .startAt(startAt)
                    .endAt(endAt)
                    .notifiedDaysBefore(0)
                    .build();
            storageGrantRepository.save(grant);

            String periodDesc = grantType == GrantType.RECURRING
                    ? "월 단위 정기 공유 (취소 시 1개월 유예)"
                    : formatDateTime(startAt) + " ~ " + formatDateTime(endAt) + " 대여";
            notificationService.sendGeneralNotification(
                    resolved.user().getIdx(),
                    "저장 용량 공유 도착",
                    displayName(granter) + "님이 " + formatBytes(perRecipientBytes) + " 저장 용량을 공유했습니다. (" + periodDesc + ")"
            );
        }

        storageGrantRepository.flush();
        return buildCapacityOverview(userIdx, now);
    }

    @Transactional
    public StorageShareDto.CapacityShareOverviewRes cancelGrant(Long userIdx, Long grantIdx) {
        User actor = requireUser(userIdx);
        LocalDateTime now = LocalDateTime.now();

        StorageGrant grant = storageGrantRepository.findById(grantIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.STORAGE_GRANT_NOT_FOUND));

        boolean isGranter = grant.getGranter() != null && Objects.equals(grant.getGranter().getIdx(), userIdx);
        boolean isRecipient = grant.getRecipient() != null && Objects.equals(grant.getRecipient().getIdx(), userIdx);
        if (!isGranter && !isRecipient) {
            throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_NOT_FOUND);
        }

        if (grant.getStatus() == GrantStatus.ENDED || grant.getStatus() == GrantStatus.CANCELLED) {
            throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_ALREADY_CANCELLED);
        }

        if (isRecipient) {
            // 수신자가 스스로 반납하는 경우 즉시 반납 및 초과분 정리
            grant.markEnded(now);
            storageGrantRepository.saveAndFlush(grant);
            enforceRecipientQuotaLimit(userIdx);
            if (grant.getGranter() != null) {
                notificationService.sendGeneralNotification(
                        grant.getGranter().getIdx(),
                        "공유 용량 반납 완료",
                        displayName(actor) + "님이 공유받은 " + formatBytes(grant.safeBytes()) + " 용량을 반납했습니다."
                );
            }
            return buildCapacityOverview(userIdx, now);
        }

        // 제공자(A)가 취소하는 경우: 시작 전이면 즉시 종료, 사용 중이면 1개월 유예 기간 부여
        if (grant.isScheduledAt(now)) {
            grant.markEnded(now);
            storageGrantRepository.saveAndFlush(grant);
            if (grant.getRecipient() != null) {
                notificationService.sendGeneralNotification(
                        grant.getRecipient().getIdx(),
                        "예약된 용량 대여 취소",
                        displayName(actor) + "님이 시작 예정이던 " + formatBytes(grant.safeBytes()) + " 용량 대여를 취소했습니다."
                );
            }
            return buildCapacityOverview(userIdx, now);
        }

        grant.cancel(now);
        grant.markNotified(30);
        storageGrantRepository.saveAndFlush(grant);

        if (grant.getRecipient() != null) {
            notificationService.sendGeneralNotification(
                    grant.getRecipient().getIdx(),
                    "공유 용량 취소 및 1개월 유예 안내 (D-30)",
                    displayName(actor) + "님이 공유 중이던 " + formatBytes(grant.safeBytes())
                            + " 용량 공유를 취소했습니다. " + formatDateTime(grant.getEndAt())
                            + "까지 1개월 유예 기간이 제공되며, 만료 시 할당량을 초과한 데이터는 단계적으로 자동 삭제됩니다."
            );
        }

        return buildCapacityOverview(userIdx, now);
    }

    @Transactional
    public int processExpiredAndExpiringGrants(LocalDateTime now) {
        LocalDateTime referenceTime = now == null ? LocalDateTime.now() : now;
        List<StorageGrant> openGrants = storageGrantRepository.findAllByStatusIn(
                List.of(GrantStatus.ACTIVE, GrantStatus.CANCELLED)
        );

        int processedCount = 0;
        for (StorageGrant grant : openGrants) {
            if (grant == null || grant.getEndAt() == null) {
                continue;
            }

            if (!grant.getEndAt().isAfter(referenceTime)) {
                grant.markEnded(referenceTime);
                storageGrantRepository.saveAndFlush(grant);
                if (grant.getRecipient() != null && grant.getRecipient().getIdx() != null) {
                    Long recipientIdx = grant.getRecipient().getIdx();
                    CleanupResult cleanupResult = enforceRecipientQuotaLimit(recipientIdx);
                    String cleanupMsg = cleanupResult.deletedBytes() > 0L
                            ? " 초과 용량 " + formatBytes(cleanupResult.deletedBytes())
                            + " (파일 " + cleanupResult.deletedFiles() + "개, 버전 " + cleanupResult.deletedVersions() + "개)가 자동 정리되었습니다."
                            : " 현재 사용량이 기본 할당량 이내여서 삭제된 파일이 없습니다.";
                    notificationService.sendGeneralNotification(
                            recipientIdx,
                            "공유/대여 저장 용량 만료 안내",
                            formatBytes(grant.safeBytes()) + " 공유 용량 기간이 만료되었습니다." + cleanupMsg
                    );
                }
                processedCount++;
                continue;
            }

            sendAdvanceExpiryNoticeIfNeeded(grant, referenceTime);
        }
        return processedCount;
    }

    /**
     * 수신자의 유효 할당량을 초과한 데이터를 단계적으로 영구 삭제한다:
     * 1단계: 휴지통 파일
     * 2단계: 오래된 파일 버전 (FileVersion)
     * 3단계: 잠금되지 않은 일반 파일 (마지막 수정/접근이 오래된 순)
     * 4단계: 잠금된 파일 (여전히 초과한 경우에만 마지막으로 정리)
     */
    @Transactional
    public CleanupResult enforceRecipientQuotaLimit(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            return new CleanupResult(0L, 0, 0);
        }

        StoragePlanService.StorageQuota effectiveQuota = storagePlanService.resolveQuota(userIdx);
        long quotaBytes = effectiveQuota.totalQuotaBytes();
        long currentUsedBytes = calculatePersonalUsedBytes(userIdx);
        if (currentUsedBytes <= quotaBytes) {
            return new CleanupResult(0L, 0, 0);
        }

        long bytesToFree = currentUsedBytes - quotaBytes;
        long freedBytes = 0L;
        int deletedFilesCount = 0;
        int deletedVersionsCount = 0;
        List<String> objectKeysToDelete = new ArrayList<>();

        List<FileInfo> allUserNodes = fileUpDownloadRepository.findAllByUser_Idx(userIdx);
        List<FileInfo> allFileNodes = allUserNodes.stream()
                .filter(node -> node.getNodeType() == null || node.getNodeType() == FileNodeType.FILE)
                .toList();

        // 1단계: 휴지통 파일 (삭제일이 오래된 순)
        List<FileInfo> trashedFiles = allFileNodes.stream()
                .filter(FileInfo::isTrashed)
                .sorted(Comparator
                        .comparing(FileInfo::isLockedFile)
                        .thenComparing(FileInfo::getDeletedAt, Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(FileInfo::getUploadDate, Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(FileInfo::getIdx, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();

        for (FileInfo trashedFile : trashedFiles) {
            if (freedBytes >= bytesToFree) {
                break;
            }
            DeletedFileStats stats = deleteSingleFileWithVersionsAndShares(trashedFile, objectKeysToDelete);
            freedBytes += stats.freedBytes();
            deletedFilesCount += 1;
            deletedVersionsCount += stats.deletedVersions();
        }

        // 2단계: 남아있는 파일들의 오래된 버전(FileVersion) 정리
        if (freedBytes < bytesToFree) {
            List<FileVersion> remainingVersions = fileVersionRepository.findAllByUser_Idx(userIdx).stream()
                    .sorted(Comparator
                            .comparing(FileVersion::getCreatedAt, Comparator.nullsFirst(Comparator.naturalOrder()))
                            .thenComparingInt(FileVersion::getVersionNumber))
                    .toList();

            for (FileVersion version : remainingVersions) {
                if (freedBytes >= bytesToFree) {
                    break;
                }
                long vSize = version.getFileSize() != null && version.getFileSize() > 0L ? version.getFileSize() : 0L;
                if (version.getFileSavePath() != null && !version.getFileSavePath().isBlank()) {
                    objectKeysToDelete.add(version.getFileSavePath().trim());
                }
                fileVersionRepository.delete(version);
                freedBytes += vSize;
                deletedVersionsCount += 1;
            }
            fileVersionRepository.flush();
        }

        // 3단계: 잠금되지 않은 활성 파일 (마지막 수정일 -> 업로드일 오래된 순)
        if (freedBytes < bytesToFree) {
            List<FileInfo> unlockedActiveFiles = allFileNodes.stream()
                    .filter(file -> !file.isTrashed() && !file.isLockedFile())
                    .sorted(oldestFileComparator())
                    .toList();

            for (FileInfo activeFile : unlockedActiveFiles) {
                if (freedBytes >= bytesToFree) {
                    break;
                }
                DeletedFileStats stats = deleteSingleFileWithVersionsAndShares(activeFile, objectKeysToDelete);
                freedBytes += stats.freedBytes();
                deletedFilesCount += 1;
                deletedVersionsCount += stats.deletedVersions();
            }
        }

        // 4단계: 잠금 파일도 불가피하게 초과 시 맨 마지막에 정리
        if (freedBytes < bytesToFree) {
            List<FileInfo> lockedActiveFiles = allFileNodes.stream()
                    .filter(file -> !file.isTrashed() && file.isLockedFile())
                    .sorted(oldestFileComparator())
                    .toList();

            for (FileInfo lockedFile : lockedActiveFiles) {
                if (freedBytes >= bytesToFree) {
                    break;
                }
                DeletedFileStats stats = deleteSingleFileWithVersionsAndShares(lockedFile, objectKeysToDelete);
                freedBytes += stats.freedBytes();
                deletedFilesCount += 1;
                deletedVersionsCount += stats.deletedVersions();
            }
        }

        fileUpDownloadRepository.flush();
        deleteObjectKeysAfterCommit(objectKeysToDelete);

        return new CleanupResult(freedBytes, deletedFilesCount, deletedVersionsCount);
    }

    public long calculatePersonalUsedBytes(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            return 0L;
        }
        Long fileBytes = fileUpDownloadRepository.sumStoredFileBytesByUser(userIdx, FileNodeType.FILE);
        long versionBytes = fileVersionLifecycleService.sumStoredVersionBytes(userIdx);
        return Math.max(0L, fileBytes == null ? 0L : fileBytes) + Math.max(0L, versionBytes);
    }

    public long calculateAvailableBytesForUser(Long userIdx, LocalDateTime now) {
        StoragePlanService.StorageQuota effectiveQuota = storagePlanService.resolveQuota(userIdx);
        long personalUsedBytes = calculatePersonalUsedBytes(userIdx);
        return Math.max(0L, effectiveQuota.totalQuotaBytes() - personalUsedBytes);
    }

    private StorageShareDto.CapacityShareOverviewRes buildCapacityOverview(Long userIdx, LocalDateTime now) {
        StoragePlanService.StorageQuota ownQuota = storagePlanService.resolveOwnPlanQuota(userIdx);
        StoragePlanService.StorageQuota effectiveQuota = storagePlanService.resolveQuota(userIdx);
        StoragePlanService.CapacityAdjustment adjustment = storagePlanService.resolveCapacityAdjustment(userIdx, now);

        long personalUsedBytes = calculatePersonalUsedBytes(userIdx);
        long effectiveQuotaBytes = effectiveQuota.totalQuotaBytes();
        long availableToShareBytes = Math.max(0L, effectiveQuotaBytes - personalUsedBytes);
        long excessBytes = Math.max(0L, personalUsedBytes - effectiveQuotaBytes);

        List<StorageShareDto.OutgoingGrantItem> outgoing = storageGrantRepository
                .findAllByGranter_IdxOrderByCreatedAtDesc(userIdx)
                .stream()
                .map(grant -> toOutgoingItem(grant, now))
                .toList();

        List<StorageShareDto.IncomingGrantItem> incoming = storageGrantRepository
                .findAllByRecipient_IdxOrderByCreatedAtDesc(userIdx)
                .stream()
                .map(grant -> toIncomingItem(grant, now))
                .toList();

        return StorageShareDto.CapacityShareOverviewRes.builder()
                .ownPlanQuotaBytes(ownQuota.totalQuotaBytes())
                .grantedOutBytes(adjustment.grantedOutBytes())
                .grantedInBytes(adjustment.grantedInBytes())
                .sharedStorageContributionBytes(adjustment.sharedStorageContributionBytes())
                .effectiveQuotaBytes(effectiveQuotaBytes)
                .personalUsedBytes(personalUsedBytes)
                .availableToShareBytes(availableToShareBytes)
                .excessBytes(excessBytes)
                .outgoingGrants(outgoing)
                .incomingGrants(incoming)
                .build();
    }

    private StorageShareDto.OutgoingGrantItem toOutgoingItem(StorageGrant grant, LocalDateTime now) {
        User recipient = grant.getRecipient();
        return StorageShareDto.OutgoingGrantItem.builder()
                .grantIdx(grant.getIdx())
                .recipientIdx(recipient != null ? recipient.getIdx() : null)
                .recipientName(displayName(recipient))
                .recipientEmail(recipient != null ? recipient.getEmail() : null)
                .bytes(grant.safeBytes())
                .grantType(grant.getGrantType() != null ? grant.getGrantType().name() : GrantType.RECURRING.name())
                .status(grant.getStatus() != null ? grant.getStatus().name() : GrantStatus.ACTIVE.name())
                .sourceLabel(grant.getSourceLabel())
                .startAt(grant.getStartAt())
                .endAt(grant.getEndAt())
                .nextCycleAt(resolveNextCycleAt(grant, now))
                .cancelledAt(grant.getCancelledAt())
                .createdAt(grant.getCreatedAt())
                .effectiveNow(grant.isEffectiveAt(now))
                .build();
    }

    private StorageShareDto.IncomingGrantItem toIncomingItem(StorageGrant grant, LocalDateTime now) {
        User granter = grant.getGranter();
        return StorageShareDto.IncomingGrantItem.builder()
                .grantIdx(grant.getIdx())
                .granterIdx(granter != null ? granter.getIdx() : null)
                .granterName(displayName(granter))
                .granterEmail(granter != null ? granter.getEmail() : null)
                .bytes(grant.safeBytes())
                .grantType(grant.getGrantType() != null ? grant.getGrantType().name() : GrantType.RECURRING.name())
                .status(grant.getStatus() != null ? grant.getStatus().name() : GrantStatus.ACTIVE.name())
                .sourceLabel(grant.getSourceLabel())
                .startAt(grant.getStartAt())
                .endAt(grant.getEndAt())
                .nextCycleAt(resolveNextCycleAt(grant, now))
                .cancelledAt(grant.getCancelledAt())
                .createdAt(grant.getCreatedAt())
                .effectiveNow(grant.isEffectiveAt(now))
                .build();
    }

    private LocalDateTime resolveNextCycleAt(StorageGrant grant, LocalDateTime now) {
        if (grant == null
                || grant.getGrantType() != GrantType.RECURRING
                || grant.getStatus() != GrantStatus.ACTIVE
                || grant.getStartAt() == null) {
            return null;
        }
        LocalDateTime cursor = grant.getStartAt().plusMonths(1);
        int safety = 0;
        while (!cursor.isAfter(now) && safety < 240) {
            cursor = cursor.plusMonths(1);
            safety++;
        }
        return cursor;
    }

    private void sendAdvanceExpiryNoticeIfNeeded(StorageGrant grant, LocalDateTime now) {
        if (grant.getEndAt() == null || grant.getRecipient() == null || grant.getRecipient().getIdx() == null) {
            return;
        }
        long hoursLeft = Duration.between(now, grant.getEndAt()).toHours();
        long daysLeft = (hoursLeft + 23L) / 24L;
        int prevNotified = grant.getNotifiedDaysBefore() == null ? 0 : grant.getNotifiedDaysBefore();

        int triggerDay = 0;
        if (daysLeft <= 1 && (prevNotified == 0 || prevNotified > 1)) {
            triggerDay = 1;
        } else if (daysLeft <= 7 && (prevNotified == 0 || prevNotified > 7)) {
            triggerDay = 7;
        } else if (daysLeft <= 30 && prevNotified == 0) {
            triggerDay = 30;
        }

        if (triggerDay > 0) {
            grant.markNotified(triggerDay);
            storageGrantRepository.save(grant);
            notificationService.sendGeneralNotification(
                    grant.getRecipient().getIdx(),
                    "공유 저장 용량 만료 예정 안내 (D-" + triggerDay + ")",
                    formatBytes(grant.safeBytes()) + " 공유 용량이 " + formatDateTime(grant.getEndAt())
                            + "에 만료됩니다. 만료 시 유효 할당량을 초과한 데이터는 휴지통 → 이전 버전 → 오래된 파일 순으로 자동 정리됩니다."
            );
        }
    }

    private DeletedFileStats deleteSingleFileWithVersionsAndShares(FileInfo file, List<String> objectKeysToDelete) {
        long freedBytes = file.getFileSize() != null && file.getFileSize() > 0L ? file.getFileSize() : 0L;
        if (file.getFileSavePath() != null && !file.getFileSavePath().isBlank()) {
            objectKeysToDelete.add(file.getFileSavePath().trim());
        }

        List<FileVersion> versions = fileVersionRepository.findAllByFile_IdxIn(List.of(file.getIdx()));
        int versionCount = versions.size();
        for (FileVersion version : versions) {
            if (version.getFileSize() != null && version.getFileSize() > 0L) {
                freedBytes += version.getFileSize();
            }
            if (version.getFileSavePath() != null && !version.getFileSavePath().isBlank()) {
                objectKeysToDelete.add(version.getFileSavePath().trim());
            }
        }
        if (!versions.isEmpty()) {
            fileVersionRepository.deleteAll(versions);
        }

        if (fileDownloadShareLinkRepository != null && file.getIdx() != null) {
            fileDownloadShareLinkRepository.deleteAllByFile_Idx(file.getIdx());
        }

        List<FileShare> shares = shareRepository.findAllByFile_Idx(file.getIdx());
        if (!shares.isEmpty()) {
            shareRepository.deleteAll(shares);
        }

        fileUpDownloadRepository.delete(file);
        return new DeletedFileStats(freedBytes, versionCount);
    }

    private Comparator<FileInfo> oldestFileComparator() {
        return Comparator
                .comparing(FileInfo::getLastModifyDate, Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(FileInfo::getUploadDate, Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(FileInfo::getIdx, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private void deleteObjectKeysAfterCommit(List<String> objectKeys) {
        if (objectKeys == null || objectKeys.isEmpty()) {
            return;
        }
        List<String> copy = List.copyOf(objectKeys);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    uploadObjectStorageService.deleteObjectKeys(copy);
                }
            });
        } else {
            uploadObjectStorageService.deleteObjectKeys(copy);
        }
    }

    public Map<Long, ResolvedRecipient> resolveRecipients(
            User actor,
            List<Long> userIds,
            List<Long> groupIds,
            List<String> emails
    ) {
        Long actorIdx = actor.getIdx();
        Map<Long, ResolvedRecipient> recipients = new LinkedHashMap<>();

        if (userIds != null) {
            for (Long targetUserId : userIds) {
                if (targetUserId == null || targetUserId <= 0L) {
                    continue;
                }
                if (Objects.equals(targetUserId, actorIdx)) {
                    throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_SELF_NOT_ALLOWED);
                }
                User target = userRepository.findById(targetUserId)
                        .orElseThrow(() -> BaseException.from(BaseResponseStatus.USER_NOT_FOUND));
                recipients.putIfAbsent(target.getIdx(), new ResolvedRecipient(target, "user"));
            }
        }

        if (groupIds != null) {
            for (Long groupId : groupIds) {
                if (groupId == null || groupId <= 0L) {
                    continue;
                }
                RelationshipGroup group = relationshipGroupRepository.findByIdAndUser_Idx(groupId, actorIdx)
                        .orElseThrow(() -> BaseException.from(BaseResponseStatus.GROUP_NOT_FOUND));
                List<RelationshipGroupMapping> mappings = relationshipGroupMappingRepository.findAllByGroup_Id(group.getId());
                for (RelationshipGroupMapping mapping : mappings) {
                    Relationship rel = mapping.getRelationship();
                    if (rel != null
                            && rel.getStatus() == RelationshipStatus.ACTIVE
                            && rel.getTargetUser() != null
                            && !Objects.equals(rel.getTargetUser().getIdx(), actorIdx)) {
                        recipients.putIfAbsent(
                                rel.getTargetUser().getIdx(),
                                new ResolvedRecipient(rel.getTargetUser(), "group:" + group.getName())
                        );
                    }
                }
            }
        }

        if (emails != null) {
            for (String rawEmail : emails) {
                if (rawEmail == null || rawEmail.isBlank()) {
                    continue;
                }
                String email = rawEmail.trim();
                if (actor.getEmail() != null && actor.getEmail().equalsIgnoreCase(email)) {
                    throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_SELF_NOT_ALLOWED);
                }
                User target = userRepository.findByEmail(email)
                        .orElseThrow(() -> BaseException.from(BaseResponseStatus.USER_NOT_REGISTERED));
                recipients.putIfAbsent(target.getIdx(), new ResolvedRecipient(target, "email"));
            }
        }

        return recipients;
    }

    private GrantType parseGrantType(String raw) {
        if (raw == null || raw.isBlank()) {
            return GrantType.RECURRING;
        }
        String normalized = raw.trim().toUpperCase(Locale.ROOT);
        if ("FIXED".equals(normalized) || "RENTAL".equals(normalized) || "DAILY".equals(normalized)) {
            return GrantType.FIXED;
        }
        return GrantType.RECURRING;
    }

    private User requireUser(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            throw BaseException.from(BaseResponseStatus.USER_NOT_FOUND);
        }
        return userRepository.findById(userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.USER_NOT_FOUND));
    }

    private String displayName(User user) {
        if (user == null) {
            return "알 수 없음";
        }
        if (user.getName() != null && !user.getName().isBlank()) {
            return user.getName();
        }
        return user.getEmail() != null ? user.getEmail() : "사용자 #" + user.getIdx();
    }

    private String formatBytes(long bytes) {
        if (bytes <= 0L) {
            return "0 B";
        }
        if (bytes % StoragePlanService.TERABYTE == 0L) {
            return (bytes / StoragePlanService.TERABYTE) + " TB";
        }
        if (bytes % StoragePlanService.GIGABYTE == 0L) {
            return (bytes / StoragePlanService.GIGABYTE) + " GB";
        }
        double gb = bytes / (double) StoragePlanService.GIGABYTE;
        if (gb >= 1.0) {
            return String.format(Locale.ROOT, "%.2f GB", gb);
        }
        double mb = bytes / (1024.0 * 1024.0);
        return String.format(Locale.ROOT, "%.1f MB", mb);
    }

    private String formatDateTime(LocalDateTime dateTime) {
        return dateTime == null ? "-" : DATE_FORMATTER.format(dateTime);
    }

    public record ResolvedRecipient(User user, String sourceLabel) {
    }

    public record CleanupResult(long deletedBytes, int deletedFiles, int deletedVersions) {
    }

    private record DeletedFileStats(long freedBytes, int deletedVersions) {
    }
}
