package com.example.WaffleBear.workspace.preference;

import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkspacePreferenceServiceTest {

    @Mock
    WorkspacePreferenceRepository workspacePreferenceRepository;

    @Mock
    UserRepository userRepository;

    @Mock
    UserPostRepository userPostRepository;

    @Spy
    ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    WorkspacePreferenceService workspacePreferenceService;

    @Test
    void returnsEmptyPreferenceWhenUserHasNoSavedPreference() {
        when(workspacePreferenceRepository.findByUser_Idx(7L)).thenReturn(Optional.empty());

        WorkspacePreferenceDto.ResPreference result = workspacePreferenceService.get(7L);

        assertThat(result.favoriteWorkspaceIds()).isEmpty();
        assertThat(result.recentWorkspaceIds()).isEmpty();
        assertThat(result.documentSections()).isEmpty();
        assertThat(result.pageIndexViews()).isEmpty();
        assertThat(result.updatedAt()).isNull();
    }

    @Test
    void saveNormalizesPreferenceToAccessibleWorkspaces() {
        User user = User.builder()
                .idx(7L)
                .email("writer@example.com")
                .name("Writer")
                .build();
        UserPost firstRelation = relation(user, 101L);
        UserPost secondRelation = relation(user, 102L);

        when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        when(userPostRepository.findAllByUser_IdxOrderByWorkspaceUpdatedAtDesc(7L))
                .thenReturn(List.of(firstRelation, secondRelation));
        when(workspacePreferenceRepository.findByUser_Idx(7L)).thenReturn(Optional.empty());
        when(workspacePreferenceRepository.saveAndFlush(any(WorkspacePreference.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        WorkspacePreferenceDto.ResPreference result = workspacePreferenceService.save(
                7L,
                new WorkspacePreferenceDto.ReqPreference(
                        List.of("101", "999", "101", "102"),
                        List.of("102", "missing", "101"),
                        List.of(
                                new WorkspacePreferenceDto.DocumentSection(
                                        " section-a ",
                                        " Team Docs ",
                                        true,
                                        List.of("101", "999", "102", "101")
                                )
                        ),
                        List.of(
                                new WorkspacePreferenceDto.PageIndexView(
                                        "view-a",
                                        "Active",
                                        "active",
                                        "  roadmap  ",
                                        " Product ",
                                        "OWNER@EXAMPLE.COM",
                                        "due-asc"
                                ),
                                new WorkspacePreferenceDto.PageIndexView(
                                        "view-b",
                                        "active",
                                        "broken",
                                        "",
                                        "",
                                        "",
                                        "broken"
                                )
                        )
                )
        );

        assertThat(result.favoriteWorkspaceIds()).containsExactly("101", "102");
        assertThat(result.recentWorkspaceIds()).containsExactly("102", "101");
        assertThat(result.documentSections()).hasSize(1);
        assertThat(result.documentSections().get(0).id()).isEqualTo("section-a");
        assertThat(result.documentSections().get(0).name()).isEqualTo("Team Docs");
        assertThat(result.documentSections().get(0).collapsed()).isTrue();
        assertThat(result.documentSections().get(0).documentIds()).containsExactly("101", "102");
        assertThat(result.pageIndexViews()).hasSize(1);
        assertThat(result.pageIndexViews().get(0).filter()).isEqualTo("active");
        assertThat(result.pageIndexViews().get(0).query()).isEqualTo("roadmap");
        assertThat(result.pageIndexViews().get(0).tag()).isEqualTo("product");
        assertThat(result.pageIndexViews().get(0).owner()).isEqualTo("owner@example.com");
        assertThat(result.pageIndexViews().get(0).sort()).isEqualTo("due-asc");

        ArgumentCaptor<WorkspacePreference> preferenceCaptor =
                ArgumentCaptor.forClass(WorkspacePreference.class);
        verify(workspacePreferenceRepository).saveAndFlush(preferenceCaptor.capture());
        assertThat(preferenceCaptor.getValue().getFavoriteWorkspaceIds()).contains("\"101\"", "\"102\"");
        assertThat(preferenceCaptor.getValue().getFavoriteWorkspaceIds()).doesNotContain("999");
        assertThat(preferenceCaptor.getValue().getDocumentSections()).contains("section-a", "Team Docs");
    }

    @Test
    void readsStoredPreferenceJsonAndFallsBackOnBrokenLists() {
        LocalDateTime updatedAt = LocalDateTime.of(2026, 6, 18, 12, 0);
        User user = User.builder()
                .idx(7L)
                .email("writer@example.com")
                .name("Writer")
                .build();
        WorkspacePreference preference = WorkspacePreference.builder()
                .favoriteWorkspaceIds("[\"101\"]")
                .recentWorkspaceIds("not-json")
                .documentSections("[{\"id\":\"section-a\",\"name\":\"Team Docs\",\"collapsed\":false,\"documentIds\":[\"101\"]}]")
                .pageIndexViews("[{\"id\":\"view-a\",\"name\":\"Active\",\"filter\":\"active\",\"query\":\"\",\"tag\":\"\",\"owner\":\"\",\"sort\":\"updated-desc\"}]")
                .updatedAt(updatedAt)
                .build();

        when(workspacePreferenceRepository.findByUser_Idx(7L)).thenReturn(Optional.of(preference));
        when(userPostRepository.findAllByUser_IdxOrderByWorkspaceUpdatedAtDesc(7L))
                .thenReturn(List.of(relation(user, 101L)));

        WorkspacePreferenceDto.ResPreference result = workspacePreferenceService.get(7L);

        assertThat(result.favoriteWorkspaceIds()).containsExactly("101");
        assertThat(result.recentWorkspaceIds()).isEmpty();
        assertThat(result.documentSections()).hasSize(1);
        assertThat(result.pageIndexViews()).hasSize(1);
        assertThat(result.updatedAt()).isEqualTo(updatedAt);
    }

    private UserPost relation(User user, Long workspaceIdx) {
        Post workspace = Post.builder()
                .idx(workspaceIdx)
                .title("Workspace " + workspaceIdx)
                .contents("{}")
                .build();
        return UserPost.builder()
                .user(user)
                .workspace(workspace)
                .Level(AccessRole.WRITE)
                .build();
    }
}
