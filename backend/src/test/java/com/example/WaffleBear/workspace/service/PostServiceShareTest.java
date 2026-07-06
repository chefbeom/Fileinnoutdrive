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
