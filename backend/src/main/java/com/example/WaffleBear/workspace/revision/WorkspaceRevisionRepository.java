package com.example.WaffleBear.workspace.revision;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WorkspaceRevisionRepository extends JpaRepository<WorkspaceRevision, Long> {

    List<WorkspaceRevision> findTop50ByWorkspace_IdxOrderByCreatedAtDescIdxDesc(Long workspaceIdx);

    Optional<WorkspaceRevision> findByIdxAndWorkspace_Idx(Long idx, Long workspaceIdx);

    Optional<WorkspaceRevision> findTopByWorkspace_IdxOrderByCreatedAtDescIdxDesc(Long workspaceIdx);
}
