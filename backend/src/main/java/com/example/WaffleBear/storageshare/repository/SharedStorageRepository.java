package com.example.WaffleBear.storageshare.repository;

import com.example.WaffleBear.storageshare.model.SharedStorage;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.SharedStorageStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface SharedStorageRepository extends JpaRepository<SharedStorage, Long> {

    @EntityGraph(attributePaths = {"creator"})
    Optional<SharedStorage> findWithCreatorByIdx(Long idx);

    List<SharedStorage> findAllByStatusAndPurgeAtLessThanEqual(SharedStorageStatus status, LocalDateTime now);

    List<SharedStorage> findAllByCreator_Idx(Long creatorIdx);
}
