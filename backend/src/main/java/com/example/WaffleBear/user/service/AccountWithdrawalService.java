package com.example.WaffleBear.user.service;

import com.example.WaffleBear.administrator.storage.DataTransferLedgerRepository;
import com.example.WaffleBear.chat.ChatMessageRepository;
import com.example.WaffleBear.chat.ChatRoomService;
import com.example.WaffleBear.chat.ParticipantsRepository;
import com.example.WaffleBear.chat.model.entity.ChatParticipants;
import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.sse.SseEmitterStore;
import com.example.WaffleBear.email.EmailVerifyRepository;
import com.example.WaffleBear.feater.FeaterService;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.service.FileUpDownloadMinioService;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.version.FileVersionRepository;
import com.example.WaffleBear.group.repository.RelationshipGroupInviteRepository;
import com.example.WaffleBear.group.repository.RelationshipGroupMappingRepository;
import com.example.WaffleBear.group.repository.RelationshipGroupRepository;
import com.example.WaffleBear.group.repository.RelationshipInviteRepository;
import com.example.WaffleBear.group.repository.RelationshipRepository;
import com.example.WaffleBear.notification.NotificationListRepository;
import com.example.WaffleBear.notification.NotificationRepository;
import com.example.WaffleBear.mediaphoto.MediaPhotoLibraryRepository;
import com.example.WaffleBear.order.repository.OrderRepository;
import com.example.WaffleBear.storageshare.repository.StorageGrantRepository;
import com.example.WaffleBear.storageshare.service.SharedStorageService;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserDto;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.asset.WorkspaceAssetService;
import com.example.WaffleBear.workspace.comment.WorkspaceCommentRepository;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.preference.WorkspacePreferenceRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import com.example.WaffleBear.workspace.revision.WorkspaceRevisionRepository;
import com.example.WaffleBear.workspace.service.PostService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class AccountWithdrawalService {

    private static final Set<String> SOCIAL_PROVIDERS = Set.of("google", "kakao", "naver");
    private static final String CONFIRMATION_PHRASE = "회원탈퇴";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final StoragePlanService storagePlanService;
    private final DemoAccountService demoAccountService;
    private final AuthService authService;
    private final FeaterService featerService;
    private final FileUpDownloadMinioService fileUpDownloadMinioService;
    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final ShareRepository shareRepository;
    private final FileVersionRepository fileVersionRepository;
    private final WorkspacePreferenceRepository workspacePreferenceRepository;
    private final UserPostRepository userPostRepository;
    private final PostService postService;
    private final WorkspaceAssetService workspaceAssetService;
    private final WorkspaceCommentRepository workspaceCommentRepository;
    private final WorkspaceRevisionRepository workspaceRevisionRepository;
    private final RelationshipGroupMappingRepository relationshipGroupMappingRepository;
    private final RelationshipGroupInviteRepository relationshipGroupInviteRepository;
    private final RelationshipInviteRepository relationshipInviteRepository;
    private final RelationshipRepository relationshipRepository;
    private final RelationshipGroupRepository relationshipGroupRepository;
    private final ParticipantsRepository participantsRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatRoomService chatRoomService;
    private final OrderRepository orderRepository;
    private final DataTransferLedgerRepository dataTransferLedgerRepository;
    private final NotificationRepository notificationRepository;
    private final NotificationListRepository notificationListRepository;
    private final EmailVerifyRepository emailVerifyRepository;
    private final SseEmitterStore sseEmitterStore;

    @Autowired(required = false)
    private StorageGrantRepository storageGrantRepository;

    @Autowired(required = false)
    private SharedStorageService sharedStorageService;

    @Autowired(required = false)
    private MediaPhotoLibraryRepository mediaPhotoLibraryRepository;

    @Transactional
    public UserDto.WithdrawRes withdrawAccount(Long userIdx, UserDto.WithdrawReq request) {
        if (userIdx == null || userIdx <= 0L) {
            throw BaseException.from(BaseResponseStatus.USER_NOT_FOUND);
        }

        User user = userRepository.findById(userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.USER_NOT_FOUND));

        if (storagePlanService.isAdministrator(user) || demoAccountService.isDemoEmail(user.getEmail())) {
            throw BaseException.from(BaseResponseStatus.WITHDRAW_PROTECTED_ACCOUNT);
        }

        verifyWithdrawalRequest(user, request);

        String email = user.getEmail();

        // 1. 드라이브 파일, 공유, 버전 및 MinIO 오브젝트 삭제
        cleanupDriveAndShares(userIdx);
        if (storageGrantRepository != null) {
            storageGrantRepository.deleteAllByGranter_IdxOrRecipient_Idx(userIdx, userIdx);
        }
        if (sharedStorageService != null) {
            sharedStorageService.cleanupUserSharedStoragesOnWithdrawal(userIdx);
        }
        if (mediaPhotoLibraryRepository != null) {
            mediaPhotoLibraryRepository.deleteAllByUser_Idx(userIdx);
        }

        // 2. 개인/협업 워크스페이스 및 관련 에셋/댓글/리비전/설정 삭제
        cleanupWorkspaces(userIdx);

        // 3. 그룹 및 관계 데이터 삭제
        cleanupGroupsAndRelationships(userIdx, email);

        // 4. 채팅방 퇴장 및 발신 메시지 삭제
        cleanupChatData(userIdx);

        // 5. 결제 내역 및 전송 원장 삭제
        orderRepository.deleteAllByUser_Idx(userIdx);
        dataTransferLedgerRepository.deleteAllByUser_Idx(userIdx);

        // 6. 프로필 설정 및 프로필 이미지 삭제
        featerService.deleteAccountSettings(userIdx);

        // 7. 알림, 이메일 인증 토큰, 리프레시 토큰, SSE 세션 정리
        notificationRepository.deleteAllByUserIdx(userIdx);
        notificationListRepository.deleteAllByReceiverUserIdx(userIdx);
        if (email != null && !email.isBlank()) {
            emailVerifyRepository.deleteAllByEmailIgnoreCase(email.trim());
            authService.logoutAllByEmail(email.trim());
        }
        sseEmitterStore.remove(userIdx);

        // 8. 회원 레코드 최종 삭제
        userRepository.delete(user);
        userRepository.flush();

        return UserDto.WithdrawRes.builder()
                .userIdx(userIdx)
                .email(email)
                .withdrawn(true)
                .build();
    }

    private void verifyWithdrawalRequest(User user, UserDto.WithdrawReq request) {
        if (isSocialAccount(user)) {
            String confirmation = request != null && request.confirmationText() != null
                    ? request.confirmationText().trim()
                    : "";
            boolean matchesPhrase = CONFIRMATION_PHRASE.equals(confirmation)
                    || "회원 탈퇴".equals(confirmation);
            boolean matchesEmail = user.getEmail() != null
                    && user.getEmail().trim().equalsIgnoreCase(confirmation);

            if (!matchesPhrase && !matchesEmail) {
                throw BaseException.from(BaseResponseStatus.WITHDRAW_CONFIRMATION_MISMATCH);
            }
            return;
        }

        String rawPassword = request != null && request.password() != null
                ? request.password()
                : "";
        if (rawPassword.isBlank()
                || user.getPassword() == null
                || !passwordEncoder.matches(rawPassword, user.getPassword())) {
            throw BaseException.from(BaseResponseStatus.WITHDRAW_INVALID_PASSWORD);
        }
    }

    private boolean isSocialAccount(User user) {
        if (user == null || user.getPassword() == null) {
            return false;
        }
        String normalized = user.getPassword().trim().toLowerCase(Locale.ROOT);
        return SOCIAL_PROVIDERS.contains(normalized);
    }

    private void cleanupDriveAndShares(Long userIdx) {
        fileUpDownloadMinioService.resetOwnedData(userIdx);

        List<FileShare> receivedShares = shareRepository.findAllByRecipient_IdxOrderByCreatedAtDesc(userIdx);
        for (FileShare share : receivedShares) {
            FileInfo file = share.getFile();
            shareRepository.delete(share);
            shareRepository.flush();
            if (file != null && file.getIdx() != null) {
                long remaining = shareRepository.countByFile_Idx(file.getIdx());
                file.changeSharedFile(remaining > 0);
                fileUpDownloadRepository.save(file);
            }
        }

        List<FileShare> remainingOwnedShares = shareRepository.findAllByOwner_IdxOrderByCreatedAtDesc(userIdx);
        if (!remainingOwnedShares.isEmpty()) {
            shareRepository.deleteAll(remainingOwnedShares);
        }

        fileVersionRepository.deleteAllByUser_Idx(userIdx);
    }

    private void cleanupWorkspaces(Long userIdx) {
        workspacePreferenceRepository.deleteAllByUser_Idx(userIdx);

        List<UserPost> relations = userPostRepository.findAllByUser_IdxOrderByWorkspaceUpdatedAtDesc(userIdx);
        for (UserPost relation : relations) {
            if (relation.getWorkspace() == null || relation.getWorkspace().getIdx() == null) {
                continue;
            }
            Long workspaceIdx = relation.getWorkspace().getIdx();
            if (AccessRole.ADMIN.equals(relation.getLevel())) {
                boolean hasOtherAdmin = userPostRepository.findAllByWorkspace_idx(workspaceIdx).stream()
                        .anyMatch(member -> member.getUser() != null
                                && !Objects.equals(member.getUser().getIdx(), userIdx)
                                && AccessRole.ADMIN.equals(member.getLevel()));
                if (hasOtherAdmin) {
                    postService.list_delete(workspaceIdx, userIdx);
                } else {
                    postService.delete(workspaceIdx, userIdx);
                }
            } else {
                postService.list_delete(workspaceIdx, userIdx);
            }
        }

        workspaceCommentRepository.deleteAllByAuthor_Idx(userIdx);
        workspaceRevisionRepository.deleteAllByActor_Idx(userIdx);
        workspaceAssetService.deleteAllUploaderAssets(userIdx);
        userPostRepository.deleteAllByUser_Idx(userIdx);
    }

    private void cleanupGroupsAndRelationships(Long userIdx, String email) {
        relationshipGroupMappingRepository.deleteAllByParticipantUserIdx(userIdx);
        relationshipGroupInviteRepository.deleteAllByParticipantUserIdx(userIdx);
        relationshipInviteRepository.deleteAllByUserIdxOrEmail(userIdx, email == null ? "" : email.trim());
        relationshipRepository.deleteAllByUser_IdxOrTargetUser_Idx(userIdx, userIdx);
        relationshipGroupRepository.deleteAllByUser_Idx(userIdx);
    }

    private void cleanupChatData(Long userIdx) {
        List<Long> roomIds = participantsRepository.findAllByUsersIdx(userIdx).stream()
                .map(ChatParticipants::getChatRooms)
                .filter(Objects::nonNull)
                .map(room -> room.getIdx())
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        chatMessageRepository.deleteAllBySenderIdx(userIdx);

        for (Long roomId : roomIds) {
            chatRoomService.exit(roomId, userIdx);
        }
    }
}
