package com.example.WaffleBear.workspace.revision;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.post.PostDto;
import com.example.WaffleBear.workspace.model.post.isShare;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkspaceRevisionServiceTest {

    @Mock
    WorkspaceRevisionRepository workspaceRevisionRepository;

    @Mock
    UserPostRepository userPostRepository;

    @Mock
    PostRepository postRepository;

    @InjectMocks
    WorkspaceRevisionService workspaceRevisionService;

    @Test
    void writeMemberCanRestoreWorkspaceRevision() {
        User actor = User.builder()
                .idx(7L)
                .email("writer@example.com")
                .name("Writer")
                .build();
        Post workspace = Post.builder()
                .idx(42L)
                .title("Current title")
                .contents("{\"blocks\":[]}")
                .type(false)
                .status(isShare.Private)
                .UUID("workspace-uuid")
                .build();
        UserPost relation = UserPost.builder()
                .user(actor)
                .workspace(workspace)
                .Level(AccessRole.WRITE)
                .build();
        WorkspaceRevision revision = WorkspaceRevision.builder()
                .idx(99L)
                .workspace(workspace)
                .actor(actor)
                .title("Restored title")
                .contents("{\"blocks\":[{\"type\":\"paragraph\"}]}")
                .reason("SAVE")
                .build();

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(7L, 42L)).thenReturn(Optional.of(relation));
        when(workspaceRevisionRepository.findByIdxAndWorkspace_Idx(99L, 42L)).thenReturn(Optional.of(revision));
        when(workspaceRevisionRepository.findTopByWorkspace_IdxOrderByCreatedAtDescIdxDesc(42L)).thenReturn(Optional.empty());

        PostDto.ResPost result = workspaceRevisionService.restore(42L, 99L, 7L);

        assertThat(result.title()).isEqualTo("Restored title");
        assertThat(result.contents()).isEqualTo("{\"blocks\":[{\"type\":\"paragraph\"}]}");
        assertThat(result.accessRole()).isEqualTo(AccessRole.WRITE);
        verify(postRepository).save(workspace);

        ArgumentCaptor<WorkspaceRevision> revisionCaptor = ArgumentCaptor.forClass(WorkspaceRevision.class);
        verify(workspaceRevisionRepository).save(revisionCaptor.capture());
        assertThat(revisionCaptor.getValue().getWorkspace()).isSameAs(workspace);
        assertThat(revisionCaptor.getValue().getActor()).isSameAs(actor);
        assertThat(revisionCaptor.getValue().getTitle()).isEqualTo("Restored title");
        assertThat(revisionCaptor.getValue().getReason()).isEqualTo("RESTORE");
    }

    @Test
    void readOnlyMemberCannotRestoreWorkspaceRevision() {
        User reader = User.builder()
                .idx(8L)
                .email("reader@example.com")
                .name("Reader")
                .build();
        Post workspace = Post.builder()
                .idx(42L)
                .title("Current title")
                .contents("{}")
                .type(false)
                .status(isShare.Private)
                .UUID("workspace-uuid")
                .build();
        UserPost relation = UserPost.builder()
                .user(reader)
                .workspace(workspace)
                .Level(AccessRole.READ)
                .build();

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(8L, 42L)).thenReturn(Optional.of(relation));

        assertThatThrownBy(() -> workspaceRevisionService.restore(42L, 99L, 8L))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.WORKSPACE_ACCESS_DENIED);

        verify(postRepository, never()).save(any(Post.class));
        verify(workspaceRevisionRepository, never()).save(any(WorkspaceRevision.class));
    }

    @Test
    void recordSaveSkipsDuplicateLatestSnapshot() {
        User actor = User.builder()
                .idx(7L)
                .email("writer@example.com")
                .name("Writer")
                .build();
        Post workspace = Post.builder()
                .idx(42L)
                .title("Same title")
                .contents("{\"blocks\":[]}")
                .type(false)
                .status(isShare.Private)
                .UUID("workspace-uuid")
                .build();
        WorkspaceRevision latest = WorkspaceRevision.builder()
                .idx(100L)
                .workspace(workspace)
                .actor(actor)
                .title("Same title")
                .contents("{\"blocks\":[]}")
                .reason("RESTORE")
                .build();

        when(workspaceRevisionRepository.findTopByWorkspace_IdxOrderByCreatedAtDescIdxDesc(42L)).thenReturn(Optional.of(latest));

        workspaceRevisionService.recordSave(workspace, actor);

        verify(workspaceRevisionRepository, never()).save(any(WorkspaceRevision.class));
    }
}
