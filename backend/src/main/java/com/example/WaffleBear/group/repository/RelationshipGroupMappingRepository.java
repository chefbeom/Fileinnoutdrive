package com.example.WaffleBear.group.repository;

import com.example.WaffleBear.group.model.entity.RelationshipGroupMapping;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface RelationshipGroupMappingRepository extends JpaRepository<RelationshipGroupMapping, Long> {

    @EntityGraph(attributePaths = {"relationship", "relationship.targetUser", "group"})
    List<RelationshipGroupMapping> findAllByRelationship_User_Idx(Long userId);

    @EntityGraph(attributePaths = {"relationship", "relationship.targetUser", "group"})
    List<RelationshipGroupMapping> findAllByRelationship_Id(Long relationshipId);

    @EntityGraph(attributePaths = {"relationship", "relationship.targetUser", "group"})
    List<RelationshipGroupMapping> findAllByRelationship_IdIn(Collection<Long> relationshipIds);

    @EntityGraph(attributePaths = {"relationship", "relationship.targetUser", "group"})
    List<RelationshipGroupMapping> findAllByGroup_Id(Long groupId);

    boolean existsByRelationship_IdAndGroup_Id(Long relationshipId, Long groupId);

    void deleteByRelationship_IdAndGroup_Id(Long relationshipId, Long groupId);

    void deleteAllByRelationship_Id(Long relationshipId);

    void deleteAllByGroup_Id(Long groupId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM RelationshipGroupMapping m WHERE m.relationship.user.idx = :userIdx OR m.relationship.targetUser.idx = :userIdx OR m.group.user.idx = :userIdx")
    void deleteAllByParticipantUserIdx(@Param("userIdx") Long userIdx);
}
