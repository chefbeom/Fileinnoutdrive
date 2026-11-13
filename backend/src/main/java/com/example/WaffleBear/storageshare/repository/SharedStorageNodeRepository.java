package com.example.WaffleBear.storageshare.repository;

import com.example.WaffleBear.storageshare.model.SharedStorageNode;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.NodeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SharedStorageNodeRepository extends JpaRepository<SharedStorageNode, Long> {

    @EntityGraph(attributePaths = {"uploader", "parent"})
    List<SharedStorageNode> findAllByStorage_IdxOrderByNodeTypeDescNameAsc(Long storageIdx);

    @EntityGraph(attributePaths = {"uploader", "parent"})
    Optional<SharedStorageNode> findByIdxAndStorage_Idx(Long idx, Long storageIdx);

    List<SharedStorageNode> findAllByUploader_Idx(Long uploaderIdx);

    @Query("""
            select coalesce(sum(n.fileSize), 0)
            from SharedStorageNode n
            where n.storage.idx = :storageIdx
              and n.nodeType = :fileType
            """)
    Long sumFileSizeByStorageIdx(@Param("storageIdx") Long storageIdx, @Param("fileType") NodeType fileType);

    @Query("""
            select n.objectKey
            from SharedStorageNode n
            where n.objectKey is not null
              and n.objectKey <> ''
            """)
    List<String> findAllStoredObjectKeys();

    void deleteAllByStorage_Idx(Long storageIdx);
}
