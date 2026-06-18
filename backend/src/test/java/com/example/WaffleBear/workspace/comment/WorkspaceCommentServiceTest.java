package com.example.WaffleBear.workspace.comment;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.stomp.ClusteredStompPublisher;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.PostRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkspaceCommentServiceTest {

    @Mock
    WorkspaceCommentRepository workspaceCommentRepository;

    @Mock
    PostRepository postRepository;

    @Mock
    UserPostRepository userPostRepository;

    @Mock
    UserRepository userRepository;

    @Mock
    ClusteredStompPublisher stompPublisher;

    @Mock
    NotificationService notificationService;

    @InjectMocks
    WorkspaceCommentService workspaceCommentService;

    @Test
    void memberCanCreateWorkspaceComment() {
        User author = User.builder()
                .idx(7L)
                .email("writer@example.com")
                .name("Writer")
                .build();
        Post workspace = Post.builder()
                .idx(42L)
                .title("Product notes")
                .contents("{}")
                .build();
        UserPost relation = UserPost.builder()
                .user(author)
                .workspace(workspace)
                .Level(AccessRole.WRITE)
                .build();

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(7L, 42L)).thenReturn(Optional.of(relation));
        when(userRepository.findById(7L)).thenReturn(Optional.of(author));
        when(workspaceCommentRepository.save(any(WorkspaceComment.class))).thenAnswer(invocation -> invocation.getArgument(0));

        WorkspaceCommentDto.ResComment result = workspaceCommentService.create(
                42L,
                7L,
                new WorkspaceCommentDto.ReqCreate(
                        "  Please review this section.  ",
                        "block-abc123",
                        "header",
                        "  Product strategy heading  "
                )
        );

        assertThat(result.workspaceIdx()).isEqualTo(42L);
        assertThat(result.authorIdx()).isEqualTo(7L);
        assertThat(result.contents()).isEqualTo("Please review this section.");
        assertThat(result.anchorBlockId()).isEqualTo("block-abc123");
        assertThat(result.anchorBlockType()).isEqualTo("header");
        assertThat(result.anchorText()).isEqualTo("Product strategy heading");
        assertThat(result.resolved()).isFalse();

        ArgumentCaptor<WorkspaceCommentDto.CommentEvent> eventCaptor =
                ArgumentCaptor.forClass(WorkspaceCommentDto.CommentEvent.class);
        verify(stompPublisher).send(eq("/sub/workspace/comments/42"), eventCaptor.capture());
        assertThat(eventCaptor.getValue().action()).isEqualTo("UPSERT");
        assertThat(eventCaptor.getValue().actorUserIdx()).isEqualTo(7L);
        assertThat(eventCaptor.getValue().comment().contents()).isEqualTo("Please review this section.");
        assertThat(eventCaptor.getValue().comment().anchorBlockId()).isEqualTo("block-abc123");
    }

    @Test
    void mentionedWorkspaceMemberReceivesCommentNotification() {
        User author = User.builder()
                .idx(7L)
                .email("writer@example.com")
                .name("Writer")
                .build();
        User teammate = User.builder()
                .idx(8L)
                .email("teammate@example.com")
                .name("Teammate")
                .build();
        Post workspace = Post.builder()
                .idx(42L)
                .title("Product notes")
                .contents("{}")
                .UUID("workspace-uuid")
                .build();
        UserPost authorRelation = UserPost.builder()
                .user(author)
                .workspace(workspace)
                .Level(AccessRole.WRITE)
                .build();
        UserPost teammateRelation = UserPost.builder()
                .user(teammate)
                .workspace(workspace)
                .Level(AccessRole.READ)
                .build();

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(7L, 42L)).thenReturn(Optional.of(authorRelation));
        when(userRepository.findById(7L)).thenReturn(Optional.of(author));
        when(workspaceCommentRepository.save(any(WorkspaceComment.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(userPostRepository.findAllByWorkspace_idx(42L)).thenReturn(List.of(authorRelation, teammateRelation));

        workspaceCommentService.create(
                42L,
                7L,
                new WorkspaceCommentDto.ReqCreate(
                        "Please check this, @teammate@example.com",
                        null,
                        null,
                        null
                )
        );

        verify(notificationService).sendWorkspaceMentionNotification(
                8L,
                "workspace-uuid",
                "Product notes",
                "Writer"
        );
    }

    @Test
    void nonAuthorNonAdminCannotDeleteWorkspaceComment() {
        User author = User.builder()
                .idx(7L)
                .email("author@example.com")
                .name("Author")
                .build();
        User other = User.builder()
                .idx(8L)
                .email("other@example.com")
                .name("Other")
                .build();
        Post workspace = Post.builder()
                .idx(42L)
                .title("Product notes")
                .contents("{}")
                .build();
        UserPost relation = UserPost.builder()
                .user(other)
                .workspace(workspace)
                .Level(AccessRole.WRITE)
                .build();
        WorkspaceComment comment = WorkspaceComment.builder()
                .idx(99L)
                .workspace(workspace)
                .author(author)
                .contents("Only the author can delete this comment.")
                .build();

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(8L, 42L)).thenReturn(Optional.of(relation));
        when(workspaceCommentRepository.findByIdxAndWorkspace_Idx(99L, 42L)).thenReturn(Optional.of(comment));

        assertThatThrownBy(() -> workspaceCommentService.delete(42L, 99L, 8L))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.WORKSPACE_ACCESS_DENIED);
    }

    @Test
    void adminCanDeleteWorkspaceComment() {
        User author = User.builder()
                .idx(7L)
                .email("author@example.com")
                .name("Author")
                .build();
        User admin = User.builder()
                .idx(9L)
                .email("admin@example.com")
                .name("Admin")
                .build();
        Post workspace = Post.builder()
                .idx(42L)
                .title("Product notes")
                .contents("{}")
                .build();
        UserPost relation = UserPost.builder()
                .user(admin)
                .workspace(workspace)
                .Level(AccessRole.ADMIN)
                .build();
        WorkspaceComment comment = WorkspaceComment.builder()
                .idx(99L)
                .workspace(workspace)
                .author(author)
                .contents("Admin can remove this comment.")
                .build();

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(9L, 42L)).thenReturn(Optional.of(relation));
        when(workspaceCommentRepository.findByIdxAndWorkspace_Idx(99L, 42L)).thenReturn(Optional.of(comment));

        BaseResponseStatus result = workspaceCommentService.delete(42L, 99L, 9L);

        assertThat(result).isEqualTo(BaseResponseStatus.SUCCESS);
        verify(workspaceCommentRepository).delete(comment);

        ArgumentCaptor<WorkspaceCommentDto.CommentEvent> eventCaptor =
                ArgumentCaptor.forClass(WorkspaceCommentDto.CommentEvent.class);
        verify(stompPublisher).send(eq("/sub/workspace/comments/42"), eventCaptor.capture());
        assertThat(eventCaptor.getValue().action()).isEqualTo("DELETE");
        assertThat(eventCaptor.getValue().actorUserIdx()).isEqualTo(9L);
        assertThat(eventCaptor.getValue().commentIdx()).isEqualTo(99L);
    }
}
