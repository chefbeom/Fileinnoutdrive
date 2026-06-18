package com.example.WaffleBear.workspace.revision;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.post.PostDto;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.PostRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class WorkspaceRevisionService {

    private static final String SAVE_REASON = "SAVE";
    private static final String RESTORE_REASON = "RESTORE";

    private final WorkspaceRevisionRepository workspaceRevisionRepository;
    private final UserPostRepository userPostRepository;
    private final PostRepository postRepository;

    @Transactional(readOnly = true)
    public List<WorkspaceRevisionDto.ResSummary> list(Long workspaceIdx, Long userIdx) {
        requireAccess(workspaceIdx, userIdx);
        return workspaceRevisionRepository.findTop50ByWorkspace_IdxOrderByCreatedAtDescIdxDesc(workspaceIdx)
                .stream()
                .map(WorkspaceRevisionDto.ResSummary::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public WorkspaceRevisionDto.ResRevision read(Long workspaceIdx, Long revisionIdx, Long userIdx) {
        requireAccess(workspaceIdx, userIdx);
        WorkspaceRevision revision = findRevision(workspaceIdx, revisionIdx);
        return WorkspaceRevisionDto.ResRevision.from(revision);
    }

    @Transactional
    public PostDto.ResPost restore(Long workspaceIdx, Long revisionIdx, Long userIdx) {
        UserPost relation = requireEditableAccess(workspaceIdx, userIdx);
        WorkspaceRevision revision = findRevision(workspaceIdx, revisionIdx);
        Post workspace = relation.getWorkspace();
        workspace.update(revision.getTitle(), revision.getContents());
        postRepository.save(workspace);
        recordSnapshot(workspace, relation.getUser(), RESTORE_REASON);
        return PostDto.ResPost.from(workspace, relation.getLevel());
    }

    @Transactional
    public void recordSave(Post workspace, User actor) {
        recordSnapshot(workspace, actor, SAVE_REASON);
    }

    @Transactional
    public void recordSnapshot(Post workspace, User actor, String reason) {
        if (workspace == null || actor == null || workspace.getIdx() == null) {
            return;
        }

        String title = workspace.getTitle() == null ? "" : workspace.getTitle();
        String contents = workspace.getContents() == null ? "" : workspace.getContents();

        boolean sameAsLatest = workspaceRevisionRepository
                .findTopByWorkspace_IdxOrderByCreatedAtDescIdxDesc(workspace.getIdx())
                .map(latest -> Objects.equals(latest.getTitle(), title)
                        && Objects.equals(latest.getContents(), contents))
                .orElse(false);

        if (sameAsLatest) {
            return;
        }

        workspaceRevisionRepository.save(WorkspaceRevision.builder()
                .workspace(workspace)
                .actor(actor)
                .title(title)
                .contents(contents)
                .reason(reason == null || reason.isBlank() ? SAVE_REASON : reason)
                .build());
    }

    private UserPost requireAccess(Long workspaceIdx, Long userIdx) {
        return userPostRepository.findByUser_IdxAndWorkspace_Idx(userIdx, workspaceIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.WORKSPACE_ACCESS_DENIED));
    }

    private UserPost requireEditableAccess(Long workspaceIdx, Long userIdx) {
        UserPost relation = requireAccess(workspaceIdx, userIdx);
        if (relation.getLevel() == AccessRole.READ) {
            throw BaseException.from(BaseResponseStatus.WORKSPACE_ACCESS_DENIED);
        }
        return relation;
    }

    private WorkspaceRevision findRevision(Long workspaceIdx, Long revisionIdx) {
        return workspaceRevisionRepository.findByIdxAndWorkspace_Idx(revisionIdx, workspaceIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.WORKSPACE_NOT_FOUND));
    }
}
