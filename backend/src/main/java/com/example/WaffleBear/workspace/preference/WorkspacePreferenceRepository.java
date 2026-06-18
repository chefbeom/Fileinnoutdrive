package com.example.WaffleBear.workspace.preference;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface WorkspacePreferenceRepository extends JpaRepository<WorkspacePreference, Long> {

    Optional<WorkspacePreference> findByUser_Idx(Long userIdx);
}
