package com.example.WaffleBear.file.sharelink;

import com.example.WaffleBear.file.sharelink.model.FileDownloadShareLink;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FileDownloadShareLinkRepository extends JpaRepository<FileDownloadShareLink, Long> {

    boolean existsByToken(String token);

    @EntityGraph(attributePaths = {"file", "owner"})
    Optional<FileDownloadShareLink> findByToken(String token);

    @EntityGraph(attributePaths = {"file", "owner"})
    Optional<FileDownloadShareLink> findByIdxAndOwner_Idx(Long idx, Long ownerIdx);

    @EntityGraph(attributePaths = {"file", "owner"})
    List<FileDownloadShareLink> findAllByFile_IdxAndOwner_IdxOrderByCreatedAtDescIdxDesc(Long fileIdx, Long ownerIdx);

    @EntityGraph(attributePaths = {"file", "owner"})
    List<FileDownloadShareLink> findAllByOwner_IdxOrderByCreatedAtDescIdxDesc(Long ownerIdx);

    void deleteAllByFile_Idx(Long fileIdx);

    void deleteAllByFile_IdxIn(Collection<Long> fileIds);

    void deleteAllByOwner_Idx(Long ownerIdx);

    /**
     * Atomically consumes one download slot only if the link is still active,
     * unexpired, and below its configured maximum download limit.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update FileDownloadShareLink l
            set l.downloadCount = l.downloadCount + 1,
                l.lastDownloadedAt = :now
            where l.idx = :linkIdx
              and l.revoked = false
              and l.expiresAt > :now
              and (l.maxDownloads is null or l.downloadCount < l.maxDownloads)
            """)
    int consumeDownloadSlot(@Param("linkIdx") Long linkIdx, @Param("now") LocalDateTime now);
}
