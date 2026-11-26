package com.example.WaffleBear.file.secret;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.crypto.VaultFileCryptoService;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.service.FileObjectDownloadService;
import com.example.WaffleBear.file.service.VaultEncryptionMigrationService;
import com.example.WaffleBear.file.util.FileContentUtils;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@RestController
@RequiredArgsConstructor
@RequestMapping("/file/secret")
@Tag(name = "Vault Streaming & Encryption", description = "Encrypted secret vault Range streaming and key migration APIs")
public class VaultStreamController {

    private static final long MAX_INLINE_OPEN_RANGE_BYTES = 4L * 1024 * 1024;

    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final UserRepository userRepository;
    private final SecretTokenService secretTokenService;
    private final SecretAccessGuard secretAccessGuard;
    private final VaultFileCryptoService vaultFileCryptoService;
    private final FileObjectDownloadService fileObjectDownloadService;
    private final VaultEncryptionMigrationService vaultEncryptionMigrationService;

    @RequestMapping(value = "/stream/{fileIdx}", method = {RequestMethod.GET, RequestMethod.HEAD})
    @Operation(summary = "Stream or download a secret vault file with HTTP Range decryption")
    public ResponseEntity<StreamingResponseBody> streamVaultFile(
            @PathVariable Long fileIdx,
            @RequestParam(value = "st", required = false) String streamToken,
            @RequestParam(value = "download", required = false, defaultValue = "false") boolean forceDownload,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader,
            @AuthenticationPrincipal AuthUserDetails authUser,
            HttpServletRequest request
    ) {
        if (fileIdx == null || fileIdx <= 0L) {
            return ResponseEntity.badRequest().build();
        }

        FileInfo file = authorizeStreamFile(fileIdx, streamToken, authUser);
        if (file == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        FileNodeType nodeType = file.getNodeType() == null ? FileNodeType.FILE : file.getNodeType();
        if (nodeType != FileNodeType.FILE
                || file.isTrashed()
                || file.isLockedFile()
                || file.getFileSavePath() == null
                || file.getFileSavePath().isBlank()) {
            return ResponseEntity.notFound().build();
        }

        long plaintextSize = Math.max(0L, file.getFileSize() == null ? 0L : file.getFileSize());
        String downloadName = FileContentUtils.sanitizeDownloadFileName(file.getFileOriginName(), file.getFileSaveName());
        boolean attachment = forceDownload
                || FileContentUtils.isActiveWebFile(downloadName)
                || FileContentUtils.isActiveWebFile(file.getFileFormat());
        ContentDisposition disposition = (attachment ? ContentDisposition.attachment() : ContentDisposition.inline())
                .filename(downloadName, StandardCharsets.UTF_8)
                .build();
        MediaType mediaType = resolveSafeMediaType(downloadName, file.getFileFormat());

        boolean hasRange = rangeHeader != null && !rangeHeader.isBlank();
        long rangeStart = 0L;
        long rangeEnd = plaintextSize - 1L;
        HttpStatus status = HttpStatus.OK;

        if (hasRange) {
            if (plaintextSize == 0L) {
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */0")
                        .build();
            }
            List<HttpRange> ranges;
            try {
                ranges = HttpRange.parseRanges(rangeHeader);
            } catch (IllegalArgumentException exception) {
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */" + plaintextSize)
                        .build();
            }
            if (ranges.size() != 1) {
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */" + plaintextSize)
                        .build();
            }
            HttpRange range = ranges.get(0);
            rangeStart = range.getRangeStart(plaintextSize);
            rangeEnd = range.getRangeEnd(plaintextSize);
            if (rangeStart < 0L || rangeEnd < rangeStart || rangeEnd >= plaintextSize) {
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */" + plaintextSize)
                        .build();
            }
            if (!forceDownload && isOpenEndedRangeHeader(rangeHeader)) {
                rangeEnd = Math.min(rangeEnd, rangeStart + MAX_INLINE_OPEN_RANGE_BYTES - 1L);
            }
            status = HttpStatus.PARTIAL_CONTENT;
        }

        long contentLength = plaintextSize == 0L ? 0L : (rangeEnd - rangeStart + 1L);
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(status)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store, no-cache, must-revalidate")
                .header("Pragma", "no-cache")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(mediaType)
                .contentLength(contentLength);

        if (status == HttpStatus.PARTIAL_CONTENT) {
            builder.header(HttpHeaders.CONTENT_RANGE, "bytes " + rangeStart + "-" + rangeEnd + "/" + plaintextSize);
        }

        if ("HEAD".equalsIgnoreCase(request.getMethod())) {
            return builder.body(out -> {});
        }

        final long finalStart = rangeStart;
        final long finalEnd = rangeEnd;
        StreamingResponseBody body = outputStream -> {
            if (plaintextSize == 0L && !file.isEncrypted()) {
                return;
            }
            try {
                if (file.isEncrypted()) {
                    vaultFileCryptoService.streamDecryptedRange(file, finalStart, finalEnd, outputStream);
                } else {
                    fileObjectDownloadService.streamObjectRange(file.getFileSavePath(), finalStart, finalEnd, outputStream);
                }
                outputStream.flush();
            } catch (IOException ioException) {
                if (!isClientAbortException(ioException)) {
                    throw ioException;
                }
            }
        };

        return builder.body(body);
    }

    @PostMapping("/stream-token/{fileIdx}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Issue a short-lived vault playback/download stream token")
    public ResponseEntity<BaseResponse<Map<String, Object>>> issueStreamToken(
            @AuthenticationPrincipal AuthUserDetails dto,
            @PathVariable Long fileIdx
    ) {
        Long userIdx = dto != null ? dto.getIdx() : 0L;
        if (userIdx <= 0L || fileIdx == null || fileIdx <= 0L) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        FileInfo file = fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
        secretAccessGuard.assertNodeAccess(userIdx, file, true);
        FileNodeType nodeType = file.getNodeType() == null ? FileNodeType.FILE : file.getNodeType();
        if (!file.isVaultSpace() || nodeType != FileNodeType.FILE || file.isTrashed() || file.isLockedFile()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        String token = secretTokenService.createVaultStreamToken(userIdx, fileIdx);
        if (token == null || token.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        String streamUrl = "/api/file/secret/stream/" + fileIdx + "?st=" + token;
        String downloadUrl = streamUrl + "&download=1";
        return ResponseEntity.ok(BaseResponse.success(Map.of(
                "streamUrl", streamUrl,
                "downloadUrl", downloadUrl,
                "expiresInSeconds", secretTokenService.getStreamTokenTtlSeconds()
        )));
    }

    @PostMapping("/vault/migrate-encryption")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Encrypt existing plaintext files in unlocked personal vault")
    public ResponseEntity<BaseResponse<VaultEncryptionMigrationService.MigrationReport>> migrateVaultEncryption(
            @AuthenticationPrincipal AuthUserDetails dto
    ) {
        Long userIdx = dto != null ? dto.getIdx() : 0L;
        if (userIdx <= 0L) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return ResponseEntity.ok(BaseResponse.success(vaultEncryptionMigrationService.migrateUserVault(userIdx)));
    }

    private FileInfo authorizeStreamFile(Long fileIdx, String streamToken, AuthUserDetails authUser) {
        if (streamToken != null && !streamToken.isBlank()) {
            Optional<Long> tokenUserOpt = secretTokenService.verifyVaultStreamToken(streamToken, fileIdx);
            if (tokenUserOpt.isEmpty()) {
                return null;
            }
            Long tokenUserIdx = tokenUserOpt.get();
            if (authUser != null && !Objects.equals(authUser.getIdx(), tokenUserIdx)) {
                return null;
            }
            User user = userRepository.findById(tokenUserIdx).orElse(null);
            if (user == null || !Boolean.TRUE.equals(user.getEnable()) || user.getAccountStatus() != UserAccountStatus.ACTIVE) {
                return null;
            }
            FileInfo file = fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, tokenUserIdx).orElse(null);
            if (file == null || !file.isVaultSpace() || SecretTreeRules.hasHiddenAncestor(file)) {
                return null;
            }
            return file;
        }

        if (authUser != null && authUser.getIdx() != null && authUser.getIdx() > 0L) {
            FileInfo file = fileUpDownloadRepository.findByIdxAndUser_Idx(fileIdx, authUser.getIdx()).orElse(null);
            if (file == null) {
                return null;
            }
            try {
                secretAccessGuard.assertNodeAccess(authUser.getIdx(), file, true);
                return file;
            } catch (RuntimeException exception) {
                return null;
            }
        }
        return null;
    }

    private MediaType resolveSafeMediaType(String fileName, String fileFormat) {
        try {
            return MediaType.parseMediaType(FileContentUtils.resolveSafeMediaContentType(fileName, fileFormat));
        } catch (Exception ignored) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    private boolean isOpenEndedRangeHeader(String rangeHeader) {
        if (rangeHeader == null || !rangeHeader.startsWith("bytes=")) {
            return false;
        }
        String spec = rangeHeader.substring("bytes=".length()).split(",", 2)[0].trim();
        return spec.endsWith("-") && !spec.startsWith("-");
    }

    private boolean isClientAbortException(Throwable throwable) {
        Throwable cursor = throwable;
        while (cursor != null) {
            String name = cursor.getClass().getSimpleName();
            if (name.contains("ClientAbortException") || name.contains("AsyncRequestNotUsableException")) {
                return true;
            }
            String message = cursor.getMessage();
            if (message != null && (message.contains("Broken pipe") || message.contains("Connection reset"))) {
                return true;
            }
            cursor = cursor.getCause();
        }
        return false;
    }
}
