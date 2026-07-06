package com.example.WaffleBear.file.version;

import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.version.model.FileVersion;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class FileVersionLifecycleService {

    private final FileVersionRepository fileVersionRepository;

    @Transactional(readOnly = true)
    public long sumStoredVersionBytes(Long userIdx) {
        Long value = fileVersionRepository.sumStoredVersionBytesByUser(userIdx);
        return Math.max(0L, value == null ? 0L : value);
    }

    @Transactional(readOnly = true)
    public List<String> findVersionObjectKeys(Collection<FileInfo> files) {
        List<Long> fileIds = normalizeFileIds(files);
        if (fileIds.isEmpty()) {
            return List.of();
        }
        return fileVersionRepository.findAllByFile_IdxIn(fileIds)
                .stream()
                .map(FileVersion::getFileSavePath)
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
    }

    @Transactional
    public void deleteVersionsForFiles(Collection<FileInfo> files) {
        List<Long> fileIds = normalizeFileIds(files);
        if (!fileIds.isEmpty()) {
            fileVersionRepository.deleteAllByFile_IdxIn(fileIds);
        }
    }

    private List<Long> normalizeFileIds(Collection<FileInfo> files) {
        if (files == null || files.isEmpty()) {
            return List.of();
        }
        return files.stream()
                .filter(Objects::nonNull)
                .map(FileInfo::getIdx)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }
}