package com.example.WaffleBear.storageshare;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.file.upload.UploadObjectStorageService;
import com.example.WaffleBear.file.version.FileVersionLifecycleService;
import com.example.WaffleBear.file.version.FileVersionRepository;
import com.example.WaffleBear.file.version.model.FileVersion;
import com.example.WaffleBear.group.repository.RelationshipGroupMappingRepository;
import com.example.WaffleBear.group.repository.RelationshipGroupRepository;
import com.example.WaffleBear.group.repository.RelationshipRepository;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.storageshare.model.SharedStorage;
import com.example.WaffleBear.storageshare.model.SharedStorageApproval;
import com.example.WaffleBear.storageshare.model.SharedStorageApprovalVote;
import com.example.WaffleBear.storageshare.model.SharedStorageMember;
import com.example.WaffleBear.storageshare.model.StorageGrant;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.ApprovalStatus;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.ApprovalType;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.GrantStatus;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.GrantType;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.MemberRole;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.MemberStatus;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.SharedStorageStatus;
import com.example.WaffleBear.storageshare.model.dto.StorageShareDto;
import com.example.WaffleBear.storageshare.repository.SharedStorageApprovalRepository;
import com.example.WaffleBear.storageshare.repository.SharedStorageApprovalVoteRepository;
import com.example.WaffleBear.storageshare.repository.SharedStorageMemberRepository;
import com.example.WaffleBear.storageshare.repository.SharedStorageNodeRepository;
import com.example.WaffleBear.storageshare.repository.SharedStorageRepository;
import com.example.WaffleBear.storageshare.repository.StorageGrantRepository;
import com.example.WaffleBear.storageshare.service.SharedStorageService;
import com.example.WaffleBear.storageshare.service.StorageGrantService;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StorageShareServicesTest {

    private static final long GB = StoragePlanService.GIGABYTE;
    private static final long TB = StoragePlanService.TERABYTE;

    @Mock
    private StorageGrantRepository storageGrantRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private StoragePlanService storagePlanService;
    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;
    @Mock
    private FileVersionRepository fileVersionRepository;
    @Mock
    private FileVersionLifecycleService fileVersionLifecycleService;
    @Mock
    private ShareRepository shareRepository;
    @Mock
    private UploadObjectStorageService uploadObjectStorageService;
    @Mock
    private RelationshipRepository relationshipRepository;
    @Mock
    private RelationshipGroupRepository relationshipGroupRepository;
    @Mock
    private RelationshipGroupMappingRepository relationshipGroupMappingRepository;
    @Mock
    private NotificationService notificationService;

    @Mock
    private SharedStorageRepository sharedStorageRepository;
    @Mock
    private SharedStorageMemberRepository sharedStorageMemberRepository;
    @Mock
    private SharedStorageNodeRepository sharedStorageNodeRepository;
    @Mock
    private SharedStorageApprovalRepository sharedStorageApprovalRepository;
    @Mock
    private SharedStorageApprovalVoteRepository sharedStorageApprovalVoteRepository;
    @Mock
    private MinioPresignedUrlService minioPresignedUrlService;
    @Mock
    private MinioProperties minioProperties;

    private StorageGrantService storageGrantService;
    private SharedStorageService sharedStorageService;

    @BeforeEach
    void setUp() {
        storageGrantService = new StorageGrantService(
                storageGrantRepository,
                userRepository,
                storagePlanService,
                fileUpDownloadRepository,
                fileVersionRepository,
                fileVersionLifecycleService,
                shareRepository,
                uploadObjectStorageService,
                relationshipRepository,
                relationshipGroupRepository,
                relationshipGroupMappingRepository,
                notificationService
        );
        sharedStorageService = new SharedStorageService(
                sharedStorageRepository,
                sharedStorageMemberRepository,
                sharedStorageNodeRepository,
                sharedStorageApprovalRepository,
                sharedStorageApprovalVoteRepository,
                storageGrantService,
                storagePlanService,
                uploadObjectStorageService,
                minioPresignedUrlService,
                minioProperties,
                fileUpDownloadRepository,
                userRepository,
                notificationService
        );
    }

    @Test
    void cancellingRecurringGrantSetsOneMonthGracePeriod() {
        User userA = User.builder().idx(1L).email("a@example.com").name("사용자A").build();
        User userB = User.builder().idx(2L).email("b@example.com").name("사용자B").build();
        StorageGrant grant = StorageGrant.builder()
                .idx(10L)
                .granter(userA)
                .recipient(userB)
                .bytes(100L * GB)
                .grantType(GrantType.RECURRING)
                .status(GrantStatus.ACTIVE)
                .startAt(LocalDateTime.now().minusDays(15))
                .endAt(null)
                .build();

        when(userRepository.findById(1L)).thenReturn(Optional.of(userA));
        when(storageGrantRepository.findById(10L)).thenReturn(Optional.of(grant));
        when(storagePlanService.resolveOwnPlanQuota(1L)).thenReturn(quota(2L * TB));
        when(storagePlanService.resolveQuota(1L)).thenReturn(quota(2L * TB - 100L * GB));
        when(storagePlanService.resolveCapacityAdjustment(any(), any()))
                .thenReturn(new StoragePlanService.CapacityAdjustment(0L, 100L * GB, 0L));
        when(fileUpDownloadRepository.sumStoredFileBytesByUser(1L, FileNodeType.FILE)).thenReturn(0L);
        when(fileVersionLifecycleService.sumStoredVersionBytes(1L)).thenReturn(0L);
        when(storageGrantRepository.findAllByGranter_IdxOrderByCreatedAtDesc(1L)).thenReturn(List.of(grant));
        when(storageGrantRepository.findAllByRecipient_IdxOrderByCreatedAtDesc(1L)).thenReturn(List.of());

        storageGrantService.cancelGrant(1L, 10L);

        assertEquals(GrantStatus.CANCELLED, grant.getStatus());
        assertNotNull(grant.getEndAt());
        assertTrue(grant.getEndAt().isAfter(LocalDateTime.now().plusDays(27)));
    }

    @Test
    void enforceRecipientQuotaLimitCleansTrashThenVersionsThenOldestUnlockedFilesAndPreservesLockedFiles() {
        // B user has 10GB effective quota after grant expires, and currently uses 25GB:
        // - 5GB in trash
        // - 5GB in old FileVersion
        // - 6GB in old unlocked file (2025-01-01)
        // - 5GB in newer unlocked file (2026-01-01)
        // - 4GB in locked file (2024-01-01, oldest but locked!)
        // Needs to free 15GB -> should delete 5GB trash + 5GB version + 6GB old unlocked file = 16GB freed!
        // Newer unlocked file and locked file must remain untouched.
        when(storagePlanService.resolveQuota(2L)).thenReturn(quota(10L * GB));
        when(fileUpDownloadRepository.sumStoredFileBytesByUser(2L, FileNodeType.FILE)).thenReturn(20L * GB);
        when(fileVersionLifecycleService.sumStoredVersionBytes(2L)).thenReturn(5L * GB);

        FileInfo trashedFile = FileInfo.builder()
                .idx(101L)
                .nodeType(FileNodeType.FILE)
                .fileOriginName("trash.zip")
                .fileSavePath("2/trash.zip")
                .fileSize(5L * GB)
                .trashed(true)
                .deletedAt(LocalDateTime.of(2026, 1, 10, 0, 0))
                .build();

        FileInfo oldUnlockedFile = FileInfo.builder()
                .idx(102L)
                .nodeType(FileNodeType.FILE)
                .fileOriginName("old_unlocked.mov")
                .fileSavePath("2/old_unlocked.mov")
                .fileSize(6L * GB)
                .trashed(false)
                .lockedFile(false)
                .lastModifyDate(LocalDateTime.of(2025, 1, 1, 0, 0))
                .uploadDate(LocalDateTime.of(2025, 1, 1, 0, 0))
                .build();

        FileInfo newUnlockedFile = FileInfo.builder()
                .idx(103L)
                .nodeType(FileNodeType.FILE)
                .fileOriginName("new_unlocked.mov")
                .fileSavePath("2/new_unlocked.mov")
                .fileSize(5L * GB)
                .trashed(false)
                .lockedFile(false)
                .lastModifyDate(LocalDateTime.of(2026, 1, 1, 0, 0))
                .uploadDate(LocalDateTime.of(2026, 1, 1, 0, 0))
                .build();

        FileInfo lockedFile = FileInfo.builder()
                .idx(104L)
                .nodeType(FileNodeType.FILE)
                .fileOriginName("important_locked.mov")
                .fileSavePath("2/important_locked.mov")
                .fileSize(4L * GB)
                .trashed(false)
                .lockedFile(true)
                .lastModifyDate(LocalDateTime.of(2024, 1, 1, 0, 0))
                .uploadDate(LocalDateTime.of(2024, 1, 1, 0, 0))
                .build();

        FileVersion oldVersion = FileVersion.builder()
                .idx(201L)
                .file(newUnlockedFile)
                .versionNumber(1)
                .fileOriginName("new_unlocked_v1.mov")
                .fileFormat("mov")
                .fileSaveName("v1")
                .fileSavePath("2/versions/v1.mov")
                .fileSize(5L * GB)
                .createdAt(LocalDateTime.of(2025, 6, 1, 0, 0))
                .build();

        when(fileUpDownloadRepository.findAllByUser_Idx(2L))
                .thenReturn(List.of(trashedFile, oldUnlockedFile, newUnlockedFile, lockedFile));
        when(fileVersionRepository.findAllByFile_IdxIn(List.of(101L))).thenReturn(List.of());
        when(fileVersionRepository.findAllByFile_IdxIn(List.of(102L))).thenReturn(List.of());
        when(fileVersionRepository.findAllByUser_Idx(2L)).thenReturn(List.of(oldVersion));
        when(shareRepository.findAllByFile_Idx(any())).thenReturn(List.of());

        StorageGrantService.CleanupResult result = storageGrantService.enforceRecipientQuotaLimit(2L);

        assertEquals(16L * GB, result.deletedBytes());
        assertEquals(2, result.deletedFiles());
        assertEquals(1, result.deletedVersions());

        verify(fileUpDownloadRepository).delete(trashedFile);
        verify(fileVersionRepository).delete(oldVersion);
        verify(fileUpDownloadRepository).delete(oldUnlockedFile);
        verify(fileUpDownloadRepository, never()).delete(newUnlockedFile);
        verify(fileUpDownloadRepository, never()).delete(lockedFile);
    }

    @Test
    void sharedStorageDeletionRequiresUnanimousApprovalOfAllActiveMembers() {
        User userA = User.builder().idx(1L).email("a@example.com").name("사용자A").build();
        User userB = User.builder().idx(2L).email("b@example.com").name("사용자B").build();

        SharedStorage storage = SharedStorage.builder()
                .idx(50L)
                .name("공동 프로젝트 폴더")
                .creator(userA)
                .status(SharedStorageStatus.ACTIVE)
                .build();

        SharedStorageMember memberA = SharedStorageMember.builder()
                .idx(501L)
                .storage(storage)
                .user(userA)
                .role(MemberRole.OWNER)
                .status(MemberStatus.ACTIVE)
                .contributionBytes(50L * GB)
                .build();

        SharedStorageMember memberB = SharedStorageMember.builder()
                .idx(502L)
                .storage(storage)
                .user(userB)
                .role(MemberRole.MEMBER)
                .status(MemberStatus.ACTIVE)
                .contributionBytes(10L * GB)
                .build();

        SharedStorageApproval approval = SharedStorageApproval.builder()
                .idx(900L)
                .storage(storage)
                .approvalType(ApprovalType.DELETE_STORAGE)
                .status(ApprovalStatus.PENDING)
                .requester(userA)
                .targetLabel("공유 저장소 [공동 프로젝트 폴더] 전체 삭제")
                .expiresAt(LocalDateTime.now().plusDays(7))
                .build();

        SharedStorageApprovalVote voteA = SharedStorageApprovalVote.builder()
                .idx(1L)
                .approval(approval)
                .voter(userA)
                .approved(true)
                .build();

        SharedStorageApprovalVote voteB = SharedStorageApprovalVote.builder()
                .idx(2L)
                .approval(approval)
                .voter(userB)
                .approved(true)
                .build();

        when(userRepository.findById(2L)).thenReturn(Optional.of(userB));
        when(sharedStorageRepository.findWithCreatorByIdx(50L)).thenReturn(Optional.of(storage));
        when(sharedStorageMemberRepository.findByStorage_IdxAndUser_Idx(50L, 2L)).thenReturn(Optional.of(memberB));
        when(sharedStorageApprovalRepository.findByIdxAndStorage_Idx(900L, 50L)).thenReturn(Optional.of(approval));
        when(sharedStorageApprovalVoteRepository.findByApproval_IdxAndVoter_Idx(900L, 2L)).thenReturn(Optional.empty());
        when(sharedStorageMemberRepository.findAllByStorage_IdxAndStatus(50L, MemberStatus.ACTIVE))
                .thenReturn(List.of(memberA, memberB));
        when(sharedStorageApprovalVoteRepository.findAllByApproval_Idx(900L)).thenReturn(List.of(voteA, voteB));
        when(sharedStorageMemberRepository.findAllByStorage_IdxOrderByCreatedAtAsc(50L))
                .thenReturn(List.of(memberA, memberB));
        when(sharedStorageNodeRepository.findAllByStorage_IdxOrderByNodeTypeDescNameAsc(50L)).thenReturn(List.of());
        when(sharedStorageApprovalRepository.findAllByStorage_IdxOrderByCreatedAtDesc(50L)).thenReturn(List.of(approval));
        when(sharedStorageApprovalVoteRepository.findAllByApproval_IdxIn(List.of(900L))).thenReturn(List.of(voteA, voteB));

        sharedStorageService.voteApproval(2L, 50L, 900L, new StorageShareDto.VoteApprovalReq(true));

        assertEquals(ApprovalStatus.APPROVED, approval.getStatus());
        assertEquals(SharedStorageStatus.TRASHED, storage.getStatus());
        assertNotNull(storage.getPurgeAt());
    }

    @Test
    void completeUploadRejectsFinalObjectKeyOwnedByAnotherUserOrWithTraversal() {
        User attacker = User.builder().idx(1L).email("attacker@example.com").name("공격자").build();
        SharedStorage storage = SharedStorage.builder()
                .idx(50L)
                .name("공유 저장소")
                .creator(attacker)
                .status(SharedStorageStatus.ACTIVE)
                .build();
        SharedStorageMember membership = SharedStorageMember.builder()
                .idx(501L)
                .storage(storage)
                .user(attacker)
                .role(MemberRole.OWNER)
                .status(MemberStatus.ACTIVE)
                .contributionBytes(10L * GB)
                .build();

        when(userRepository.findById(1L)).thenReturn(Optional.of(attacker));
        when(sharedStorageRepository.findWithCreatorByIdx(50L)).thenReturn(Optional.of(storage));
        when(sharedStorageMemberRepository.findByStorage_IdxAndUser_Idx(50L, 1L)).thenReturn(Optional.of(membership));

        assertThrows(BaseException.class, () -> sharedStorageService.completeUpload(
                1L,
                50L,
                new StorageShareDto.CompleteUploadReq(
                        null,
                        null,
                        "secret.pdf",
                        "pdf",
                        128L,
                        "shared-storage/50/2_other-user.pdf",
                        List.of()
                )
        ));
        assertThrows(BaseException.class, () -> sharedStorageService.completeUpload(
                1L,
                50L,
                new StorageShareDto.CompleteUploadReq(
                        null,
                        null,
                        "secret.pdf",
                        "pdf",
                        128L,
                        "shared-storage/50/1_uuid_../../secret.pdf",
                        List.of()
                )
        ));

        verify(uploadObjectStorageService, never()).composeFinalObject(anyString(), anyList());
        verify(uploadObjectStorageService, never()).deleteObjectKeys(anyList());
    }

    @Test
    void completeUploadRejectsForeignChunkObjectKeysBeforeComposeOrDelete() {
        User attacker = User.builder().idx(1L).email("attacker@example.com").name("공격자").build();
        SharedStorage storage = SharedStorage.builder()
                .idx(50L)
                .name("공유 저장소")
                .creator(attacker)
                .status(SharedStorageStatus.ACTIVE)
                .build();
        SharedStorageMember membership = SharedStorageMember.builder()
                .idx(501L)
                .storage(storage)
                .user(attacker)
                .role(MemberRole.OWNER)
                .status(MemberStatus.ACTIVE)
                .contributionBytes(10L * GB)
                .build();

        when(userRepository.findById(1L)).thenReturn(Optional.of(attacker));
        when(sharedStorageRepository.findWithCreatorByIdx(50L)).thenReturn(Optional.of(storage));
        when(sharedStorageMemberRepository.findByStorage_IdxAndUser_Idx(50L, 1L)).thenReturn(Optional.of(membership));

        assertThrows(BaseException.class, () -> sharedStorageService.completeUpload(
                1L,
                50L,
                new StorageShareDto.CompleteUploadReq(
                        null,
                        null,
                        "stolen.pdf",
                        "pdf",
                        128L,
                        "shared-storage/50/1_valid-uuid_stolen.pdf",
                        List.of("2/victim-secret.pdf")
                )
        ));

        verify(uploadObjectStorageService, never()).ensureAllUploaded(anyList());
        verify(uploadObjectStorageService, never()).composeFinalObject(anyString(), anyList());
        verify(uploadObjectStorageService, never()).deleteObjectKeys(anyList());
    }

    @Test
    void removedMemberCannotRenameTrashRestoreOrDeleteSharedStorageViaStaleDriveFolder() {
        User exMember = User.builder().idx(99L).email("ex@example.com").name("탈퇴멤버").build();
        SharedStorage storage = SharedStorage.builder()
                .idx(50L)
                .name("공동 저장소")
                .creator(exMember)
                .status(SharedStorageStatus.ACTIVE)
                .build();

        when(sharedStorageMemberRepository.findByStorage_IdxAndUser_Idx(50L, 99L)).thenReturn(Optional.empty());

        sharedStorageService.handleDriveFolderRename(99L, 50L, "탈취이름");
        boolean moved = sharedStorageService.handleDriveFolderMoveToTrash(99L, 50L, LocalDateTime.now());
        sharedStorageService.handleDriveFolderRestore(99L, 50L);
        sharedStorageService.handleDriveFolderPermanentDelete(99L, 50L);

        assertTrue(moved);
        assertEquals("공동 저장소", storage.getName());
        assertEquals(SharedStorageStatus.ACTIVE, storage.getStatus());
        verify(sharedStorageRepository, never()).delete(any());
        verify(sharedStorageRepository, never()).saveAndFlush(any());
    }

    @Test
    void removeMemberApprovalDeletesRemovedMembersLinkedDriveFolder() {
        User owner = User.builder().idx(1L).email("owner@example.com").name("소유자").build();
        User removed = User.builder().idx(2L).email("removed@example.com").name("제외멤버").build();
        SharedStorage storage = SharedStorage.builder()
                .idx(50L)
                .name("팀 저장소")
                .creator(owner)
                .status(SharedStorageStatus.ACTIVE)
                .build();
        SharedStorageMember ownerMember = SharedStorageMember.builder()
                .idx(501L).storage(storage).user(owner).role(MemberRole.OWNER).status(MemberStatus.ACTIVE).contributionBytes(10L * GB).build();
        SharedStorageMember targetMember = SharedStorageMember.builder()
                .idx(502L).storage(storage).user(removed).role(MemberRole.MEMBER).status(MemberStatus.ACTIVE).contributionBytes(0L).build();
        SharedStorageApproval approval = SharedStorageApproval.builder()
                .idx(901L).storage(storage).approvalType(ApprovalType.REMOVE_MEMBER).status(ApprovalStatus.PENDING)
                .requester(owner).targetUserIdx(2L).targetLabel("제외").expiresAt(LocalDateTime.now().plusDays(7)).build();
        SharedStorageApprovalVote vote1 = SharedStorageApprovalVote.builder().approval(approval).voter(owner).approved(true).build();
        SharedStorageApprovalVote vote2 = SharedStorageApprovalVote.builder().approval(approval).voter(removed).approved(true).build();
        FileInfo staleDriveFolder = FileInfo.builder()
                .idx(777L).user(removed).nodeType(FileNodeType.FOLDER).fileSaveName("shared-storage-50-uuid").build();

        when(userRepository.findById(2L)).thenReturn(Optional.of(removed));
        when(sharedStorageRepository.findWithCreatorByIdx(50L)).thenReturn(Optional.of(storage));
        when(sharedStorageMemberRepository.findByStorage_IdxAndUser_Idx(50L, 2L))
                .thenReturn(Optional.of(targetMember), Optional.of(targetMember), Optional.empty());
        when(sharedStorageApprovalRepository.findByIdxAndStorage_Idx(901L, 50L)).thenReturn(Optional.of(approval));
        when(sharedStorageApprovalVoteRepository.findByApproval_IdxAndVoter_Idx(901L, 2L)).thenReturn(Optional.empty());
        when(sharedStorageMemberRepository.findAllByStorage_IdxAndStatus(50L, MemberStatus.ACTIVE))
                .thenReturn(List.of(ownerMember, targetMember), List.of(ownerMember));
        when(sharedStorageApprovalVoteRepository.findAllByApproval_Idx(901L)).thenReturn(List.of(vote1, vote2));
        when(fileUpDownloadRepository.findFirstByUser_IdxAndFileSaveNameStartingWithOrderByIdxAsc(2L, "shared-storage-50-"))
                .thenReturn(Optional.of(staleDriveFolder));

        sharedStorageService.voteApproval(2L, 50L, 901L, new StorageShareDto.VoteApprovalReq(true));

        verify(sharedStorageMemberRepository).delete(targetMember);
        verify(fileUpDownloadRepository).delete(staleDriveFolder);
    }

    private static StoragePlanService.StorageQuota quota(long totalBytes) {
        return new StoragePlanService.StorageQuota(
                "PREMIUM",
                "프리미엄",
                "프리미엄",
                totalBytes,
                0L,
                totalBytes,
                true,
                true,
                20L * GB,
                300
        );
    }
}
