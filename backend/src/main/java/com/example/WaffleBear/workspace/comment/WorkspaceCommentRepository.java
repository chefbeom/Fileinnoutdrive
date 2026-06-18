package com.example.WaffleBear.workspace.comment;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WorkspaceCommentRepository extends JpaRepository<WorkspaceComment, Long> {

    List<WorkspaceComment> findAllByWorkspace_IdxOrderByResolvedAscCreatedAtDesc(Long workspaceIdx);

    Optional<WorkspaceComment> findByIdxAndWorkspace_Idx(Long idx, Long workspaceIdx);
}
