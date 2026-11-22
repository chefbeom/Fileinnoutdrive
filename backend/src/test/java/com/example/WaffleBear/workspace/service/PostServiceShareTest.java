package com.example.WaffleBear.workspace.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.config.sse.SseService;
import com.example.WaffleBear.email.EmailVerifyRepository;
import com.example.WaffleBear.email.EmailVerifyService;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.asset.WorkspaceAssetService;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.post.PostDto;
import com.example.WaffleBear.workspace.model.post.isShare;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.PostRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import com.example.WaffleBear.workspace.revision.WorkspaceRevisionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static com.example.WaffleBear.common.model.BaseResponseStatus.ADMIN_ONLY_ACTION;
import static com.example.WaffleBear.common.model.BaseResponseStatus.WORKSPACE_NOT_ACCESSIBLE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PostServiceShareTest {

    @Mock
    SseService sseService;

    @Mock
    EmailVerifyRepository emailVerifyRepository;

    @Mock
    EmailVerifyService emailVerifyService;

    @Mock
    UserRepository userRepository;

    @Mock
    PostRepository postRepository;

    @Mock
    UserPostRepository userPostRepository;

    @Mock
    NotificationService notificationService;

    @Mock
    WorkspaceAssetService workspaceAssetService;

    @Mock
    WorkspaceRevisionService workspaceRevisionService;

    @InjectMocks
    PostService postService;

    @Test
    void adminCanShareWorkspaceWithReadRoleImmediately() {
        User owner = user(1L, "owner@example.com");
        User viewer = user(2L, "viewer@example.com");
        Post workspace = sharedWorkspace();
        UserPost ownerRelation = relation(owner, workspace, AccessRole.ADMIN);

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 42L)).thenReturn(Optional.of(ownerRelation));
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(2L, 42L)).thenReturn(Optional.empty());
        when(userRepository.findById(2L)).thenReturn(Optional.of(viewer));
        when(emailVerifyRepository.findByToken("workspace-uuid")).thenReturn(Optional.empty());

        int affectedCount = postService.shareWithUsers(42L, 1L, List.of(2L), AccessRole.READ);

        assertThat(affectedCount).isEqualTo(1);
        ArgumentCaptor<UserPost> relationCaptor = ArgumentCaptor.forClass(UserPost.class);
        verify(userPostRepository).save(relationCaptor.capture());
        assertThat(relationCaptor.getValue().getUser()).isSameAs(viewer);
        assertThat(relationCaptor.getValue().getWorkspace()).isSameAs(workspace);
        assertThat(relationCaptor.getValue().getLevel()).isEqualTo(AccessRole.READ);
        verify(notificationService).sendWorkspaceInviteNotification(
                2L,
                "workspace-uuid",
                "Roadmap"
        );
    }

    @Test
    void adminCanUpdateExistingNonAdminShareRole() {
        User owner = user(1L, "owner@example.com");
        User editor = user(2L, "editor@example.com");
        Post workspace = sharedWorkspace();
        UserPost ownerRelation = relation(owner, workspace, AccessRole.ADMIN);
        UserPost editorRelation = relation(editor, workspace, AccessRole.WRITE);

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 42L)).thenReturn(Optional.of(ownerRelation));
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(2L, 42L)).thenReturn(Optional.of(editorRelation));

        int affectedCount = postService.shareWithUsers(42L, 1L, List.of(2L), AccessRole.READ);

        assertThat(affectedCount).isEqualTo(1);
        assertThat(editorRelation.getLevel()).isEqualTo(AccessRole.READ);
        verify(sseService).sendRoleChanged(2L, 42L, "READ");
        verify(userPostRepository, never()).save(any(UserPost.class));
        verify(notificationService, never()).sendWorkspaceInviteNotification(any(), any(), any());
    }

    @Test
    void authorizeRealtimeAllowsWritableMembers() {
        User editor = user(2L, "editor@example.com");
        Post workspace = sharedWorkspace();
        UserPost editorRelation = relation(editor, workspace, AccessRole.WRITE);

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(2L, 42L)).thenReturn(Optional.of(editorRelation));

        PostDto.RealtimeAuthorizeRes result = postService.authorizeRealtime(42L, 2L, true);

        assertThat(result.workspaceIdx()).isEqualTo(42L);
        assertThat(result.accessRole()).isEqualTo(AccessRole.WRITE);
        assertThat(result.writable()).isTrue();
    }

    @Test
    void authorizeRealtimeRejectsReadOnlyMemberForWriteChannel() {
        User viewer = user(3L, "viewer@example.com");
        Post workspace = sharedWorkspace();
        UserPost viewerRelation = relation(viewer, workspace, AccessRole.READ);

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(3L, 42L)).thenReturn(Optional.of(viewerRelation));

        assertThatThrownBy(() -> postService.authorizeRealtime(42L, 3L, true))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void readOnlyMemberCannotInviteWorkspaceMember() {
        User viewer = user(2L, "viewer@example.com");
        Post workspace = sharedWorkspace();
        UserPost viewerRelation = relation(viewer, workspace, AccessRole.READ);

        when(postRepository.findByUUID("workspace-uuid")).thenReturn(Optional.of(workspace));
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(2L, 42L)).thenReturn(Optional.of(viewerRelation));

        assertThatThrownBy(() -> postService.invite(
                "workspace-uuid",
                "new@example.com",
                authUser(viewer),
                AccessRole.READ
        )).isInstanceOfSatisfying(BaseException.class, error ->
                assertThat(error.getStatus()).isEqualTo(ADMIN_ONLY_ACTION)
        );

        verify(userRepository, never()).findByEmail("new@example.com");
        verify(notificationService, never()).sendWorkspaceInviteNotification(any(), any(), any());
    }

    @Test
    void readOnlyMemberCannotChangeWorkspaceSharingState() {
        User viewer = user(2L, "viewer@example.com");
        Post workspace = sharedWorkspace();
        UserPost viewerRelation = relation(viewer, workspace, AccessRole.READ);

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(2L, 42L)).thenReturn(Optional.of(viewerRelation));

        assertThatThrownBy(() -> postService.isShared(
                42L,
                2L,
                new PostDto.ReqType(true, isShare.Public)
        )).isInstanceOfSatisfying(BaseException.class, error ->
                assertThat(error.getStatus()).isEqualTo(ADMIN_ONLY_ACTION)
        );

        verify(postRepository, never()).save(any(Post.class));
    }
    @Test
    void resolveByUuidRejectsNonShareablePublicWorkspaceAutoJoin() {
        User visitor = user(2L, "visitor@example.com");
        Post workspace = Post.builder()
                .idx(42L)
                .title("Private Public Flag")
                .contents("{}")
                .type(false)
                .status(isShare.Public)
                .UUID("non-shareable-uuid")
                .build();

        when(postRepository.findByUUID("non-shareable-uuid")).thenReturn(Optional.of(workspace));
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(2L, 42L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> postService.resolveByUuid(2L, "non-shareable-uuid"))
                .isInstanceOfSatisfying(BaseException.class, error ->
                        assertThat(error.getStatus()).isEqualTo(WORKSPACE_NOT_ACCESSIBLE));

        verify(userPostRepository, never()).save(any(UserPost.class));
    }

    @Test
    void adminCannotDemoteOrKickSelfOrFellowAdmin() {
        User actorAdmin = user(1L, "admin1@example.com");
        User fellowAdmin = user(2L, "admin2@example.com");
        Post workspace = sharedWorkspace();
        UserPost actorRelation = relation(actorAdmin, workspace, AccessRole.ADMIN);
        UserPost fellowRelation = relation(fellowAdmin, workspace, AccessRole.ADMIN);

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 42L)).thenReturn(Optional.of(actorRelation));
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(2L, 42L)).thenReturn(Optional.of(fellowRelation));

        assertThatThrownBy(() -> postService.changeSingleRole(42L, authUser(actorAdmin), 1L, "READ"))
                .isInstanceOfSatisfying(BaseException.class, error ->
                        assertThat(error.getStatus()).isEqualTo(ADMIN_ONLY_ACTION));
        assertThatThrownBy(() -> postService.changeSingleRole(42L, authUser(actorAdmin), 2L, "READ"))
                .isInstanceOfSatisfying(BaseException.class, error ->
                        assertThat(error.getStatus()).isEqualTo(ADMIN_ONLY_ACTION));
        assertThatThrownBy(() -> postService.kickMember(42L, authUser(actorAdmin), 1L))
                .isInstanceOfSatisfying(BaseException.class, error ->
                        assertThat(error.getStatus()).isEqualTo(ADMIN_ONLY_ACTION));
        assertThatThrownBy(() -> postService.kickMember(42L, authUser(actorAdmin), 2L))
                .isInstanceOfSatisfying(BaseException.class, error ->
                        assertThat(error.getStatus()).isEqualTo(ADMIN_ONLY_ACTION));

        verify(userPostRepository, never()).deleteByUser_IdxAndWorkspace_Idx(any(), any());
    }

    @Test
    void publicWorkspaceSelfJoinForcesReadRoleEvenWhenWriteRequested() {
        User visitor = user(5L, "visitor@example.com");
        Post publicWorkspace = Post.builder()
                .idx(99L)
                .title("Public Board")
                .contents("{}")
                .type(true)
                .status(isShare.Public)
                .UUID("public-uuid")
                .build();
        when(postRepository.findByUUID("public-uuid")).thenReturn(Optional.of(publicWorkspace));
        when(userRepository.findByEmail("visitor@example.com")).thenReturn(Optional.of(visitor));
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(5L, 99L)).thenReturn(Optional.empty());

        postService.invite("public-uuid", null, authUser(visitor), AccessRole.WRITE);

        ArgumentCaptor<UserPost> captor = ArgumentCaptor.forClass(UserPost.class);
        verify(userPostRepository).save(captor.capture());
        assertThat(captor.getValue().getLevel()).isEqualTo(AccessRole.READ);
    }

    @Test
    void changeSingleRoleRejectsAdminPromotionAndInvalidRole() {
        User admin = user(1L, "admin@example.com");
        User member = user(2L, "member@example.com");
        Post workspace = sharedWorkspace();
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 42L))
                .thenReturn(Optional.of(relation(admin, workspace, AccessRole.ADMIN)));
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(2L, 42L))
                .thenReturn(Optional.of(relation(member, workspace, AccessRole.READ)));

        assertThatThrownBy(() -> postService.changeSingleRole(42L, authUser(admin), 2L, "ADMIN"))
                .isInstanceOf(BaseException.class);
        assertThatThrownBy(() -> postService.changeSingleRole(42L, authUser(admin), 2L, "SUPERUSER"))
                .isInstanceOf(BaseException.class);
    }

    private User user(Long idx, String email) {
        return User.builder()
                .idx(idx)
                .email(email)
                .name(email)
                .build();
    }

    private AuthUserDetails authUser(User user) {
        return AuthUserDetails.builder()
                .idx(user.getIdx())
                .email(user.getEmail())
                .name(user.getName())
                .role("ROLE_USER")
                .build();
    }

    private Post sharedWorkspace() {
        return Post.builder()
                .idx(42L)
                .title("Roadmap")
                .contents("{}")
                .type(true)
                .status(isShare.Shared)
                .UUID("workspace-uuid")
                .build();
    }

    private UserPost relation(User user, Post workspace, AccessRole role) {
        return UserPost.builder()
                .user(user)
                .workspace(workspace)
                .Level(role)
                .build();
    }
}
