package com.example.WaffleBear.workspace.service;

import com.example.WaffleBear.config.sse.SseService;
import com.example.WaffleBear.email.EmailVerifyRepository;
import com.example.WaffleBear.email.EmailVerifyService;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.asset.WorkspaceAssetService;
import com.example.WaffleBear.workspace.model.post.Post;
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

import static org.assertj.core.api.Assertions.assertThat;
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

    private User user(Long idx, String email) {
        return User.builder()
                .idx(idx)
                .email(email)
                .name(email)
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
