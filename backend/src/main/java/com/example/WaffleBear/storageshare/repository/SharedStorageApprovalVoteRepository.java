package com.example.WaffleBear.storageshare.repository;

import com.example.WaffleBear.storageshare.model.SharedStorageApprovalVote;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SharedStorageApprovalVoteRepository extends JpaRepository<SharedStorageApprovalVote, Long> {

    @EntityGraph(attributePaths = {"voter"})
    List<SharedStorageApprovalVote> findAllByApproval_Idx(Long approvalIdx);

    @EntityGraph(attributePaths = {"voter", "approval"})
    List<SharedStorageApprovalVote> findAllByApproval_IdxIn(Collection<Long> approvalIds);

    Optional<SharedStorageApprovalVote> findByApproval_IdxAndVoter_Idx(Long approvalIdx, Long voterIdx);

    void deleteAllByApproval_Storage_Idx(Long storageIdx);

    void deleteAllByVoter_Idx(Long voterIdx);
}
