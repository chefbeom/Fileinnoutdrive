package com.example.WaffleBear.workspace.repository;

import com.example.WaffleBear.workspace.model.relation.UserPost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserPostRepository extends JpaRepository<UserPost, Long> {
    @Query("SELECT up FROM UserPost up JOIN FETCH up.workspace WHERE up.user.idx = :userId AND up.workspace.idx = :workspaceId")
    Optional<UserPost> findByUser_IdxAndWorkspace_Idx(@Param("userId") Long userId, @Param("workspaceId") Long workspaceId);

    @Query("SELECT up FROM UserPost up JOIN FETCH up.user WHERE up.workspace.idx = :postIdx")
    List<UserPost> findAllByWorkspace_idx(@Param("postIdx") Long postIdx);

    @Query("SELECT up FROM UserPost up JOIN FETCH up.workspace w WHERE up.user.idx = :userIdx ORDER BY w.updatedAt DESC, w.createdAt DESC")
    List<UserPost> findAllByUser_IdxOrderByWorkspaceUpdatedAtDesc(@Param("userIdx") Long userIdx);

    Optional<UserPost> deleteByUser_IdxAndWorkspace_Idx(Long userId, Long workspaceId);

    void deleteAllByUser_Idx(Long userIdx);

    @Query("SELECT up FROM UserPost up " +
            "WHERE up.workspace.idx = :workspaceId " +
            "AND up.user.idx IN :userIds " +
            "AND up.user.idx != :adminId")
    List<UserPost> findAllByWorkspaceIdAndUserIdsExceptAdmin(
            @Param("userIds") List<Long> userIds,
            @Param("workspaceId") Long workspaceId,
            @Param("adminId") Long adminId
    );

    @Query("SELECT up.user.idx FROM UserPost up WHERE up.workspace.idx = :postIdx")
    List<Long> findUserIdsByPostIdx(@Param("postIdx") Long postIdx);
}
