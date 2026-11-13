package com.example.WaffleBear.group.repository;

import com.example.WaffleBear.group.model.entity.RelationshipInvite;
import com.example.WaffleBear.group.model.enums.InviteStatus;
import com.example.WaffleBear.group.model.enums.InviteType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RelationshipInviteRepository extends JpaRepository<RelationshipInvite, Long> {

    @EntityGraph(attributePaths = {"fromUser", "toUser"})
    List<RelationshipInvite> findAllByToUser_IdxOrderByCreatedAtDesc(Long toUserId);

    @EntityGraph(attributePaths = {"fromUser", "toUser"})
    List<RelationshipInvite> findAllByEmailOrderByCreatedAtDesc(String email);

    @EntityGraph(attributePaths = {"fromUser", "toUser"})
    List<RelationshipInvite> findAllByFromUser_IdxOrderByCreatedAtDesc(Long fromUserId);

    @EntityGraph(attributePaths = {"fromUser", "toUser"})
    Optional<RelationshipInvite> findById(Long id);

    Optional<RelationshipInvite> findByFromUser_IdxAndToUser_IdxAndTypeAndStatus(
            Long fromUserId,
            Long toUserId,
            InviteType type,
            InviteStatus status
    );

    Optional<RelationshipInvite> findByFromUser_IdxAndEmailAndTypeAndStatus(
            Long fromUserId,
            String email,
            InviteType type,
            InviteStatus status
    );

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM RelationshipInvite i WHERE i.fromUser.idx = :userIdx OR i.toUser.idx = :userIdx OR (i.email IS NOT NULL AND lower(i.email) = lower(:email))")
    void deleteAllByUserIdxOrEmail(@Param("userIdx") Long userIdx, @Param("email") String email);
}
