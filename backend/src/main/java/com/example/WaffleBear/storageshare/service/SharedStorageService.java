package com.example.WaffleBear.storageshare.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.upload.UploadObjectStorageService;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.storageshare.model.SharedStorage;
import com.example.WaffleBear.storageshare.model.SharedStorageApproval;
import com.example.WaffleBear.storageshare.model.SharedStorageApprovalVote;
import com.example.WaffleBear.storageshare.model.SharedStorageMember;
import com.example.WaffleBear.storageshare.model.SharedStorageNode;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.ApprovalStatus;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.ApprovalType;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.MemberRole;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.MemberStatus;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.NodeType;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.SharedStorageStatus;
import com.example.WaffleBear.storageshare.model.dto.StorageShareDto;
import com.example.WaffleBear.storageshare.repository.SharedStorageApprovalRepository;
import com.example.WaffleBear.storageshare.repository.SharedStorageApprovalVoteRepository;
import com.example.WaffleBear.storageshare.repository.SharedStorageMemberRepository;
import com.example.WaffleBear.storageshare.repository.SharedStorageNodeRepository;
import com.example.WaffleBear.storageshare.repository.SharedStorageRepository;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SharedStorageService {

    private static final int APPROVAL_EXPIRY_DAYS = 7;
    private static final int TRASH_RETENTION_DAYS = 30;
    private static final long PARTITION_SIZE_BYTES = 100L * 1024 * 1024;
    private static final long CHUNK_SIZE_BYTES = 80L * 1024 * 1024;
    private static final long MIN_FINAL_PARTITION_SIZE_BYTES = 10L * 1024 * 1024;

    private final SharedStorageRepository sharedStorageRepository;
    private final SharedStorageMemberRepository sharedStorageMemberRepository;
    private final SharedStorageNodeRepository sharedStorageNodeRepository;
    private final SharedStorageApprovalRepository sharedStorageApprovalRepository;
    private final SharedStorageApprovalVoteRepository sharedStorageApprovalVoteRepository;
    private final StorageGrantService storageGrantService;
    private final StoragePlanService storagePlanService;
    private final UploadObjectStorageService uploadObjectStorageService;
    private final MinioPresignedUrlService minioPresignedUrlService;
    private final MinioProperties minioProperties;
    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    public static String buildDriveFolderSaveNamePrefix(Long storageIdx) {
        return "shared-storage-" + storageIdx + "-";
    }

    public static Long extractSharedStorageIdxFromSaveName(String fileSaveName) {
        if (fileSaveName == null || !fileSaveName.startsWith("shared-storage-")) {
            return null;
        }
        int start = "shared-storage-".length();
        int end = fileSaveName.indexOf('-', start);
        String raw = end > start ? fileSaveName.substring(start, end) : fileSaveName.substring(start);
        try {
            long parsed = Long.parseLong(raw.trim());
            return parsed > 0L ? parsed : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    @Transactional
    public void syncActiveSharedStorageDriveFoldersForUser(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            return;
        }
        User user = userRepository.findById(userIdx).orElse(null);
        if (user == null) {
            return;
        }
        List<SharedStorageMember> memberships = sharedStorageMemberRepository.findAllByUser_IdxOrderByCreatedAtDesc(userIdx);
        for (SharedStorageMember membership : memberships) {
            if (membership == null || !membership.isActive() || membership.getStorage() == null || !membership.getStorage().isActive()) {
                continue;
            }
            ensureDriveFolderForMember(membership.getStorage(), user, null);
        }
    }

    private FileInfo ensureDriveFolderForMember(SharedStorage storage, User memberUser, Long preferredParentFolderId) {
        if (storage == null || storage.getIdx() == null || memberUser == null || memberUser.getIdx() == null) {
            return null;
        }
        String prefix = buildDriveFolderSaveNamePrefix(storage.getIdx());
        FileInfo existing = fileUpDownloadRepository
                .findFirstByUser_IdxAndFileSaveNameStartingWithOrderByIdxAsc(memberUser.getIdx(), prefix)
                .orElse(null);
        if (existing != null) {
            boolean dirty = false;
            if (!existing.isSharedFile()) {
                existing.changeSharedFile(true);
                dirty = true;
            }
            if (!storage.isActive() && !existing.isTrashed()) {
                existing.markTrashed(storage.getTrashedAt() != null ? storage.getTrashedAt() : LocalDateTime.now());
                dirty = true;
            }
            if (dirty) {
                return fileUpDownloadRepository.saveAndFlush(existing);
            }
            return existing;
        }

        FileInfo parentFolder = resolveDriveParentFolder(memberUser.getIdx(), preferredParentFolderId);
        FileInfo created = FileInfo.builder()
                .user(memberUser)
                .parent(parentFolder)
                .nodeType(FileNodeType.FOLDER)
                .fileOriginName(storage.getName())
                .fileFormat("folder")
                .fileSaveName(prefix + UUID.randomUUID())
                .fileSavePath(null)
                .fileSize(0L)
                .lockedFile(false)
                .sharedFile(true)
                .trashed(!storage.isActive())
                .deletedAt(storage.isActive() ? null : storage.getTrashedAt())
                .build();
        return fileUpDownloadRepository.saveAndFlush(created);
    }

    private boolean isActiveMember(Long storageIdx, Long userIdx) {
        if (storageIdx == null || storageIdx <= 0L || userIdx == null || userIdx <= 0L) {
            return false;
        }
        return sharedStorageMemberRepository.findByStorage_IdxAndUser_Idx(storageIdx, userIdx)
                .map(SharedStorageMember::isActive)
                .orElse(false);
    }

    @Transactional
    public boolean handleDriveFolderMoveToTrash(Long userIdx, Long storageIdx, LocalDateTime deletedAt) {
        if (storageIdx == null || storageIdx <= 0L || !isActiveMember(storageIdx, userIdx)) {
            return true;
        }
        SharedStorage storage = sharedStorageRepository.findById(storageIdx).orElse(null);
        if (storage == null || !storage.isActive()) {
            return true;
        }
        LocalDateTime now = deletedAt != null ? deletedAt : LocalDateTime.now();
        List<SharedStorageMember> activeMembers = sharedStorageMemberRepository
                .findAllByStorage_IdxAndStatus(storageIdx, MemberStatus.ACTIVE);

        if (activeMembers.size() <= 1) {
            storage.moveToTrash(now, TRASH_RETENTION_DAYS);
            sharedStorageRepository.saveAndFlush(storage);
            List<FileInfo> linkedFolders = fileUpDownloadRepository
                    .findAllByFileSaveNameStartingWith(buildDriveFolderSaveNamePrefix(storageIdx));
            for (FileInfo folder : linkedFolders) {
                if (!folder.isTrashed()) {
                    folder.markTrashed(now);
                }
            }
            if (!linkedFolders.isEmpty()) {
                fileUpDownloadRepository.saveAll(linkedFolders);
            }
            return true;
        }

        User requester = userRepository.findById(userIdx).orElse(null);
        if (requester == null) {
            return false;
        }
        List<SharedStorageApproval> pendingApprovals = sharedStorageApprovalRepository
                .findAllByStorage_IdxAndStatus(storageIdx, ApprovalStatus.PENDING);
        SharedStorageApproval deleteApproval = pendingApprovals.stream()
                .filter(existing -> existing.getApprovalType() == ApprovalType.DELETE_STORAGE)
                .findFirst()
                .orElse(null);

        if (deleteApproval == null) {
            String targetLabel = "공유 저장소 [" + storage.getName() + "] 전체 삭제";
            deleteApproval = sharedStorageApprovalRepository.save(SharedStorageApproval.builder()
                    .storage(storage)
                    .approvalType(ApprovalType.DELETE_STORAGE)
                    .status(ApprovalStatus.PENDING)
                    .requester(requester)
                    .targetLabel(targetLabel)
                    .reason("드라이브에서 공유 폴더 삭제 요청")
                    .createdAt(now)
                    .expiresAt(now.plusDays(APPROVAL_EXPIRY_DAYS))
                    .build());

            for (SharedStorageMember member : activeMembers) {
                if (member.getUser() != null && !Objects.equals(member.getUser().getIdx(), userIdx)) {
                    notificationService.sendGeneralNotification(
                            member.getUser().getIdx(),
                            "공유 저장소 삭제 승인 요청",
                            displayName(requester) + "님이 [" + storage.getName() + "] 공유 폴더 삭제를 요청했습니다. (전원 승인 시 삭제)"
                    );
                }
            }
        }

        SharedStorageApprovalVote existingVote = sharedStorageApprovalVoteRepository
                .findByApproval_IdxAndVoter_Idx(deleteApproval.getIdx(), userIdx)
                .orElse(null);
        if (existingVote == null) {
            sharedStorageApprovalVoteRepository.saveAndFlush(SharedStorageApprovalVote.builder()
                    .approval(deleteApproval)
                    .voter(requester)
                    .approved(true)
                    .votedAt(now)
                    .build());
        }

        evaluateAndExecuteApprovalIfComplete(storage, deleteApproval, activeMembers, now);
        return !storage.isActive();
    }

    @Transactional
    public void handleDriveFolderRestore(Long userIdx, Long storageIdx) {
        if (storageIdx == null || storageIdx <= 0L || !isActiveMember(storageIdx, userIdx)) {
            return;
        }
        SharedStorage storage = sharedStorageRepository.findById(storageIdx).orElse(null);
        if (storage == null || storage.getStatus() != SharedStorageStatus.TRASHED) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        List<SharedStorageMember> activeMembers = sharedStorageMemberRepository
                .findAllByStorage_IdxAndStatus(storageIdx, MemberStatus.ACTIVE);
        for (SharedStorageMember member : activeMembers) {
            long contribution = member.safeContributionBytes();
            if (contribution > 0L && member.getUser() != null) {
                long available = storageGrantService.calculateAvailableBytesForUser(member.getUser().getIdx(), now);
                if (available < contribution) {
                    throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_INSUFFICIENT_CAPACITY);
                }
            }
        }
        storage.restore();
        sharedStorageRepository.saveAndFlush(storage);
        List<FileInfo> linkedFolders = fileUpDownloadRepository
                .findAllByFileSaveNameStartingWith(buildDriveFolderSaveNamePrefix(storageIdx));
        for (FileInfo folder : linkedFolders) {
            if (folder.isTrashed()) {
                folder.restore();
            }
        }
        if (!linkedFolders.isEmpty()) {
            fileUpDownloadRepository.saveAll(linkedFolders);
        }
    }

    @Transactional
    public void handleDriveFolderPermanentDelete(Long userIdx, Long storageIdx) {
        if (storageIdx == null || storageIdx <= 0L || !isActiveMember(storageIdx, userIdx)) {
            return;
        }
        SharedStorage storage = sharedStorageRepository.findById(storageIdx).orElse(null);
        if (storage == null) {
            return;
        }
        List<SharedStorageMember> activeMembers = sharedStorageMemberRepository
                .findAllByStorage_IdxAndStatus(storageIdx, MemberStatus.ACTIVE);
        if (!storage.isActive() || activeMembers.size() <= 1) {
            List<SharedStorageNode> allNodes = sharedStorageNodeRepository
                    .findAllByStorage_IdxOrderByNodeTypeDescNameAsc(storageIdx);
            List<String> objectKeys = allNodes.stream()
                    .map(SharedStorageNode::getObjectKey)
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(key -> !key.isBlank())
                    .toList();

            sharedStorageApprovalVoteRepository.deleteAllByApproval_Storage_Idx(storageIdx);
            sharedStorageApprovalRepository.deleteAllByStorage_Idx(storageIdx);
            for (SharedStorageNode node : allNodes) {
                if (node.getParent() != null) {
                    sharedStorageNodeRepository.delete(node);
                }
            }
            sharedStorageNodeRepository.deleteAllByStorage_Idx(storageIdx);
            sharedStorageMemberRepository.deleteAllByStorage_Idx(storageIdx);
            sharedStorageRepository.delete(storage);
            sharedStorageRepository.flush();
            deleteObjectKeysAfterCommit(objectKeys);
        }
    }

    @Transactional
    public void handleDriveFolderRename(Long userIdx, Long storageIdx, String newName) {
        if (storageIdx == null || storageIdx <= 0L || newName == null || newName.isBlank()
                || !isActiveMember(storageIdx, userIdx)) {
            return;
        }
        SharedStorage storage = sharedStorageRepository.findById(storageIdx).orElse(null);
        if (storage == null) {
            return;
        }
        storage.rename(newName);
        sharedStorageRepository.saveAndFlush(storage);
        List<FileInfo> linkedFolders = fileUpDownloadRepository
                .findAllByFileSaveNameStartingWith(buildDriveFolderSaveNamePrefix(storageIdx));
        for (FileInfo folder : linkedFolders) {
            folder.rename(newName);
        }
        if (!linkedFolders.isEmpty()) {
            fileUpDownloadRepository.saveAll(linkedFolders);
        }
    }

    private FileInfo resolveDriveParentFolder(Long userIdx, Long parentFolderId) {
        if (userIdx == null || parentFolderId == null || parentFolderId <= 0L) {
            return null;
        }
        FileInfo parent = fileUpDownloadRepository.findByIdxAndUser_Idx(parentFolderId, userIdx).orElse(null);
        if (parent == null || parent.isTrashed()) {
            return null;
        }
        FileNodeType nodeType = parent.getNodeType() == null ? FileNodeType.FILE : parent.getNodeType();
        return nodeType == FileNodeType.FOLDER ? parent : null;
    }

    @Transactional
    public List<StorageShareDto.SharedStorageSummaryRes> listMySharedStorages(Long userIdx) {
        requireUser(userIdx);
        LocalDateTime now = LocalDateTime.now();
        processExpiredApprovalsAndTrashedStorages(now);

        List<SharedStorageMember> memberships = sharedStorageMemberRepository.findAllByUser_IdxOrderByCreatedAtDesc(userIdx);
        List<StorageShareDto.SharedStorageSummaryRes> result = new ArrayList<>();

        for (SharedStorageMember membership : memberships) {
            if (membership == null || membership.getStatus() == MemberStatus.DECLINED || membership.getStorage() == null) {
                continue;
            }
            if (membership.isActive() && membership.getStorage().isActive() && membership.getUser() != null) {
                ensureDriveFolderForMember(membership.getStorage(), membership.getUser(), null);
            }
            result.add(buildStorageSummary(membership.getStorage(), membership));
        }

        return result;
    }

    @Transactional
    public StorageShareDto.SharedStorageSummaryRes createSharedStorage(
            Long userIdx,
            StorageShareDto.CreateSharedStorageReq request
    ) {
        User creator = requireUser(userIdx);
        String name = normalizeStorageName(request != null ? request.name() : null);
        String description = request != null && request.description() != null ? request.description().trim() : "";
        long ownerContributionBytes = request != null && request.ownerContributionBytes() != null
                ? Math.max(0L, request.ownerContributionBytes())
                : 0L;
        long proposedContributionBytes = request != null && request.proposedContributionBytes() != null
                ? Math.max(0L, request.proposedContributionBytes())
                : 0L;

        LocalDateTime now = LocalDateTime.now();
        if (ownerContributionBytes > 0L) {
            long availableBytes = storageGrantService.calculateAvailableBytesForUser(userIdx, now);
            if (availableBytes < ownerContributionBytes) {
                throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_INSUFFICIENT_CAPACITY);
            }
        }

        SharedStorage storage = SharedStorage.builder()
                .name(name)
                .description(description)
                .creator(creator)
                .status(SharedStorageStatus.ACTIVE)
                .createdAt(now)
                .build();
        SharedStorage savedStorage = sharedStorageRepository.save(storage);

        SharedStorageMember ownerMember = SharedStorageMember.builder()
                .storage(savedStorage)
                .user(creator)
                .role(MemberRole.OWNER)
                .status(MemberStatus.ACTIVE)
                .contributionBytes(ownerContributionBytes)
                .proposedContributionBytes(ownerContributionBytes)
                .invitedByIdx(userIdx)
                .createdAt(now)
                .joinedAt(now)
                .build();
        sharedStorageMemberRepository.save(ownerMember);

        Map<Long, StorageGrantService.ResolvedRecipient> invitees = storageGrantService.resolveRecipients(
                creator,
                request != null ? request.userIds() : null,
                request != null ? request.groupIds() : null,
                request != null ? request.emails() : null
        );

        for (StorageGrantService.ResolvedRecipient invitee : invitees.values()) {
            SharedStorageMember invitedMember = SharedStorageMember.builder()
                    .storage(savedStorage)
                    .user(invitee.user())
                    .role(MemberRole.MEMBER)
                    .status(MemberStatus.INVITED)
                    .contributionBytes(0L)
                    .proposedContributionBytes(proposedContributionBytes)
                    .invitedByIdx(userIdx)
                    .createdAt(now)
                    .build();
            sharedStorageMemberRepository.save(invitedMember);

            notificationService.sendGeneralNotification(
                    invitee.user().getIdx(),
                    "공유 저장소 초대 도착",
                    displayName(creator) + "님이 [" + savedStorage.getName() + "] 공유 저장소에 초대했습니다."
            );
        }

        sharedStorageMemberRepository.flush();
        ensureDriveFolderForMember(
                savedStorage,
                creator,
                request != null ? request.parentFolderId() : null
        );
        return buildStorageSummary(savedStorage, ownerMember);
    }

    @Transactional
    public StorageShareDto.SharedStorageDetailRes getSharedStorageDetail(
            Long userIdx,
            Long storageIdx,
            Long parentIdx
    ) {
        requireUser(userIdx);
        LocalDateTime now = LocalDateTime.now();
        processExpiredApprovalsAndTrashedStorages(now);

        SharedStorage storage = getStorage(storageIdx);
        SharedStorageMember membership = sharedStorageMemberRepository.findByStorage_IdxAndUser_Idx(storageIdx, userIdx)
                .filter(member -> member.getStatus() != MemberStatus.DECLINED)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.SHARED_STORAGE_ACCESS_DENIED));

        StorageShareDto.SharedStorageSummaryRes summary = buildStorageSummary(storage, membership);
        List<SharedStorageMember> allMembers = sharedStorageMemberRepository.findAllByStorage_IdxOrderByCreatedAtAsc(storageIdx);
        List<StorageShareDto.MemberRes> memberDtos = allMembers.stream()
                .filter(member -> member.getStatus() != MemberStatus.DECLINED)
                .map(this::toMemberRes)
                .toList();

        if (!membership.isActive()) {
            return StorageShareDto.SharedStorageDetailRes.builder()
                    .summary(summary)
                    .currentParentIdx(null)
                    .breadcrumbs(List.of())
                    .nodes(List.of())
                    .members(memberDtos)
                    .approvals(List.of())
                    .build();
        }

        List<SharedStorageNode> allNodes = sharedStorageNodeRepository.findAllByStorage_IdxOrderByNodeTypeDescNameAsc(storageIdx);
        Map<Long, SharedStorageNode> nodeById = new LinkedHashMap<>();
        for (SharedStorageNode node : allNodes) {
            nodeById.put(node.getIdx(), node);
        }

        Long normalizedParentIdx = null;
        if (parentIdx != null && parentIdx > 0L) {
            SharedStorageNode parentNode = nodeById.get(parentIdx);
            if (parentNode == null || !parentNode.isFolder()) {
                throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_NODE_NOT_FOUND);
            }
            normalizedParentIdx = parentNode.getIdx();
        }

        List<StorageShareDto.NodeRes> breadcrumbs = buildBreadcrumbs(normalizedParentIdx, nodeById);
        final Long targetParentIdx = normalizedParentIdx;
        List<StorageShareDto.NodeRes> currentNodes = allNodes.stream()
                .filter(node -> {
                    Long nodeParentId = node.getParent() != null ? node.getParent().getIdx() : null;
                    return Objects.equals(nodeParentId, targetParentIdx);
                })
                .sorted(Comparator
                        .comparing((SharedStorageNode node) -> !node.isFolder())
                        .thenComparing(SharedStorageNode::getName, String.CASE_INSENSITIVE_ORDER))
                .map(this::toNodeRes)
                .toList();

        List<StorageShareDto.ApprovalRes> approvalDtos = buildApprovalResponses(storageIdx, userIdx, allMembers);

        return StorageShareDto.SharedStorageDetailRes.builder()
                .summary(summary)
                .currentParentIdx(normalizedParentIdx)
                .breadcrumbs(breadcrumbs)
                .nodes(currentNodes)
                .members(memberDtos)
                .approvals(approvalDtos)
                .build();
    }

    @Transactional
    public StorageShareDto.SharedStorageDetailRes inviteMembers(
            Long userIdx,
            Long storageIdx,
            StorageShareDto.InviteMembersReq request
    ) {
        User actor = requireUser(userIdx);
        SharedStorage storage = requireActiveStorage(storageIdx);
        requireActiveMembership(storageIdx, userIdx);

        long proposedBytes = request != null && request.proposedContributionBytes() != null
                ? Math.max(0L, request.proposedContributionBytes())
                : 0L;

        Map<Long, StorageGrantService.ResolvedRecipient> invitees = storageGrantService.resolveRecipients(
                actor,
                request != null ? request.userIds() : null,
                request != null ? request.groupIds() : null,
                request != null ? request.emails() : null
        );
        if (invitees.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_NO_RECIPIENT);
        }

        for (StorageGrantService.ResolvedRecipient invitee : invitees.values()) {
            SharedStorageMember existing = sharedStorageMemberRepository
                    .findByStorage_IdxAndUser_Idx(storageIdx, invitee.user().getIdx())
                    .orElse(null);

            if (existing != null) {
                if (existing.isActive() || existing.getStatus() == MemberStatus.INVITED) {
                    continue;
                }
                existing.reinvite(userIdx, proposedBytes);
                sharedStorageMemberRepository.save(existing);
            } else {
                SharedStorageMember created = SharedStorageMember.builder()
                        .storage(storage)
                        .user(invitee.user())
                        .role(MemberRole.MEMBER)
                        .status(MemberStatus.INVITED)
                        .contributionBytes(0L)
                        .proposedContributionBytes(proposedBytes)
                        .invitedByIdx(userIdx)
                        .build();
                sharedStorageMemberRepository.save(created);
            }

            notificationService.sendGeneralNotification(
                    invitee.user().getIdx(),
                    "공유 저장소 초대 도착",
                    displayName(actor) + "님이 [" + storage.getName() + "] 공유 저장소에 초대했습니다."
            );
        }

        sharedStorageMemberRepository.flush();
        return getSharedStorageDetail(userIdx, storageIdx, null);
    }

    @Transactional
    public StorageShareDto.SharedStorageSummaryRes respondToInvite(
            Long userIdx,
            Long storageIdx,
            StorageShareDto.RespondInviteReq request
    ) {
        requireUser(userIdx);
        SharedStorage storage = requireActiveStorage(storageIdx);
        SharedStorageMember membership = sharedStorageMemberRepository.findByStorage_IdxAndUser_Idx(storageIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.SHARED_STORAGE_INVITE_NOT_FOUND));

        if (membership.getStatus() != MemberStatus.INVITED) {
            return buildStorageSummary(storage, membership);
        }

        boolean accept = request != null && request.accept();
        if (!accept) {
            membership.decline();
            sharedStorageMemberRepository.saveAndFlush(membership);
            return buildStorageSummary(storage, membership);
        }

        long contributionBytes = request.contributionBytes() != null
                ? Math.max(0L, request.contributionBytes())
                : (membership.getProposedContributionBytes() != null ? Math.max(0L, membership.getProposedContributionBytes()) : 0L);

        LocalDateTime now = LocalDateTime.now();
        if (contributionBytes > 0L) {
            long availableBytes = storageGrantService.calculateAvailableBytesForUser(userIdx, now);
            if (availableBytes < contributionBytes) {
                throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_INSUFFICIENT_CAPACITY);
            }
        }

        membership.accept(contributionBytes, now);
        sharedStorageMemberRepository.saveAndFlush(membership);
        if (membership.getUser() != null) {
            ensureDriveFolderForMember(storage, membership.getUser(), null);
        }
        return buildStorageSummary(storage, membership);
    }

    @Transactional
    public StorageShareDto.SharedStorageDetailRes updateMyContribution(
            Long userIdx,
            Long storageIdx,
            StorageShareDto.UpdateContributionReq request
    ) {
        requireUser(userIdx);
        SharedStorage storage = requireActiveStorage(storageIdx);
        SharedStorageMember membership = requireActiveMembership(storageIdx, userIdx);

        long nextContribution = request != null && request.contributionBytes() != null
                ? Math.max(0L, request.contributionBytes())
                : 0L;
        long currentContribution = membership.safeContributionBytes();
        long delta = nextContribution - currentContribution;

        LocalDateTime now = LocalDateTime.now();
        if (delta > 0L) {
            long availableBytes = storageGrantService.calculateAvailableBytesForUser(userIdx, now);
            if (availableBytes < delta) {
                throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_INSUFFICIENT_CAPACITY);
            }
        } else if (delta < 0L) {
            long currentTotalCapacity = sumActiveMemberContributions(storageIdx);
            long usedBytes = sumStorageUsedBytes(storageIdx);
            long nextTotalCapacity = Math.max(0L, currentTotalCapacity + delta);
            if (nextTotalCapacity < usedBytes) {
                throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_CONTRIBUTION_TOO_SMALL);
            }
        }

        membership.changeContribution(nextContribution);
        sharedStorageMemberRepository.saveAndFlush(membership);
        return getSharedStorageDetail(userIdx, storage.getIdx(), null);
    }

    @Transactional
    public StorageShareDto.NodeRes createFolder(
            Long userIdx,
            Long storageIdx,
            StorageShareDto.CreateFolderReq request
    ) {
        User actor = requireUser(userIdx);
        SharedStorage storage = requireActiveStorage(storageIdx);
        requireActiveMembership(storageIdx, userIdx);

        String folderName = normalizeNodeName(request != null ? request.folderName() : null);
        SharedStorageNode parent = resolveParentFolder(storageIdx, request != null ? request.parentIdx() : null);

        List<SharedStorageNode> allNodes = sharedStorageNodeRepository.findAllByStorage_IdxOrderByNodeTypeDescNameAsc(storageIdx);
        Long parentId = parent != null ? parent.getIdx() : null;
        boolean exists = allNodes.stream().anyMatch(node ->
                node.isFolder()
                        && Objects.equals(node.getParent() != null ? node.getParent().getIdx() : null, parentId)
                        && node.getName().equalsIgnoreCase(folderName)
        );
        if (exists) {
            throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_FOLDER_DUPLICATED);
        }

        SharedStorageNode created = SharedStorageNode.builder()
                .storage(storage)
                .parent(parent)
                .nodeType(NodeType.FOLDER)
                .name(folderName)
                .fileFormat("folder")
                .fileSize(0L)
                .uploader(actor)
                .build();
        SharedStorageNode saved = sharedStorageNodeRepository.saveAndFlush(created);
        return toNodeRes(saved);
    }

    @Transactional
    public List<StorageShareDto.InitUploadChunkRes> initUpload(
            Long userIdx,
            Long storageIdx,
            List<StorageShareDto.InitUploadItemReq> requests
    ) {
        User actor = requireUser(userIdx);
        SharedStorage storage = requireActiveStorage(storageIdx);
        requireActiveMembership(storageIdx, userIdx);

        if (requests == null || requests.isEmpty()) {
            throw BaseException.from(BaseResponseStatus.FILE_EMPTY);
        }

        StoragePlanService.StorageQuota actorQuota = storagePlanService.resolveQuota(userIdx);
        if (requests.size() > actorQuota.maxUploadCount()) {
            throw BaseException.from(BaseResponseStatus.FILE_COUNT_WRONG);
        }

        long totalRequestedBytes = 0L;
        for (StorageShareDto.InitUploadItemReq req : requests) {
            if (req == null || req.fileOriginName() == null || req.fileOriginName().isBlank()) {
                throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
            }
            long fileSize = req.fileSize() != null ? Math.max(0L, req.fileSize()) : 0L;
            if (fileSize <= 0L || fileSize > actorQuota.maxUploadFileBytes()) {
                throw BaseException.from(BaseResponseStatus.FILE_SIZE_WRONG);
            }
            totalRequestedBytes += fileSize;
        }

        long totalCapacityBytes = sumActiveMemberContributions(storageIdx);
        long usedBytes = sumStorageUsedBytes(storageIdx);
        if (usedBytes + totalRequestedBytes > totalCapacityBytes) {
            throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_CAPACITY_EXCEEDED);
        }

        List<StorageShareDto.InitUploadChunkRes> responses = new ArrayList<>();
        for (StorageShareDto.InitUploadItemReq req : requests) {
            SharedStorageNode targetParent = ensureRelativeFolderHierarchy(
                    storage,
                    actor,
                    req.parentIdx(),
                    req.relativePath(),
                    req.fileOriginName()
            );
            Long resolvedParentIdx = targetParent != null ? targetParent.getIdx() : null;
            String originName = req.fileOriginName().trim();
            String format = normalizeFormat(req.fileFormat(), originName);
            long fileSize = Math.max(0L, req.fileSize());
            String finalObjectKey = buildSharedStorageObjectKey(storageIdx, userIdx, originName);

            List<Long> chunkSizes = calculateChunkSizes(fileSize);
            int totalChunks = chunkSizes.size();
            boolean multipart = totalChunks > 1;
            int expirySeconds = uploadObjectStorageService.getPresignedUrlExpirySeconds();

            for (int index = 0; index < totalChunks; index++) {
                String uploadObjectKey = multipart
                        ? finalObjectKey + ".part." + index
                        : finalObjectKey;
                String uploadUrl = uploadObjectStorageService.generatePresignedUploadUrl(uploadObjectKey);
                responses.add(StorageShareDto.InitUploadChunkRes.builder()
                        .fileOriginName(originName)
                        .fileFormat(format)
                        .fileSize(fileSize)
                        .chunkIndex(index)
                        .totalChunks(totalChunks)
                        .chunkSize(chunkSizes.get(index))
                        .uploadObjectKey(uploadObjectKey)
                        .finalObjectKey(finalObjectKey)
                        .uploadUrl(uploadUrl)
                        .expiresInSeconds(expirySeconds)
                        .parentIdx(resolvedParentIdx)
                        .relativePath(req.relativePath())
                        .build());
            }
        }

        return responses;
    }

    @Transactional
    public StorageShareDto.NodeRes completeUpload(
            Long userIdx,
            Long storageIdx,
            StorageShareDto.CompleteUploadReq request
    ) {
        User actor = requireUser(userIdx);
        SharedStorage storage = requireActiveStorage(storageIdx);
        requireActiveMembership(storageIdx, userIdx);

        if (request == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        String finalObjectKey = normalizeOwnedSharedStorageFinalObjectKey(
                storageIdx,
                userIdx,
                request.finalObjectKey()
        );
        boolean alreadyBound = sharedStorageNodeRepository
                .findAllByStorage_IdxOrderByNodeTypeDescNameAsc(storageIdx)
                .stream()
                .map(SharedStorageNode::getObjectKey)
                .filter(Objects::nonNull)
                .anyMatch(existingKey -> existingKey.trim().equals(finalObjectKey));
        if (alreadyBound) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        List<String> chunkKeys = normalizeOwnedSharedStorageChunkKeys(finalObjectKey, request.chunkObjectKeys());

        if (chunkKeys.isEmpty()) {
            uploadObjectStorageService.ensureUploadedObjectExists(finalObjectKey);
        } else {
            uploadObjectStorageService.ensureAllUploaded(chunkKeys);
            if (!uploadObjectStorageService.objectExists(finalObjectKey)) {
                uploadObjectStorageService.composeFinalObject(finalObjectKey, chunkKeys);
            }
            uploadObjectStorageService.ensureUploadedObjectExists(finalObjectKey);
        }

        long expectedSize = request.fileSize() != null ? Math.max(0L, request.fileSize()) : 0L;
        long actualSize = uploadObjectStorageService.resolveCompletedObjectSize(finalObjectKey, expectedSize);

        long totalCapacityBytes = sumActiveMemberContributions(storageIdx);
        long usedBytes = sumStorageUsedBytes(storageIdx);
        if (usedBytes + actualSize > totalCapacityBytes) {
            List<String> cleanupKeys = new ArrayList<>(chunkKeys);
            cleanupKeys.add(finalObjectKey);
            uploadObjectStorageService.deleteObjectKeys(cleanupKeys);
            throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_CAPACITY_EXCEEDED);
        }

        SharedStorageNode parent = ensureRelativeFolderHierarchy(
                storage,
                actor,
                request.parentIdx(),
                request.relativePath(),
                request.fileOriginName()
        );
        String originName = normalizeNodeName(request.fileOriginName());
        String format = normalizeFormat(request.fileFormat(), originName);

        SharedStorageNode fileNode = SharedStorageNode.builder()
                .storage(storage)
                .parent(parent)
                .nodeType(NodeType.FILE)
                .name(originName)
                .fileFormat(format)
                .objectKey(finalObjectKey)
                .fileSize(actualSize)
                .uploader(actor)
                .build();
        SharedStorageNode saved = sharedStorageNodeRepository.saveAndFlush(fileNode);

        if (!chunkKeys.isEmpty()) {
            deleteObjectKeysAfterCommit(chunkKeys);
        }

        return toNodeRes(saved);
    }

    @Transactional(readOnly = true)
    public String getDownloadUrl(Long userIdx, Long storageIdx, Long nodeIdx) {
        requireUser(userIdx);
        requireActiveStorage(storageIdx);
        requireActiveMembership(storageIdx, userIdx);

        SharedStorageNode node = sharedStorageNodeRepository.findByIdxAndStorage_Idx(nodeIdx, storageIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.SHARED_STORAGE_NODE_NOT_FOUND));
        if (node.isFolder() || node.getObjectKey() == null || node.getObjectKey().isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        try {
            Map<String, String> queryParams = new HashMap<>();
            queryParams.put(
                    "response-content-disposition",
                    org.springframework.http.ContentDisposition.attachment()
                            .filename(node.getName(), java.nio.charset.StandardCharsets.UTF_8)
                            .build()
                            .toString()
            );
            queryParams.put(
                    "response-content-type",
                    com.example.WaffleBear.file.util.FileContentUtils.resolveDownloadContentType(node.getName())
            );
            return minioPresignedUrlService.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(minioProperties.getBucket_cloud())
                            .object(node.getObjectKey())
                            .expiry(minioProperties.getPresignedUrlExpirySeconds())
                            .extraQueryParams(queryParams)
                            .build()
            );
        } catch (Exception e) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    /**
     * 공유 저장소 삭제 / 파일·폴더 삭제 / 참여자 제외(탈퇴) 요청.
     * 참여 중인 활성 멤버가 1명뿐이면 즉시 처리되고, 2명 이상이면 전원 동의(7일 기한) 투표가 진행된다.
     */
    @Transactional
    public StorageShareDto.SharedStorageDetailRes requestApproval(
            Long userIdx,
            Long storageIdx,
            StorageShareDto.CreateApprovalReq request
    ) {
        User requester = requireUser(userIdx);
        SharedStorage storage = requireActiveStorage(storageIdx);
        requireActiveMembership(storageIdx, userIdx);

        ApprovalType approvalType = parseApprovalType(request != null ? request.approvalType() : null);
        Long targetNodeIdx = null;
        Long targetUserIdx = null;
        String targetLabel;

        if (approvalType == ApprovalType.DELETE_STORAGE) {
            targetLabel = "공유 저장소 [" + storage.getName() + "] 전체 삭제";
        } else if (approvalType == ApprovalType.DELETE_NODE) {
            if (request == null || request.targetNodeIdx() == null) {
                throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_NODE_NOT_FOUND);
            }
            SharedStorageNode node = sharedStorageNodeRepository
                    .findByIdxAndStorage_Idx(request.targetNodeIdx(), storageIdx)
                    .orElseThrow(() -> BaseException.from(BaseResponseStatus.SHARED_STORAGE_NODE_NOT_FOUND));
            targetNodeIdx = node.getIdx();
            targetLabel = (node.isFolder() ? "폴더" : "파일") + " [" + node.getName() + "] 삭제";
        } else {
            if (request == null || request.targetUserIdx() == null) {
                throw BaseException.from(BaseResponseStatus.USER_NOT_FOUND);
            }
            SharedStorageMember targetMember = requireActiveMembership(storageIdx, request.targetUserIdx());
            targetUserIdx = targetMember.getUser().getIdx();
            targetLabel = "참여자 [" + displayName(targetMember.getUser()) + "] 제외";
        }

        List<SharedStorageApproval> pendingApprovals = sharedStorageApprovalRepository
                .findAllByStorage_IdxAndStatus(storageIdx, ApprovalStatus.PENDING);
        final Long checkNodeIdx = targetNodeIdx;
        final Long checkUserIdx = targetUserIdx;
        boolean duplicated = pendingApprovals.stream().anyMatch(existing ->
                existing.getApprovalType() == approvalType
                        && Objects.equals(existing.getTargetNodeIdx(), checkNodeIdx)
                        && Objects.equals(existing.getTargetUserIdx(), checkUserIdx)
        );
        if (duplicated) {
            throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_APPROVAL_DUPLICATED);
        }

        LocalDateTime now = LocalDateTime.now();
        SharedStorageApproval approval = SharedStorageApproval.builder()
                .storage(storage)
                .approvalType(approvalType)
                .status(ApprovalStatus.PENDING)
                .requester(requester)
                .targetNodeIdx(targetNodeIdx)
                .targetLabel(targetLabel)
                .targetUserIdx(targetUserIdx)
                .reason(request != null && request.reason() != null ? request.reason().trim() : "")
                .createdAt(now)
                .expiresAt(now.plusDays(APPROVAL_EXPIRY_DAYS))
                .build();
        SharedStorageApproval savedApproval = sharedStorageApprovalRepository.save(approval);

        SharedStorageApprovalVote autoVote = SharedStorageApprovalVote.builder()
                .approval(savedApproval)
                .voter(requester)
                .approved(true)
                .votedAt(now)
                .build();
        sharedStorageApprovalVoteRepository.saveAndFlush(autoVote);

        List<SharedStorageMember> activeMembers = sharedStorageMemberRepository
                .findAllByStorage_IdxAndStatus(storageIdx, MemberStatus.ACTIVE);

        for (SharedStorageMember member : activeMembers) {
            if (member.getUser() != null && !Objects.equals(member.getUser().getIdx(), userIdx)) {
                notificationService.sendGeneralNotification(
                        member.getUser().getIdx(),
                        "공유 저장소 삭제/변경 승인 요청",
                        displayName(requester) + "님이 [" + storage.getName() + "]에서 '"
                                + targetLabel + "' 전원 승인을 요청했습니다. (7일 내 전원 승인 시 실행)"
                );
            }
        }

        evaluateAndExecuteApprovalIfComplete(storage, savedApproval, activeMembers, now);
        return getSharedStorageDetail(userIdx, storageIdx, null);
    }

    @Transactional
    public StorageShareDto.SharedStorageDetailRes voteApproval(
            Long userIdx,
            Long storageIdx,
            Long approvalIdx,
            StorageShareDto.VoteApprovalReq request
    ) {
        User voter = requireUser(userIdx);
        SharedStorage storage = getStorage(storageIdx);
        requireActiveMembership(storageIdx, userIdx);

        SharedStorageApproval approval = sharedStorageApprovalRepository.findByIdxAndStorage_Idx(approvalIdx, storageIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.SHARED_STORAGE_APPROVAL_NOT_FOUND));

        LocalDateTime now = LocalDateTime.now();
        if (!approval.isPending()) {
            throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_APPROVAL_CLOSED);
        }
        if (approval.getExpiresAt() != null && !approval.getExpiresAt().isAfter(now)) {
            approval.resolve(ApprovalStatus.EXPIRED, "7일 승인 기한이 만료되어 자동 취소되었습니다.", now);
            sharedStorageApprovalRepository.saveAndFlush(approval);
            throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_APPROVAL_CLOSED);
        }

        boolean approve = request != null && request.approve();
        SharedStorageApprovalVote existingVote = sharedStorageApprovalVoteRepository
                .findByApproval_IdxAndVoter_Idx(approvalIdx, userIdx)
                .orElse(null);
        if (existingVote == null) {
            SharedStorageApprovalVote vote = SharedStorageApprovalVote.builder()
                    .approval(approval)
                    .voter(voter)
                    .approved(approve)
                    .votedAt(now)
                    .build();
            sharedStorageApprovalVoteRepository.saveAndFlush(vote);
        }

        if (!approve) {
            approval.resolve(
                    ApprovalStatus.REJECTED,
                    displayName(voter) + "님이 거절하여 요청이 취소되었습니다.",
                    now
            );
            sharedStorageApprovalRepository.saveAndFlush(approval);
            if (approval.getRequester() != null && !Objects.equals(approval.getRequester().getIdx(), userIdx)) {
                notificationService.sendGeneralNotification(
                        approval.getRequester().getIdx(),
                        "공유 저장소 승인 요청 거절됨",
                        "[" + storage.getName() + "]의 '" + approval.getTargetLabel() + "' 요청이 거절되었습니다."
                );
            }
            return getSharedStorageDetail(userIdx, storageIdx, null);
        }

        List<SharedStorageMember> activeMembers = sharedStorageMemberRepository
                .findAllByStorage_IdxAndStatus(storageIdx, MemberStatus.ACTIVE);
        evaluateAndExecuteApprovalIfComplete(storage, approval, activeMembers, now);

        SharedStorageMember stillMember = sharedStorageMemberRepository
                .findByStorage_IdxAndUser_Idx(storageIdx, userIdx)
                .orElse(null);
        if (stillMember == null || !stillMember.isActive()) {
            return StorageShareDto.SharedStorageDetailRes.builder()
                    .summary(null)
                    .currentParentIdx(null)
                    .breadcrumbs(List.of())
                    .nodes(List.of())
                    .members(List.of())
                    .approvals(List.of())
                    .build();
        }
        return getSharedStorageDetail(userIdx, storageIdx, null);
    }

    @Transactional
    public StorageShareDto.SharedStorageDetailRes restoreTrashedStorage(Long userIdx, Long storageIdx) {
        requireUser(userIdx);
        SharedStorage storage = getStorage(storageIdx);
        requireActiveMembership(storageIdx, userIdx);

        if (storage.getStatus() == SharedStorageStatus.TRASHED) {
            LocalDateTime now = LocalDateTime.now();
            List<SharedStorageMember> activeMembers = sharedStorageMemberRepository
                    .findAllByStorage_IdxAndStatus(storageIdx, MemberStatus.ACTIVE);
            for (SharedStorageMember member : activeMembers) {
                long contribution = member.safeContributionBytes();
                if (contribution > 0L && member.getUser() != null) {
                    long available = storageGrantService.calculateAvailableBytesForUser(member.getUser().getIdx(), now);
                    if (available < contribution) {
                        throw BaseException.from(BaseResponseStatus.STORAGE_GRANT_INSUFFICIENT_CAPACITY);
                    }
                }
            }
            storage.restore();
            sharedStorageRepository.saveAndFlush(storage);
            List<FileInfo> linkedFolders = fileUpDownloadRepository
                    .findAllByFileSaveNameStartingWith(buildDriveFolderSaveNamePrefix(storageIdx));
            for (FileInfo folder : linkedFolders) {
                folder.restore();
            }
            if (!linkedFolders.isEmpty()) {
                fileUpDownloadRepository.saveAll(linkedFolders);
            }
        }

        return getSharedStorageDetail(userIdx, storageIdx, null);
    }

    @Transactional
    public void processExpiredApprovalsAndTrashedStorages(LocalDateTime now) {
        LocalDateTime referenceTime = now == null ? LocalDateTime.now() : now;

        List<SharedStorageApproval> expiredApprovals = sharedStorageApprovalRepository
                .findAllByStatusAndExpiresAtLessThanEqual(ApprovalStatus.PENDING, referenceTime);
        for (SharedStorageApproval approval : expiredApprovals) {
            approval.resolve(ApprovalStatus.EXPIRED, "7일 승인 기한이 만료되어 자동 취소되었습니다.", referenceTime);
            sharedStorageApprovalRepository.save(approval);
        }

        List<SharedStorage> purgeTargets = sharedStorageRepository
                .findAllByStatusAndPurgeAtLessThanEqual(SharedStorageStatus.TRASHED, referenceTime);
        for (SharedStorage storage : purgeTargets) {
            purgeSharedStorageCompletely(storage);
        }
    }

    @Transactional
    public void cleanupUserSharedStoragesOnWithdrawal(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            return;
        }

        sharedStorageApprovalVoteRepository.deleteAllByVoter_Idx(userIdx);
        for (SharedStorageApproval approval : sharedStorageApprovalRepository.findAllByRequester_Idx(userIdx)) {
            approval.clearRequester();
            sharedStorageApprovalRepository.save(approval);
        }
        for (SharedStorageNode node : sharedStorageNodeRepository.findAllByUploader_Idx(userIdx)) {
            node.clearUploader();
            sharedStorageNodeRepository.save(node);
        }

        List<SharedStorageMember> memberships = sharedStorageMemberRepository.findAllByUser_IdxOrderByCreatedAtDesc(userIdx);
        for (SharedStorageMember membership : memberships) {
            SharedStorage storage = membership.getStorage();
            if (storage == null) {
                continue;
            }
            Long storageIdx = storage.getIdx();
            sharedStorageMemberRepository.delete(membership);
            sharedStorageMemberRepository.flush();

            List<SharedStorageMember> remainingActive = sharedStorageMemberRepository
                    .findAllByStorage_IdxAndStatus(storageIdx, MemberStatus.ACTIVE);
            if (remainingActive.isEmpty()) {
                purgeSharedStorageCompletely(storage);
            } else if (storage.getCreator() != null && Objects.equals(storage.getCreator().getIdx(), userIdx)) {
                SharedStorageMember nextOwner = remainingActive.get(0);
                nextOwner.changeRole(MemberRole.OWNER);
                sharedStorageMemberRepository.save(nextOwner);
                storage.changeCreator(nextOwner.getUser());
                sharedStorageRepository.save(storage);
            }
        }
    }

    private void evaluateAndExecuteApprovalIfComplete(
            SharedStorage storage,
            SharedStorageApproval approval,
            List<SharedStorageMember> activeMembers,
            LocalDateTime now
    ) {
        List<SharedStorageApprovalVote> votes = sharedStorageApprovalVoteRepository.findAllByApproval_Idx(approval.getIdx());
        Set<Long> approvedUserIds = new HashSet<>();
        for (SharedStorageApprovalVote vote : votes) {
            if (vote.isApproved() && vote.getVoter() != null && vote.getVoter().getIdx() != null) {
                approvedUserIds.add(vote.getVoter().getIdx());
            }
        }

        boolean allApproved = activeMembers.stream()
                .map(SharedStorageMember::getUser)
                .filter(Objects::nonNull)
                .map(User::getIdx)
                .allMatch(approvedUserIds::contains);

        if (!allApproved) {
            return;
        }

        if (approval.getApprovalType() == ApprovalType.DELETE_STORAGE) {
            storage.moveToTrash(now, TRASH_RETENTION_DAYS);
            sharedStorageRepository.save(storage);
            List<FileInfo> linkedFolders = fileUpDownloadRepository
                    .findAllByFileSaveNameStartingWith(buildDriveFolderSaveNamePrefix(storage.getIdx()));
            for (FileInfo folder : linkedFolders) {
                folder.markTrashed(now);
            }
            if (!linkedFolders.isEmpty()) {
                fileUpDownloadRepository.saveAll(linkedFolders);
            }
            approval.resolve(
                    ApprovalStatus.APPROVED,
                    "참여자 전원 승인으로 공유 저장소가 삭제(휴지통 이동, 30일 후 영구 삭제)되었습니다.",
                    now
            );
            sharedStorageApprovalRepository.saveAndFlush(approval);
        } else if (approval.getApprovalType() == ApprovalType.DELETE_NODE) {
            deleteStorageNodeTree(storage.getIdx(), approval.getTargetNodeIdx());
            approval.resolve(
                    ApprovalStatus.APPROVED,
                    "참여자 전원 승인으로 선택한 파일/폴더가 영구 삭제되었습니다.",
                    now
            );
            sharedStorageApprovalRepository.saveAndFlush(approval);
        } else if (approval.getApprovalType() == ApprovalType.REMOVE_MEMBER) {
            removeStorageMember(storage, approval.getTargetUserIdx());
            approval.resolve(
                    ApprovalStatus.APPROVED,
                    "참여자 전원 승인으로 참여자가 제외되었습니다.",
                    now
            );
            sharedStorageApprovalRepository.saveAndFlush(approval);
        }

        for (SharedStorageMember member : activeMembers) {
            if (member.getUser() != null) {
                notificationService.sendGeneralNotification(
                        member.getUser().getIdx(),
                        "공유 저장소 전원 승인 완료",
                        "[" + storage.getName() + "]의 '" + approval.getTargetLabel() + "' 요청이 전원 승인되어 처리되었습니다."
                );
            }
        }
    }

    private void deleteStorageNodeTree(Long storageIdx, Long rootNodeIdx) {
        if (rootNodeIdx == null) {
            return;
        }
        List<SharedStorageNode> allNodes = sharedStorageNodeRepository.findAllByStorage_IdxOrderByNodeTypeDescNameAsc(storageIdx);
        Map<Long, SharedStorageNode> byId = new HashMap<>();
        Map<Long, List<SharedStorageNode>> childrenByParent = new HashMap<>();
        for (SharedStorageNode node : allNodes) {
            byId.put(node.getIdx(), node);
            Long parentId = node.getParent() != null ? node.getParent().getIdx() : null;
            if (parentId != null) {
                childrenByParent.computeIfAbsent(parentId, ignored -> new ArrayList<>()).add(node);
            }
        }

        SharedStorageNode root = byId.get(rootNodeIdx);
        if (root == null) {
            return;
        }

        List<SharedStorageNode> postOrder = new ArrayList<>();
        collectPostOrder(root, childrenByParent, postOrder);

        List<String> objectKeys = postOrder.stream()
                .map(SharedStorageNode::getObjectKey)
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(key -> !key.isBlank())
                .toList();

        sharedStorageNodeRepository.deleteAll(postOrder);
        sharedStorageNodeRepository.flush();
        deleteObjectKeysAfterCommit(objectKeys);
    }

    private void collectPostOrder(
            SharedStorageNode current,
            Map<Long, List<SharedStorageNode>> childrenByParent,
            List<SharedStorageNode> target
    ) {
        for (SharedStorageNode child : childrenByParent.getOrDefault(current.getIdx(), List.of())) {
            collectPostOrder(child, childrenByParent, target);
        }
        target.add(current);
    }

    private void removeStorageMember(SharedStorage storage, Long targetUserIdx) {
        if (targetUserIdx == null) {
            return;
        }
        SharedStorageMember targetMember = sharedStorageMemberRepository
                .findByStorage_IdxAndUser_Idx(storage.getIdx(), targetUserIdx)
                .orElse(null);
        if (targetMember == null) {
            return;
        }

        long currentTotal = sumActiveMemberContributions(storage.getIdx());
        long usedBytes = sumStorageUsedBytes(storage.getIdx());
        long remainingCapacity = Math.max(0L, currentTotal - targetMember.safeContributionBytes());
        if (remainingCapacity < usedBytes) {
            throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_CONTRIBUTION_TOO_SMALL);
        }

        sharedStorageMemberRepository.delete(targetMember);
        sharedStorageMemberRepository.flush();
        fileUpDownloadRepository
                .findFirstByUser_IdxAndFileSaveNameStartingWithOrderByIdxAsc(
                        targetUserIdx,
                        buildDriveFolderSaveNamePrefix(storage.getIdx())
                )
                .ifPresent(fileUpDownloadRepository::delete);
    }

    private void purgeSharedStorageCompletely(SharedStorage storage) {
        Long storageIdx = storage.getIdx();
        List<SharedStorageNode> allNodes = sharedStorageNodeRepository.findAllByStorage_IdxOrderByNodeTypeDescNameAsc(storageIdx);
        List<String> objectKeys = allNodes.stream()
                .map(SharedStorageNode::getObjectKey)
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(key -> !key.isBlank())
                .toList();

        sharedStorageApprovalVoteRepository.deleteAllByApproval_Storage_Idx(storageIdx);
        sharedStorageApprovalRepository.deleteAllByStorage_Idx(storageIdx);
        for (SharedStorageNode node : allNodes) {
            if (node.getParent() != null) {
                sharedStorageNodeRepository.delete(node);
            }
        }
        sharedStorageNodeRepository.deleteAllByStorage_Idx(storageIdx);
        sharedStorageMemberRepository.deleteAllByStorage_Idx(storageIdx);
        List<FileInfo> linkedFolders = fileUpDownloadRepository
                .findAllByFileSaveNameStartingWith(buildDriveFolderSaveNamePrefix(storageIdx));
        if (!linkedFolders.isEmpty()) {
            fileUpDownloadRepository.deleteAll(linkedFolders);
        }
        sharedStorageRepository.delete(storage);
        sharedStorageRepository.flush();

        deleteObjectKeysAfterCommit(objectKeys);
    }

    private SharedStorageNode ensureRelativeFolderHierarchy(
            SharedStorage storage,
            User actor,
            Long baseParentIdx,
            String relativePath,
            String fileOriginName
    ) {
        SharedStorageNode currentParent = resolveParentFolder(storage.getIdx(), baseParentIdx);
        if (relativePath == null || relativePath.isBlank()) {
            return currentParent;
        }

        String normalized = relativePath.trim().replace('\\', '/');
        String[] segments = normalized.split("/");
        if (segments.length <= 1) {
            return currentParent;
        }

        int folderDepth = segments.length - 1;
        for (int i = 0; i < folderDepth; i++) {
            String segment = segments[i] == null ? "" : segments[i].trim();
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) {
                continue;
            }
            if (i == folderDepth - 1 && fileOriginName != null && segment.equalsIgnoreCase(fileOriginName.trim())) {
                break;
            }
            currentParent = findOrCreateChildFolder(storage, actor, currentParent, segment);
        }

        return currentParent;
    }

    private SharedStorageNode findOrCreateChildFolder(
            SharedStorage storage,
            User actor,
            SharedStorageNode parent,
            String folderName
    ) {
        Long parentId = parent != null ? parent.getIdx() : null;
        List<SharedStorageNode> allNodes = sharedStorageNodeRepository.findAllByStorage_IdxOrderByNodeTypeDescNameAsc(storage.getIdx());
        for (SharedStorageNode node : allNodes) {
            Long nodeParentId = node.getParent() != null ? node.getParent().getIdx() : null;
            if (node.isFolder() && Objects.equals(nodeParentId, parentId) && node.getName().equalsIgnoreCase(folderName)) {
                return node;
            }
        }

        SharedStorageNode created = SharedStorageNode.builder()
                .storage(storage)
                .parent(parent)
                .nodeType(NodeType.FOLDER)
                .name(folderName)
                .fileFormat("folder")
                .fileSize(0L)
                .uploader(actor)
                .build();
        return sharedStorageNodeRepository.saveAndFlush(created);
    }

    private List<StorageShareDto.NodeRes> buildBreadcrumbs(Long parentIdx, Map<Long, SharedStorageNode> nodeById) {
        if (parentIdx == null) {
            return List.of();
        }
        Deque<StorageShareDto.NodeRes> stack = new ArrayDeque<>();
        SharedStorageNode cursor = nodeById.get(parentIdx);
        int safety = 0;
        while (cursor != null && safety < 64) {
            stack.push(toNodeRes(cursor));
            cursor = cursor.getParent() != null ? nodeById.get(cursor.getParent().getIdx()) : null;
            safety++;
        }
        return new ArrayList<>(stack);
    }

    private List<StorageShareDto.ApprovalRes> buildApprovalResponses(
            Long storageIdx,
            Long viewerUserIdx,
            List<SharedStorageMember> allMembers
    ) {
        List<SharedStorageApproval> approvals = sharedStorageApprovalRepository.findAllByStorage_IdxOrderByCreatedAtDesc(storageIdx);
        if (approvals.isEmpty()) {
            return List.of();
        }

        int activeMemberCount = (int) allMembers.stream().filter(SharedStorageMember::isActive).count();
        List<Long> approvalIds = approvals.stream().map(SharedStorageApproval::getIdx).toList();
        Map<Long, List<SharedStorageApprovalVote>> votesByApproval = new HashMap<>();
        for (SharedStorageApprovalVote vote : sharedStorageApprovalVoteRepository.findAllByApproval_IdxIn(approvalIds)) {
            if (vote.getApproval() != null) {
                votesByApproval.computeIfAbsent(vote.getApproval().getIdx(), ignored -> new ArrayList<>()).add(vote);
            }
        }

        List<StorageShareDto.ApprovalRes> result = new ArrayList<>();
        for (SharedStorageApproval approval : approvals) {
            List<SharedStorageApprovalVote> votes = votesByApproval.getOrDefault(approval.getIdx(), List.of());
            int approvedCount = (int) votes.stream().filter(SharedStorageApprovalVote::isApproved).count();
            Boolean myVote = votes.stream()
                    .filter(v -> v.getVoter() != null && Objects.equals(v.getVoter().getIdx(), viewerUserIdx))
                    .map(SharedStorageApprovalVote::isApproved)
                    .findFirst()
                    .orElse(null);

            List<StorageShareDto.VoteRes> voteDtos = votes.stream()
                    .map(v -> StorageShareDto.VoteRes.builder()
                            .voterIdx(v.getVoter() != null ? v.getVoter().getIdx() : null)
                            .voterName(displayName(v.getVoter()))
                            .voterEmail(v.getVoter() != null ? v.getVoter().getEmail() : null)
                            .approved(v.isApproved())
                            .votedAt(v.getVotedAt())
                            .build())
                    .toList();

            User reqUser = approval.getRequester();
            result.add(StorageShareDto.ApprovalRes.builder()
                    .approvalIdx(approval.getIdx())
                    .storageIdx(storageIdx)
                    .approvalType(approval.getApprovalType().name())
                    .status(approval.getStatus().name())
                    .requesterIdx(reqUser != null ? reqUser.getIdx() : null)
                    .requesterName(displayName(reqUser))
                    .requesterEmail(reqUser != null ? reqUser.getEmail() : null)
                    .targetNodeIdx(approval.getTargetNodeIdx())
                    .targetLabel(approval.getTargetLabel())
                    .targetUserIdx(approval.getTargetUserIdx())
                    .reason(approval.getReason())
                    .resultMessage(approval.getResultMessage())
                    .requiredVoteCount(activeMemberCount)
                    .approvedVoteCount(approvedCount)
                    .myVote(myVote)
                    .createdAt(approval.getCreatedAt())
                    .expiresAt(approval.getExpiresAt())
                    .resolvedAt(approval.getResolvedAt())
                    .votes(voteDtos)
                    .build());
        }
        return result;
    }

    private StorageShareDto.SharedStorageSummaryRes buildStorageSummary(
            SharedStorage storage,
            SharedStorageMember myMembership
    ) {
        Long storageIdx = storage.getIdx();
        List<SharedStorageMember> activeMembers = sharedStorageMemberRepository
                .findAllByStorage_IdxAndStatus(storageIdx, MemberStatus.ACTIVE);
        long totalCapacityBytes = activeMembers.stream()
                .mapToLong(SharedStorageMember::safeContributionBytes)
                .sum();
        long usedBytes = sumStorageUsedBytes(storageIdx);
        long remainingBytes = Math.max(0L, totalCapacityBytes - usedBytes);
        int usagePercent = totalCapacityBytes > 0L
                ? (int) Math.min(100, Math.round((usedBytes * 100.0) / totalCapacityBytes))
                : 0;
        int pendingApprovalCount = sharedStorageApprovalRepository
                .findAllByStorage_IdxAndStatus(storageIdx, ApprovalStatus.PENDING)
                .size();

        User creator = storage.getCreator();
        FileInfo driveFolder = null;
        if (myMembership != null && myMembership.getUser() != null && myMembership.getUser().getIdx() != null) {
            driveFolder = fileUpDownloadRepository
                    .findFirstByUser_IdxAndFileSaveNameStartingWithOrderByIdxAsc(
                            myMembership.getUser().getIdx(),
                            buildDriveFolderSaveNamePrefix(storageIdx)
                    )
                    .orElse(null);
        }
        Long driveFolderIdx = driveFolder != null ? driveFolder.getIdx() : null;
        Long parentFolderId = driveFolder != null && driveFolder.getParent() != null
                ? driveFolder.getParent().getIdx()
                : null;
        return StorageShareDto.SharedStorageSummaryRes.builder()
                .storageIdx(storageIdx)
                .name(storage.getName())
                .description(storage.getDescription())
                .status(storage.getStatus().name())
                .creatorIdx(creator != null ? creator.getIdx() : null)
                .creatorName(displayName(creator))
                .creatorEmail(creator != null ? creator.getEmail() : null)
                .myRole(myMembership != null && myMembership.getRole() != null ? myMembership.getRole().name() : MemberRole.MEMBER.name())
                .myStatus(myMembership != null && myMembership.getStatus() != null ? myMembership.getStatus().name() : MemberStatus.INVITED.name())
                .myContributionBytes(myMembership != null ? myMembership.safeContributionBytes() : 0L)
                .myProposedContributionBytes(
                        myMembership != null && myMembership.getProposedContributionBytes() != null
                                ? Math.max(0L, myMembership.getProposedContributionBytes())
                                : 0L
                )
                .totalCapacityBytes(totalCapacityBytes)
                .usedBytes(usedBytes)
                .remainingBytes(remainingBytes)
                .usagePercent(usagePercent)
                .activeMemberCount(activeMembers.size())
                .pendingApprovalCount(pendingApprovalCount)
                .driveFolderIdx(driveFolderIdx)
                .parentFolderId(parentFolderId)
                .createdAt(storage.getCreatedAt())
                .trashedAt(storage.getTrashedAt())
                .purgeAt(storage.getPurgeAt())
                .build();
    }

    private StorageShareDto.MemberRes toMemberRes(SharedStorageMember member) {
        User u = member.getUser();
        return StorageShareDto.MemberRes.builder()
                .memberIdx(member.getIdx())
                .userIdx(u != null ? u.getIdx() : null)
                .userName(displayName(u))
                .userEmail(u != null ? u.getEmail() : null)
                .role(member.getRole().name())
                .status(member.getStatus().name())
                .contributionBytes(member.safeContributionBytes())
                .proposedContributionBytes(member.getProposedContributionBytes() != null ? Math.max(0L, member.getProposedContributionBytes()) : 0L)
                .createdAt(member.getCreatedAt())
                .joinedAt(member.getJoinedAt())
                .build();
    }

    private StorageShareDto.NodeRes toNodeRes(SharedStorageNode node) {
        User uploader = node.getUploader();
        return StorageShareDto.NodeRes.builder()
                .idx(node.getIdx())
                .storageIdx(node.getStorage() != null ? node.getStorage().getIdx() : null)
                .parentIdx(node.getParent() != null ? node.getParent().getIdx() : null)
                .nodeType(node.getNodeType().name().toLowerCase(Locale.ROOT))
                .name(node.getName())
                .fileFormat(node.getFileFormat())
                .fileSize(node.safeFileSize())
                .uploaderIdx(uploader != null ? uploader.getIdx() : null)
                .uploaderName(displayName(uploader))
                .uploaderEmail(uploader != null ? uploader.getEmail() : null)
                .createdAt(node.getCreatedAt())
                .updatedAt(node.getUpdatedAt())
                .build();
    }

    private long sumActiveMemberContributions(Long storageIdx) {
        return sharedStorageMemberRepository.findAllByStorage_IdxAndStatus(storageIdx, MemberStatus.ACTIVE)
                .stream()
                .mapToLong(SharedStorageMember::safeContributionBytes)
                .sum();
    }

    private long sumStorageUsedBytes(Long storageIdx) {
        Long sum = sharedStorageNodeRepository.sumFileSizeByStorageIdx(storageIdx, NodeType.FILE);
        return Math.max(0L, sum == null ? 0L : sum);
    }

    private SharedStorage getStorage(Long storageIdx) {
        if (storageIdx == null || storageIdx <= 0L) {
            throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_NOT_FOUND);
        }
        return sharedStorageRepository.findWithCreatorByIdx(storageIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.SHARED_STORAGE_NOT_FOUND));
    }

    private SharedStorage requireActiveStorage(Long storageIdx) {
        SharedStorage storage = getStorage(storageIdx);
        if (!storage.isActive()) {
            throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_NOT_ACTIVE);
        }
        return storage;
    }

    private SharedStorageMember requireActiveMembership(Long storageIdx, Long userIdx) {
        return sharedStorageMemberRepository.findByStorage_IdxAndUser_Idx(storageIdx, userIdx)
                .filter(SharedStorageMember::isActive)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.SHARED_STORAGE_ACCESS_DENIED));
    }

    private SharedStorageNode resolveParentFolder(Long storageIdx, Long parentIdx) {
        if (parentIdx == null || parentIdx <= 0L) {
            return null;
        }
        SharedStorageNode parent = sharedStorageNodeRepository.findByIdxAndStorage_Idx(parentIdx, storageIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.SHARED_STORAGE_NODE_NOT_FOUND));
        if (!parent.isFolder()) {
            throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_NODE_NOT_FOUND);
        }
        return parent;
    }

    private String normalizeStorageName(String raw) {
        String name = raw == null ? "" : raw.trim();
        if (name.isEmpty() || name.length() > 100) {
            throw BaseException.from(BaseResponseStatus.SHARED_STORAGE_INVALID_NAME);
        }
        return name;
    }

    private String normalizeNodeName(String raw) {
        String name = raw == null ? "" : raw.trim();
        if (name.isEmpty() || name.length() > 200) {
            throw BaseException.from(BaseResponseStatus.FILE_NAME_WRONG);
        }
        return name;
    }

    private String normalizeFormat(String rawFormat, String originName) {
        String format = rawFormat;
        if (format == null || format.isBlank()) {
            int dot = originName.lastIndexOf('.');
            format = (dot > 0 && dot < originName.length() - 1) ? originName.substring(dot + 1) : "bin";
        }
        format = format.trim().replace(".", "").toLowerCase(Locale.ROOT);
        if (format.isEmpty() || format.length() > 20) {
            return "bin";
        }
        return format;
    }

    private String buildSharedStorageObjectKey(Long storageIdx, Long uploaderIdx, String originName) {
        String safeName = originName.replaceAll("[^A-Za-z0-9._-]", "_");
        return "shared-storage/" + storageIdx + "/" + uploaderIdx + "_" + UUID.randomUUID() + "_" + safeName;
    }

    private String normalizeOwnedSharedStorageFinalObjectKey(Long storageIdx, Long userIdx, String rawFinalObjectKey) {
        String normalized = rawFinalObjectKey == null ? "" : rawFinalObjectKey.trim();
        String expectedPrefix = "shared-storage/" + storageIdx + "/" + userIdx + "_";
        if (normalized.isEmpty()
                || !normalized.startsWith(expectedPrefix)
                || containsUnsafeObjectKeyToken(normalized)
                || normalized.contains(".part.")) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        String suffix = normalized.substring(expectedPrefix.length());
        if (suffix.isEmpty() || suffix.contains("/")) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return normalized;
    }

    private List<String> normalizeOwnedSharedStorageChunkKeys(String finalObjectKey, List<String> rawChunkKeys) {
        if (rawChunkKeys == null || rawChunkKeys.isEmpty()) {
            return List.of();
        }

        String partPrefix = finalObjectKey + ".part.";
        List<String> normalizedKeys = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String rawKey : rawChunkKeys) {
            if (rawKey == null) {
                continue;
            }
            String trimmed = rawKey.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            if (!trimmed.startsWith(partPrefix) || containsUnsafeObjectKeyToken(trimmed)) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            String partIndex = trimmed.substring(partPrefix.length());
            if (!partIndex.matches("^[0-9]+$")) {
                throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
            }
            if (seen.add(trimmed)) {
                normalizedKeys.add(trimmed);
            }
        }
        return normalizedKeys;
    }

    private boolean containsUnsafeObjectKeyToken(String key) {
        if (key.contains("..") || key.contains("\\")) {
            return true;
        }
        return key.chars().anyMatch(ch -> ch < 32 || ch == 127);
    }

    private List<Long> calculateChunkSizes(long fileSize) {
        if (fileSize <= PARTITION_SIZE_BYTES) {
            return Collections.singletonList(fileSize);
        }
        List<Long> chunks = new ArrayList<>();
        long remaining = fileSize;
        while (remaining > 0L) {
            if (remaining <= CHUNK_SIZE_BYTES + MIN_FINAL_PARTITION_SIZE_BYTES) {
                chunks.add(remaining);
                break;
            }
            chunks.add(CHUNK_SIZE_BYTES);
            remaining -= CHUNK_SIZE_BYTES;
        }
        return chunks;
    }

    private ApprovalType parseApprovalType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return switch (raw.trim().toUpperCase(Locale.ROOT)) {
            case "DELETE_STORAGE" -> ApprovalType.DELETE_STORAGE;
            case "DELETE_NODE" -> ApprovalType.DELETE_NODE;
            case "REMOVE_MEMBER" -> ApprovalType.REMOVE_MEMBER;
            default -> throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        };
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
}
