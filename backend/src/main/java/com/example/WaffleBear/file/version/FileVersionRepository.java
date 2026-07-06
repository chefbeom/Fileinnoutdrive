package com.example.WaffleBear.file.version;

import com.example.WaffleBear.file.version.model.FileVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FileVersionRepository extends JpaRepository<FileVersion, Long> {

    List<FileVersion> findAllByFile_IdxAndUser_IdxOrderByVersionNumberDesc(Long fileIdx, Long userIdx);

    Optional<FileVersion> findTopByFile_IdxOrderByVersionNumberDesc(Long fileIdx);

    Optional<FileVersion> findByIdxAndFile_IdxAndUser_Idx(Long idx, Long fileIdx, Long userIdx);

    List<FileVersion> findAllByFile_IdxIn(Collection<Long> fileIds);

    void deleteAllByFile_IdxIn(Collection<Long> fileIds);

    @Query("select coalesce(sum(v.fileSize), 0) from FileVersion v where v.user.idx = :userIdx")
    Long sumStoredVersionBytesByUser(@Param("userIdx") Long userIdx);
    @Query("""
            select v.fileSavePath
            from FileVersion v
            where v.fileSavePath is not null
              and v.fileSavePath <> ''
            """)
    List<String> findStoredObjectKeys();
}