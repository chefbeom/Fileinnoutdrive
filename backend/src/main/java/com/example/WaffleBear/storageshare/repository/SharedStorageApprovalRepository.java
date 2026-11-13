package com.example.WaffleBear.storageshare.repository;

import com.example.WaffleBear.storageshare.model.SharedStorageApproval;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.ApprovalStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface SharedStorageApprovalRepository extends JpaRepository<SharedStorageApproval, Long> {

    @EntityGraph(attributePaths = {"requester", "storage"})
    List<SharedStorageApproval> findAllByStorage_IdxOrderByCreatedAtDesc(Long storageIdx);

    @EntityGraph(attributePaths = {"requester", "storage"})
    Optional<SharedStorageApproval> findByIdxAndStorage_Idx(Long idx, Long storageIdx);

    List<SharedStorageApproval> findAllByStorage_IdxAndStatus(Long storageIdx, ApprovalStatus status);

    List<SharedStorageApproval> findAllByStatusAndExpiresAtLessThanEqual(ApprovalStatus status, LocalDateTime now);

    List<SharedStorageApproval> findAllByRequester_Idx(Long requesterIdx);

    void deleteAllByStorage_Idx(Long storageIdx);
}
