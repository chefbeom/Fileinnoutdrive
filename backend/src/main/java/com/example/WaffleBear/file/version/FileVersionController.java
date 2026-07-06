package com.example.WaffleBear.file.version;

import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.user.model.AuthUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/file")
@Tag(name = "Drive Versions", description = "Drive file version APIs")
@SecurityRequirement(name = "bearerAuth")
public class FileVersionController {

    private final FileVersionService fileVersionService;

    @GetMapping("/{fileIdx}/versions")
    @Operation(summary = "List file versions", description = "Returns previous versions for an owned file.")
    public ResponseEntity<List<FileVersionDto.VersionRes>> listVersions(
            @AuthenticationPrincipal AuthUserDetails userDetails,
            @PathVariable Long fileIdx
    ) {
        return ResponseEntity.ok(fileVersionService.listVersions(userDetails != null ? userDetails.getIdx() : 0L, fileIdx));
    }

    @PostMapping("/{fileIdx}/versions/{versionIdx}/restore")
    @Operation(summary = "Restore file version", description = "Restores an owned file to a previous version.")
    public ResponseEntity<FileCommonDto.FileListItemRes> restoreVersion(
            @AuthenticationPrincipal AuthUserDetails userDetails,
            @PathVariable Long fileIdx,
            @PathVariable Long versionIdx
    ) {
        return ResponseEntity.ok(fileVersionService.restoreVersion(userDetails != null ? userDetails.getIdx() : 0L, fileIdx, versionIdx));
    }
}