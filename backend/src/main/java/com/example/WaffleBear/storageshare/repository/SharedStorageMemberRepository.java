package com.example.WaffleBear.storageshare.repository;

import com.example.WaffleBear.storageshare.model.SharedStorageMember;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.MemberStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SharedStorageMemberRepository extends JpaRepository<SharedStorageMember, Long> {

    @EntityGraph(attributePaths = {"storage", "storage.creator", "user"})
    List<SharedStorageMember> findAllByUser_IdxOrderByCreatedAtDesc(Long userIdx);

    @EntityGraph(attributePaths = {"storage", "user"})
    List<SharedStorageMember> findAllByUser_IdxInAndStatus(Collection<Long> userIds, MemberStatus status);

    @EntityGraph(attributePaths = {"storage", "user"})
    List<SharedStorageMember> findAllByUser_IdxAndStatus(Long userIdx, MemberStatus status);

    @EntityGraph(attributePaths = {"user"})
    List<SharedStorageMember> findAllByStorage_IdxOrderByCreatedAtAsc(Long storageIdx);

    @EntityGraph(attributePaths = {"user"})
    List<SharedStorageMember> findAllByStorage_IdxAndStatus(Long storageIdx, MemberStatus status);

    @EntityGraph(attributePaths = {"storage", "user"})
    Optional<SharedStorageMember> findByStorage_IdxAndUser_Idx(Long storageIdx, Long userIdx);

    void deleteAllByStorage_Idx(Long storageIdx);

    void deleteAllByUser_Idx(Long userIdx);
}
