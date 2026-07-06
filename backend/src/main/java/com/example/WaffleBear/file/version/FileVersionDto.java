package com.example.WaffleBear.file.version;

import java.time.LocalDateTime;

public class FileVersionDto {

    public record VersionRes(
            Long idx,
            Long fileIdx,
            Integer versionNumber,
            String fileOriginName,
            String fileFormat,
            String fileSaveName,
            Long fileSize,
            LocalDateTime createdAt
    ) {
    }
}