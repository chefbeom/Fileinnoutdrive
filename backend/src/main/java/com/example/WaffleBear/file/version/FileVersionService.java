package com.example.WaffleBear.file.version;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.version.model.FileVersion;
import com.example.WaffleBear.user.model.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class FileVersionService {

    private final FileVersionRepository fileVersionRepository;
    private final FileUpDownloadRepository fileUpDownloadRepository;

    @Transactional(readOnly = true)
    public List<FileVersionDto.VersionRes> listVersions(Long userIdx, Long fileIdx) {
        FileInfo file = getOwnedFile(userIdx, fileIdx);
        ensureVersionable(file);
        return fileVersionRepository.findAllByFile_IdxAndUser_IdxOrderByVersionNumberDesc(file.getIdx(), userIdx)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public FileCommonDto.FileListItemRes restoreVersion(Long userIdx, Long fileIdx, Long versionIdx) {
        FileInfo file = getOwnedFile(userIdx, fileIdx);
        ensureVersionable(file);
        FileVersion version = fileVersionRepository.findByIdxAndFile_IdxAndUser_Idx(versionIdx, file.getIdx(), userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));

        snapshotCurrent(file);
        file.replaceContent(
                version.getFileOriginName(),
                version.getFileFormat(),
                version.getFileSaveName(),
                version.getFileSavePath(),
                version.getFileSize(),
                file.getParent()
        );
        FileInfo saved = fileUpDownloadRepository.save(file);
        fileVersionRepository.delete(version);
        return toFileListItem(saved);
    }

    @Transactional
    public FileVersion snapshotCurrent(FileInfo file) {
        if (!isSnapshotable(file)) {
            return null;
        }
        int nextVersionNumber = fileVersionRepository.findTopByFile_IdxOrderByVersionNumberDesc(file.getIdx())
                .map(FileVersion::getVersionNumber)
                .orElse(0) + 1;
        return fileVersionRepository.save(FileVersion.builder()
                .file(file)
                .user(file.getUser())
                .versionNumber(nextVersionNumber)
                .fileOriginName(file.getFileOriginName())
                .fileFormat(file.getFileFormat())
                .fileSaveName(file.getFileSaveName())
                .fileSavePath(file.getFileSavePath())
                .fileSize(file.getFileSize())
                .build());
    }


    private FileInfo getOwnedFile(Long userIdx, Long fileIdx) {
        if (userIdx == null || fileIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
    }

    private boolean isSnapshotable(FileInfo file) {
        return file != null
                && file.getIdx() != null
                && file.getUser() != null
                && file.getUser().getIdx() != null
                && resolveNodeType(file) == FileNodeType.FILE
                && !file.isTrashed()
                && !file.isLockedFile()
                && file.getFileSavePath() != null
                && !file.getFileSavePath().isBlank();
    }

    private void ensureVersionable(FileInfo file) {
        if (!isSnapshotable(file)) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private FileNodeType resolveNodeType(FileInfo file) {
        return file.getNodeType() == null ? FileNodeType.FILE : file.getNodeType();
    }

    private FileVersionDto.VersionRes toResponse(FileVersion version) {
        return new FileVersionDto.VersionRes(
                version.getIdx(),
                version.getFile() != null ? version.getFile().getIdx() : null,
                version.getVersionNumber(),
                version.getFileOriginName(),
                version.getFileFormat(),
                version.getFileSaveName(),
                version.getFileSize(),
                version.getCreatedAt()
        );
    }

    private FileCommonDto.FileListItemRes toFileListItem(FileInfo entity) {
        return FileCommonDto.FileListItemRes.builder()
                .idx(entity.getIdx())
                .fileOriginName(entity.getFileOriginName())
                .fileSaveName(entity.getFileSaveName())
                .fileSavePath(entity.getFileSavePath())
                .fileFormat(entity.getFileFormat())
                .fileSize(entity.getFileSize())
                .nodeType(resolveNodeType(entity).name())
                .parentId(entity.getParent() != null ? entity.getParent().getIdx() : null)
                .lockedFile(entity.isLockedFile())
                .sharedFile(entity.isSharedFile())
                .trashed(entity.isTrashed())
                .deletedAt(entity.getDeletedAt())
                .uploadDate(entity.getUploadDate())
                .lastModifyDate(entity.getLastModifyDate())
                .build();
    }
}