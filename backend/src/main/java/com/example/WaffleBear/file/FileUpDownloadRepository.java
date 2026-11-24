package com.example.WaffleBear.file;

import com.example.WaffleBear.file.model.FileEncryptionMode;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FileUpDownloadRepository extends JpaRepository<FileInfo, Long>, JpaSpecificationExecutor<FileInfo> {
    interface UserDashboardStatProjection {
        Long getUserIdx();
        Long getFileCount();
        Long getFolderCount();
        Long getUsedBytes();
        Long getSharedFileCount();
    }

    interface VaultEncryptionStatProjection {
        Long getUserIdx();
        String getUserEmail();
        String getUserName();
        Long getTotalCount();
        Long getEncryptedCount();
        Long getPlaintextCount();
        Long getPlaintextBytes();
        Long getEncryptedBytes();
    }

    interface VaultMigrationCandidateProjection {
        Long getFileIdx();
        Long getUserIdx();
        String getFileOriginName();
        String getFileSavePath();
        Long getFileSize();
    }

    List<FileInfo> findAllByUser_IdxOrderByLastModifyDateDescUploadDateDesc(Long userIdx);
    List<FileInfo> findAllByUser_Idx(Long userIdx);
    Optional<FileInfo> findByIdxAndUser_Idx(Long idx, Long userIdx);
    Optional<FileInfo> findByUser_IdxAndFileSavePath(Long userIdx, String fileSavePath);
    Optional<FileInfo> findByUser_IdxAndParentIsNullAndFileOriginNameAndTrashedFalse(Long userIdx, String fileOriginName);
    Optional<FileInfo> findByUser_IdxAndParent_IdxAndFileOriginNameAndTrashedFalse(Long userIdx, Long parentIdx, String fileOriginName);
    Optional<FileInfo> findFirstByUser_IdxAndParentIsNullAndFileOriginNameAndTrashedFalseOrderByIdxAsc(Long userIdx, String fileOriginName);
    Optional<FileInfo> findFirstByUser_IdxAndParent_IdxAndFileOriginNameAndTrashedFalseOrderByIdxAsc(Long userIdx, Long parentIdx, String fileOriginName);
    Optional<FileInfo> findFirstByUser_IdxAndFileSaveNameStartingWithOrderByIdxAsc(Long userIdx, String fileSaveNamePrefix);
    List<FileInfo> findAllByFileSaveNameStartingWith(String fileSaveNamePrefix);

    @Query("""
            select f
            from FileInfo f
            where f.user.idx = :userIdx
              and f.parent is null
              and f.fileOriginName = :folderName
              and (f.trashed is null or f.trashed = false)
              and (
                    (:vaultOnly = true and f.spaceType = com.example.WaffleBear.file.model.FileSpaceType.VAULT)
                    or (:vaultOnly = false and (f.spaceType is null or f.spaceType = com.example.WaffleBear.file.model.FileSpaceType.DRIVE))
              )
            order by f.idx asc
            """)
    List<FileInfo> findRootFoldersByNameAndSpace(
            @Param("userIdx") Long userIdx,
            @Param("folderName") String folderName,
            @Param("vaultOnly") boolean vaultOnly
    );

    default Optional<FileInfo> findFirstRootFolderByNameAndSpace(Long userIdx, String folderName, FileSpaceType spaceType) {
        return findRootFoldersByNameAndSpace(userIdx, folderName, spaceType == FileSpaceType.VAULT)
                .stream()
                .findFirst();
    }

    @Query("""
            select coalesce(sum(coalesce(f.fileSize, 0)), 0)
            from FileInfo f
            where f.user.idx = :userIdx
              and (f.nodeType is null or f.nodeType = :fileNodeType)
            """)
    Long sumStoredFileBytesByUser(
            @Param("userIdx") Long userIdx,
            @Param("fileNodeType") FileNodeType fileNodeType
    );

    @Query("""
            select
                f.user.idx as userIdx,
                sum(case when f.nodeType = :folderType then 0 else 1 end) as fileCount,
                sum(case when f.nodeType = :folderType then 1 else 0 end) as folderCount,
                sum(case when f.nodeType = :folderType then 0 else coalesce(f.fileSize, 0) end) as usedBytes,
                sum(case when f.nodeType = :folderType then 0 when f.sharedFile = true then 1 else 0 end) as sharedFileCount
            from FileInfo f
            where f.user.idx is not null
            group by f.user.idx
            """)
    List<UserDashboardStatProjection> aggregateDashboardStatsByUser(@Param("folderType") FileNodeType folderType);

    @Query("""
            select
                f.user.idx as userIdx,
                sum(case when f.nodeType = :folderType then 0 else 1 end) as fileCount,
                sum(case when f.nodeType = :folderType then 1 else 0 end) as folderCount,
                sum(case when f.nodeType = :folderType then 0 else coalesce(f.fileSize, 0) end) as usedBytes,
                sum(case when f.nodeType = :folderType then 0 when f.sharedFile = true then 1 else 0 end) as sharedFileCount
            from FileInfo f
            where f.user.idx = :userIdx
            group by f.user.idx
            """)
    Optional<UserDashboardStatProjection> aggregateDashboardStatsForUser(
            @Param("userIdx") Long userIdx,
            @Param("folderType") FileNodeType folderType
    );

    @Query("""
            select distinct lower(f.fileFormat)
            from FileInfo f
            where f.user.idx = :userIdx
              and (f.trashed is null or f.trashed = false)
              and (f.nodeType is null or f.nodeType = :fileNodeType)
              and (
                    (:vaultOnly = true and f.spaceType = com.example.WaffleBear.file.model.FileSpaceType.VAULT)
                    or (:vaultOnly = false and (f.spaceType is null or f.spaceType = com.example.WaffleBear.file.model.FileSpaceType.DRIVE))
              )
              and (:includeHidden = true or (f.hiddenFolder is null or f.hiddenFolder = false))
              and (
                    (:parentId is null and f.parent is null)
                    or (:parentId is not null and f.parent.idx = :parentId)
              )
            order by lower(f.fileFormat)
            """)
    List<String> findDistinctFileFormatsByUserAndParent(
            @Param("userIdx") Long userIdx,
            @Param("parentId") Long parentId,
            @Param("fileNodeType") FileNodeType fileNodeType,
            @Param("vaultOnly") boolean vaultOnly,
            @Param("includeHidden") boolean includeHidden
    );

    default List<String> findDistinctFileFormatsByUserAndParent(
            Long userIdx,
            Long parentId,
            FileNodeType fileNodeType
    ) {
        return findDistinctFileFormatsByUserAndParent(userIdx, parentId, fileNodeType, false, false);
    }

    @Query("""
            select f
            from FileInfo f
            where f.user.idx = :userIdx
              and (f.trashed is null or f.trashed = false)
              and f.nodeType = :folderNodeType
              and (
                    (:vaultOnly = true and f.spaceType = com.example.WaffleBear.file.model.FileSpaceType.VAULT)
                    or (:vaultOnly = false and (f.spaceType is null or f.spaceType = com.example.WaffleBear.file.model.FileSpaceType.DRIVE))
              )
            order by lower(f.fileOriginName) asc, f.idx asc
            """)
    List<FileInfo> findActiveFoldersByUserAndSpace(
            @Param("userIdx") Long userIdx,
            @Param("folderNodeType") FileNodeType folderNodeType,
            @Param("vaultOnly") boolean vaultOnly
    );

    @Query("""
            select distinct lower(f.fileFormat)
            from FileInfo f
            where f.user.idx = :userIdx
              and (f.trashed is null or f.trashed = false)
              and (f.nodeType is null or f.nodeType = :fileNodeType)
              and f.fileFormat is not null
              and f.fileFormat <> ''
              and (
                    (:vaultOnly = true and f.spaceType = com.example.WaffleBear.file.model.FileSpaceType.VAULT)
                    or (:vaultOnly = false and (f.spaceType is null or f.spaceType = com.example.WaffleBear.file.model.FileSpaceType.DRIVE))
              )
              and (:includeHidden = true or (f.hiddenFolder is null or f.hiddenFolder = false))
              and f.parent.idx in :parentIds
            order by lower(f.fileFormat)
            """)
    List<String> findDistinctFileFormatsByUserAndParentIn(
            @Param("userIdx") Long userIdx,
            @Param("parentIds") Collection<Long> parentIds,
            @Param("fileNodeType") FileNodeType fileNodeType,
            @Param("vaultOnly") boolean vaultOnly,
            @Param("includeHidden") boolean includeHidden
    );

    @Query("""
            select distinct lower(f.fileFormat)
            from FileInfo f
            where f.user.idx = :userIdx
              and (f.trashed is null or f.trashed = false)
              and (f.nodeType is null or f.nodeType = :fileNodeType)
              and f.fileFormat is not null
              and f.fileFormat <> ''
              and (
                    (:vaultOnly = true and f.spaceType = com.example.WaffleBear.file.model.FileSpaceType.VAULT)
                    or (:vaultOnly = false and (f.spaceType is null or f.spaceType = com.example.WaffleBear.file.model.FileSpaceType.DRIVE))
              )
              and (:includeHidden = true or (f.hiddenFolder is null or f.hiddenFolder = false))
              and (f.parent is null or f.parent.idx in :parentIds)
            order by lower(f.fileFormat)
            """)
    List<String> findDistinctFileFormatsByUserInRootOrParents(
            @Param("userIdx") Long userIdx,
            @Param("parentIds") Collection<Long> parentIds,
            @Param("fileNodeType") FileNodeType fileNodeType,
            @Param("vaultOnly") boolean vaultOnly,
            @Param("includeHidden") boolean includeHidden
    );

    @Query("""
            select f.fileSavePath
            from FileInfo f
            where f.fileSavePath is not null
              and f.fileSavePath <> ''
              and (f.nodeType is null or f.nodeType = :fileNodeType)
            """)
    List<String> findStoredObjectKeys(@Param("fileNodeType") FileNodeType fileNodeType);

    default List<String> findStoredObjectKeys() {
        return findStoredObjectKeys(FileNodeType.FILE);
    }

    @Query("""
            select
                u.idx as userIdx,
                u.email as userEmail,
                u.name as userName,
                count(f.idx) as totalCount,
                sum(case when f.encryptionMode is not null and f.encryptionMode <> :noneMode then 1 else 0 end) as encryptedCount,
                sum(case when (f.encryptionMode is null or f.encryptionMode = :noneMode) and f.fileSavePath is not null and f.fileSavePath <> '' then 1 else 0 end) as plaintextCount,
                sum(case when (f.encryptionMode is null or f.encryptionMode = :noneMode) and f.fileSavePath is not null and f.fileSavePath <> '' then coalesce(f.fileSize, 0) else 0 end) as plaintextBytes,
                sum(case when f.encryptionMode is not null and f.encryptionMode <> :noneMode then coalesce(f.fileSize, 0) else 0 end) as encryptedBytes
            from FileInfo f
            join f.user u
            where f.spaceType = :vaultSpace
              and (f.trashed is null or f.trashed = false)
              and (f.nodeType is null or f.nodeType = :fileNodeType)
            group by u.idx, u.email, u.name
            order by sum(case when (f.encryptionMode is null or f.encryptionMode = :noneMode) and f.fileSavePath is not null and f.fileSavePath <> '' then 1 else 0 end) desc, u.idx asc
            """)
    List<VaultEncryptionStatProjection> aggregateVaultEncryptionStats(
            @Param("fileNodeType") FileNodeType fileNodeType,
            @Param("vaultSpace") FileSpaceType vaultSpace,
            @Param("noneMode") FileEncryptionMode noneMode
    );

    @Query("""
            select
                f.idx as fileIdx,
                f.user.idx as userIdx,
                f.fileOriginName as fileOriginName,
                f.fileSavePath as fileSavePath,
                f.fileSize as fileSize
            from FileInfo f
            where f.spaceType = :vaultSpace
              and (f.trashed is null or f.trashed = false)
              and (f.nodeType is null or f.nodeType = :fileNodeType)
              and (f.encryptionMode is null or f.encryptionMode = :noneMode)
              and f.fileSavePath is not null
              and f.fileSavePath <> ''
              and (:targetUserIdx is null or f.user.idx = :targetUserIdx)
            order by f.user.idx asc, f.idx asc
            """)
    List<VaultMigrationCandidateProjection> findActivePlaintextVaultCandidates(
            @Param("fileNodeType") FileNodeType fileNodeType,
            @Param("vaultSpace") FileSpaceType vaultSpace,
            @Param("noneMode") FileEncryptionMode noneMode,
            @Param("targetUserIdx") Long targetUserIdx
    );
}
