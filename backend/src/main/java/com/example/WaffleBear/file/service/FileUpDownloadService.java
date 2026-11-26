package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.info.dto.FileInfoDto;
import com.example.WaffleBear.file.manage.dto.FileManageDto;

import java.util.List;

public interface FileUpDownloadService {
    List<FileCommonDto.FileListItemRes> fileList(Long idx);

    default List<FileCommonDto.FileListItemRes> vaultFileList(Long userIdx) {
        return List.of();
    }

    FileCommonDto.FileListPageRes fileListPage(Long userIdx, FileManageDto.ListPageReq request);

    FileCommonDto.FileListItemRes createFolder(Long userIdx, FileManageDto.FolderReq request);

    FileCommonDto.FileActionRes moveToTrash(Long userIdx, Long fileIdx);

    FileCommonDto.FileActionRes restoreFromTrash(Long userIdx, Long fileIdx);

    FileCommonDto.FileActionRes deletePermanently(Long userIdx, Long fileIdx);

    FileCommonDto.FileActionRes clearTrash(Long userIdx);

    default FileCommonDto.FileActionRes clearTrash(Long userIdx, boolean vaultMode) {
        return clearTrash(userIdx);
    }

    FileCommonDto.FileActionRes moveToFolder(Long userIdx, Long fileIdx, Long targetParentId);

    default FileCommonDto.FileActionRes moveToVault(Long userIdx, Long fileIdx, Long targetParentId) {
        return moveFilesToVault(userIdx, fileIdx == null ? List.of() : List.of(fileIdx), targetParentId);
    }

    FileCommonDto.FileListItemRes renameFolder(Long userIdx, Long folderIdx, String folderName);

    FileInfoDto.FolderPropertyRes getFolderProperties(Long userIdx, Long folderIdx);

    FileCommonDto.FileActionRes moveFilesToFolder(Long userIdx, List<Long> fileIdxList, Long targetParentId);

    default FileCommonDto.FileActionRes moveFilesToVault(Long userIdx, List<Long> fileIdxList, Long targetParentId) {
        throw new UnsupportedOperationException("Vault move is not supported.");
    }

    default FileCommonDto.FileActionRes moveFromVault(
            Long userIdx,
            Long fileIdx,
            Long targetParentId,
            boolean restoreOriginalParent
    ) {
        return moveFilesFromVault(
                userIdx,
                fileIdx == null ? List.of() : List.of(fileIdx),
                targetParentId,
                restoreOriginalParent
        );
    }

    default FileCommonDto.FileActionRes moveFilesFromVault(
            Long userIdx,
            List<Long> fileIdxList,
            Long targetParentId,
            boolean restoreOriginalParent
    ) {
        throw new UnsupportedOperationException("Vault export is not supported.");
    }

    FileCommonDto.FileActionRes restoreFilesFromTrash(Long userIdx, List<Long> fileIdxList);

    FileInfoDto.StorageSummaryRes getStorageSummary(Long userIdx);

    FileInfoDto.TextPreviewRes getTextPreview(Long userIdx, Long fileIdx);

    FileCommonDto.FileActionRes setLockedFiles(Long userIdx, List<Long> fileIdxList, boolean locked);

    FileCommonDto.FileDownloadPayload downloadFile(Long userIdx, Long fileIdx);

    String getDownloadUrl(Long userIdx, Long fileIdx);

    FileCommonDto.FolderZipDownloadPayload downloadFolderZip(Long userIdx, Long folderIdx);
}
