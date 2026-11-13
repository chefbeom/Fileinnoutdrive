package com.example.WaffleBear.user.service;

import com.example.WaffleBear.administrator.storage.DataTransferLedgerRepository;
import com.example.WaffleBear.chat.ChatMessageRepository;
import com.example.WaffleBear.chat.ChatRoomService;
import com.example.WaffleBear.chat.ParticipantsRepository;
import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.sse.SseEmitterStore;
import com.example.WaffleBear.email.EmailVerifyRepository;
import com.example.WaffleBear.feater.FeaterService;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.service.FileUpDownloadMinioService;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.file.version.FileVersionRepository;
import com.example.WaffleBear.group.repository.RelationshipGroupInviteRepository;
import com.example.WaffleBear.group.repository.RelationshipGroupMappingRepository;
import com.example.WaffleBear.group.repository.RelationshipGroupRepository;
import com.example.WaffleBear.group.repository.RelationshipInviteRepository;
import com.example.WaffleBear.group.repository.RelationshipRepository;
import com.example.WaffleBear.notification.NotificationListRepository;
import com.example.WaffleBear.notification.NotificationRepository;
import com.example.WaffleBear.order.repository.OrderRepository;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserDto;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.asset.WorkspaceAssetService;
import com.example.WaffleBear.workspace.comment.WorkspaceCommentRepository;
import com.example.WaffleBear.workspace.preference.WorkspacePreferenceRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import com.example.WaffleBear.workspace.revision.WorkspaceRevisionRepository;
import com.example.WaffleBear.workspace.service.PostService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AccountWithdrawalServiceTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private StoragePlanService storagePlanService;
    @Mock
    private DemoAccountService demoAccountService;
    @Mock
    private AuthService authService;
    @Mock
    private FeaterService featerService;
    @Mock
    private FileUpDownloadMinioService fileUpDownloadMinioService;
    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;
    @Mock
    private ShareRepository shareRepository;
    @Mock
    private FileVersionRepository fileVersionRepository;
    @Mock
    private WorkspacePreferenceRepository workspacePreferenceRepository;
    @Mock
    private UserPostRepository userPostRepository;
    @Mock
    private PostService postService;
    @Mock
    private WorkspaceAssetService workspaceAssetService;
    @Mock
    private WorkspaceCommentRepository workspaceCommentRepository;
    @Mock
    private WorkspaceRevisionRepository workspaceRevisionRepository;
    @Mock
    private RelationshipGroupMappingRepository relationshipGroupMappingRepository;
    @Mock
    private RelationshipGroupInviteRepository relationshipGroupInviteRepository;
    @Mock
    private RelationshipInviteRepository relationshipInviteRepository;
    @Mock
    private RelationshipRepository relationshipRepository;
    @Mock
    private RelationshipGroupRepository relationshipGroupRepository;
    @Mock
    private ParticipantsRepository participantsRepository;
    @Mock
    private ChatMessageRepository chatMessageRepository;
    @Mock
    private ChatRoomService chatRoomService;
    @Mock
    private OrderRepository orderRepository;
    @Mock
    private DataTransferLedgerRepository dataTransferLedgerRepository;
    @Mock
    private NotificationRepository notificationRepository;
    @Mock
    private NotificationListRepository notificationListRepository;
    @Mock
    private EmailVerifyRepository emailVerifyRepository;
    @Mock
    private SseEmitterStore sseEmitterStore;

    @InjectMocks
    private AccountWithdrawalService accountWithdrawalService;

    @Test
    void withdrawLocalAccountDeletesAllOwnedResourcesWhenPasswordMatches() {
        User user = User.builder()
                .idx(42L)
                .email("member@example.com")
                .name("일반회원")
                .password("$2a$10$encodedPassword")
                .enable(true)
                .role("ROLE_USER")
                .build();

        when(userRepository.findById(42L)).thenReturn(Optional.of(user));
        when(storagePlanService.isAdministrator(user)).thenReturn(false);
        when(demoAccountService.isDemoEmail("member@example.com")).thenReturn(false);
        when(passwordEncoder.matches("CorrectPassword1!", "$2a$10$encodedPassword")).thenReturn(true);
        when(shareRepository.findAllByRecipient_IdxOrderByCreatedAtDesc(42L)).thenReturn(List.of());
        when(shareRepository.findAllByOwner_IdxOrderByCreatedAtDesc(42L)).thenReturn(List.of());
        when(userPostRepository.findAllByUser_IdxOrderByWorkspaceUpdatedAtDesc(42L)).thenReturn(List.of());
        when(participantsRepository.findAllByUsersIdx(42L)).thenReturn(List.of());

        UserDto.WithdrawRes response = accountWithdrawalService.withdrawAccount(
                42L,
                new UserDto.WithdrawReq("CorrectPassword1!", null)
        );

        assertTrue(response.withdrawn());
        assertEquals(42L, response.userIdx());
        assertEquals("member@example.com", response.email());

        verify(fileUpDownloadMinioService).resetOwnedData(42L);
        verify(featerService).deleteAccountSettings(42L);
        verify(authService).logoutAllByEmail("member@example.com");
        verify(sseEmitterStore).remove(42L);
        verify(userRepository).delete(user);
    }

    @Test
    void withdrawLocalAccountThrowsWhenPasswordDoesNotMatch() {
        User user = User.builder()
                .idx(42L)
                .email("member@example.com")
                .name("일반회원")
                .password("$2a$10$encodedPassword")
                .enable(true)
                .role("ROLE_USER")
                .build();

        when(userRepository.findById(42L)).thenReturn(Optional.of(user));
        when(storagePlanService.isAdministrator(user)).thenReturn(false);
        when(demoAccountService.isDemoEmail("member@example.com")).thenReturn(false);
        when(passwordEncoder.matches("WrongPassword", "$2a$10$encodedPassword")).thenReturn(false);

        BaseException thrown = assertThrows(
                BaseException.class,
                () -> accountWithdrawalService.withdrawAccount(42L, new UserDto.WithdrawReq("WrongPassword", null))
        );

        assertEquals(BaseResponseStatus.WITHDRAW_INVALID_PASSWORD, thrown.getStatus());
        verify(userRepository, never()).delete(user);
    }

    @Test
    void withdrawSocialAccountSucceedsWithConfirmationPhraseOrEmail() {
        User socialUser = User.builder()
                .idx(77L)
                .email("googleuser@example.com")
                .name("구글회원")
                .password("google")
                .enable(true)
                .role("ROLE_USER")
                .build();

        when(userRepository.findById(77L)).thenReturn(Optional.of(socialUser));
        when(storagePlanService.isAdministrator(socialUser)).thenReturn(false);
        when(demoAccountService.isDemoEmail("googleuser@example.com")).thenReturn(false);
        when(shareRepository.findAllByRecipient_IdxOrderByCreatedAtDesc(77L)).thenReturn(List.of());
        when(shareRepository.findAllByOwner_IdxOrderByCreatedAtDesc(77L)).thenReturn(List.of());
        when(userPostRepository.findAllByUser_IdxOrderByWorkspaceUpdatedAtDesc(77L)).thenReturn(List.of());
        when(participantsRepository.findAllByUsersIdx(77L)).thenReturn(List.of());

        UserDto.WithdrawRes response = accountWithdrawalService.withdrawAccount(
                77L,
                new UserDto.WithdrawReq(null, "회원탈퇴")
        );

        assertTrue(response.withdrawn());
        verify(userRepository).delete(socialUser);
    }

    @Test
    void withdrawProtectedAccountThrowsForbiddenStatus() {
        User adminUser = User.builder()
                .idx(1L)
                .email("admin@example.com")
                .name("관리자")
                .password("$2a$10$encodedPassword")
                .enable(true)
                .role("ROLE_ADMIN")
                .build();

        when(userRepository.findById(1L)).thenReturn(Optional.of(adminUser));
        when(storagePlanService.isAdministrator(adminUser)).thenReturn(true);

        BaseException thrown = assertThrows(
                BaseException.class,
                () -> accountWithdrawalService.withdrawAccount(1L, new UserDto.WithdrawReq("any", "회원탈퇴"))
        );

        assertEquals(BaseResponseStatus.WITHDRAW_PROTECTED_ACCOUNT, thrown.getStatus());
        verify(userRepository, never()).delete(adminUser);
    }
}
