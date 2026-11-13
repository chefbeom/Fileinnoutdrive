package com.example.WaffleBear.storageshare.repository;

import com.example.WaffleBear.storageshare.model.StorageGrant;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.GrantStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface StorageGrantRepository extends JpaRepository<StorageGrant, Long> {

    @EntityGraph(attributePaths = {"granter", "recipient"})
    List<StorageGrant> findAllByGranter_IdxOrderByCreatedAtDesc(Long granterIdx);

    @EntityGraph(attributePaths = {"granter", "recipient"})
    List<StorageGrant> findAllByRecipient_IdxOrderByCreatedAtDesc(Long recipientIdx);

    @EntityGraph(attributePaths = {"granter", "recipient"})
    List<StorageGrant> findAllByGranter_IdxIn(Collection<Long> granterIds);

    @EntityGraph(attributePaths = {"granter", "recipient"})
    List<StorageGrant> findAllByRecipient_IdxIn(Collection<Long> recipientIds);

    @EntityGraph(attributePaths = {"granter", "recipient"})
    List<StorageGrant> findAllByStatusIn(Collection<GrantStatus> statuses);

    @EntityGraph(attributePaths = {"granter", "recipient"})
    List<StorageGrant> findAllByStatusInAndEndAtIsNotNullAndEndAtLessThanEqual(
            Collection<GrantStatus> statuses,
            LocalDateTime now
    );

    void deleteAllByGranter_IdxOrRecipient_Idx(Long granterIdx, Long recipientIdx);
}
