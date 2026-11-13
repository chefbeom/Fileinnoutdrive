package com.example.WaffleBear.file.sharelink;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.file.sharelink.dto.DownloadShareLinkDto;
import com.example.WaffleBear.user.model.AuthUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.Locale;

/**
 * Exposes authenticated management endpoints and public token redemption endpoints
 * for time- and count-limited presigned file download links.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/file/share-links")
@Tag(name = "Download Share Links", description = "Time- and count-limited presigned download link APIs")
public class DownloadShareLinkController {

    private final DownloadShareLinkService downloadShareLinkService;

    @PostMapping("/files/{fileIdx}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Create download share link", description = "Creates a share link with user-defined expiry and download count limits.")
    public ResponseEntity<BaseResponse<DownloadShareLinkDto.LinkRes>> createDownloadLink(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long fileIdx,
            @RequestBody(required = false) DownloadShareLinkDto.CreateReq request
    ) {
        Long userIdx = user != null ? user.getIdx() : null;
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(BaseResponse.success(downloadShareLinkService.createDownloadLink(userIdx, fileIdx, request)));
    }

    @GetMapping("/files/{fileIdx}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "List file download links", description = "Lists download share links issued for a specific owned file.")
    public ResponseEntity<BaseResponse<List<DownloadShareLinkDto.LinkRes>>> getFileDownloadLinks(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long fileIdx
    ) {
        Long userIdx = user != null ? user.getIdx() : null;
        return ResponseEntity.ok(BaseResponse.success(downloadShareLinkService.getFileDownloadLinks(userIdx, fileIdx)));
    }

    @GetMapping("/mine")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "List my download links", description = "Lists all download share links issued by the signed-in user.")
    public ResponseEntity<BaseResponse<List<DownloadShareLinkDto.LinkRes>>> getMyDownloadLinks(
            @AuthenticationPrincipal AuthUserDetails user
    ) {
        Long userIdx = user != null ? user.getIdx() : null;
        return ResponseEntity.ok(BaseResponse.success(downloadShareLinkService.getMyDownloadLinks(userIdx)));
    }

    @DeleteMapping("/{linkIdx}")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Revoke download share link", description = "Revokes an issued download link immediately.")
    public ResponseEntity<BaseResponse<DownloadShareLinkDto.LinkRes>> revokeDownloadLink(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long linkIdx
    ) {
        Long userIdx = user != null ? user.getIdx() : null;
        return ResponseEntity.ok(BaseResponse.success(downloadShareLinkService.revokeDownloadLink(userIdx, linkIdx)));
    }

    @GetMapping("/public/{token}")
    @Operation(summary = "Get public download link metadata", description = "Returns public file metadata, remaining expiry, and remaining download slots without consuming a download.")
    public ResponseEntity<BaseResponse<DownloadShareLinkDto.PublicMetaRes>> getPublicLinkMetadata(
            @PathVariable String token
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(BaseResponse.success(downloadShareLinkService.getPublicLinkMetadata(token)));
    }

    @PostMapping("/public/{token}/download-url")
    @Operation(summary = "Redeem download slot for presigned URL", description = "Consumes one download slot if valid and returns a short-lived MinIO presigned download URL.")
    public ResponseEntity<BaseResponse<DownloadShareLinkDto.PublicDownloadUrlRes>> issuePublicPresignedUrl(
            @PathVariable String token,
            @RequestBody(required = false) DownloadShareLinkDto.DownloadUrlReq request
    ) {
        String password = request != null ? request.getPassword() : null;
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(BaseResponse.success(downloadShareLinkService.issuePresignedDownloadUrl(token, password)));
    }

    @RequestMapping(value = "/public/{token}/download", method = RequestMethod.HEAD)
    @Operation(summary = "Probe public download link without consuming a slot")
    public ResponseEntity<Void> headPublicDownload(@PathVariable String token) {
        downloadShareLinkService.getPublicLinkMetadata(token);
        return ResponseEntity.noContent()
                .cacheControl(CacheControl.noStore())
                .build();
    }

    @GetMapping("/public/{token}/download")
    @Operation(summary = "Direct download redirect", description = "Consumes one download slot and redirects directly to the MinIO presigned URL. Link-preview bots and unauthenticated password links redirect to the frontend share page without consuming a slot.")
    public ResponseEntity<Void> redirectPublicDownload(
            @PathVariable String token,
            @RequestParam(required = false) String password,
            @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent,
            @RequestHeader(value = HttpHeaders.ACCEPT, required = false) String acceptHeader
    ) {
        if (isPreviewBot(userAgent)) {
            return redirectToSharePage(token);
        }

        try {
            DownloadShareLinkDto.PublicDownloadUrlRes issued =
                    downloadShareLinkService.issuePresignedDownloadUrl(token, password);
            return ResponseEntity.status(HttpStatus.FOUND)
                    .cacheControl(CacheControl.noStore())
                    .location(URI.create(issued.getPresignedUrl()))
                    .build();
        } catch (BaseException ex) {
            if (isHtmlBrowserNavigation(acceptHeader)) {
                return redirectToSharePage(token);
            }
            throw ex;
        }
    }

    private ResponseEntity<Void> redirectToSharePage(String token) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .cacheControl(CacheControl.noStore())
                .location(URI.create("/share-link/" + token))
                .build();
    }

    private boolean isHtmlBrowserNavigation(String acceptHeader) {
        return acceptHeader != null && acceptHeader.toLowerCase(Locale.ROOT).contains("text/html");
    }

    private boolean isPreviewBot(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return false;
        }
        String lower = userAgent.toLowerCase(Locale.ROOT);
        return lower.contains("kakaotalk")
                || lower.contains("slackbot")
                || lower.contains("discordbot")
                || lower.contains("facebookexternalhit")
                || lower.contains("twitterbot")
                || lower.contains("telegrambot")
                || lower.contains("whatsapp")
                || lower.contains("line-poker")
                || lower.contains("bingpreview")
                || lower.contains("googlebot")
                || lower.contains("yeti");
    }
}
