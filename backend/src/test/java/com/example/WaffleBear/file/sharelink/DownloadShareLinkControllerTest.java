package com.example.WaffleBear.file.sharelink;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.exception.GlobalExceptionHandler;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.sharelink.dto.DownloadShareLinkDto;
import com.example.WaffleBear.user.model.AuthUserDetails;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DownloadShareLinkControllerTest {

    private DownloadShareLinkService downloadShareLinkService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        downloadShareLinkService = mock(DownloadShareLinkService.class);
        DownloadShareLinkController controller = new DownloadShareLinkController(downloadShareLinkService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();

        AuthUserDetails user = AuthUserDetails.builder()
                .idx(7L)
                .id("owner@wafflebear.local")
                .email("owner@wafflebear.local")
                .name("Kim")
                .role("ROLE_USER")
                .enable(true)
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities())
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void createAndRevokeAuthenticatedShareLinkEndpoints() throws Exception {
        DownloadShareLinkDto.LinkRes linkRes = DownloadShareLinkDto.LinkRes.builder()
                .idx(101L)
                .token("abcToken123")
                .fileIdx(42L)
                .fileName("report.pdf")
                .durationMinutes(30)
                .maxDownloads(1)
                .downloadCount(0)
                .remainingDownloads(1)
                .status("ACTIVE")
                .sharePath("/share-link/abcToken123")
                .directDownloadPath("/file/share-links/public/abcToken123/download")
                .build();

        when(downloadShareLinkService.createDownloadLink(eq(7L), eq(42L), any())).thenReturn(linkRes);
        when(downloadShareLinkService.getFileDownloadLinks(7L, 42L)).thenReturn(List.of(linkRes));
        when(downloadShareLinkService.revokeDownloadLink(7L, 101L)).thenReturn(
                DownloadShareLinkDto.LinkRes.builder()
                        .idx(101L)
                        .token("abcToken123")
                        .revoked(true)
                        .status("REVOKED")
                        .build()
        );

        mockMvc.perform(post("/file/share-links/files/42")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expiresInMinutes\":30,\"maxDownloads\":1}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.result.token").value("abcToken123"))
                .andExpect(jsonPath("$.result.maxDownloads").value(1));

        mockMvc.perform(get("/file/share-links/files/42"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result[0].token").value("abcToken123"));

        mockMvc.perform(delete("/file/share-links/101"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.status").value("REVOKED"));
    }

    @Test
    void publicMetadataAndDownloadUrlIssuance() throws Exception {
        SecurityContextHolder.clearContext();

        when(downloadShareLinkService.getPublicLinkMetadata("tok1")).thenReturn(
                DownloadShareLinkDto.PublicMetaRes.builder()
                        .token("tok1")
                        .fileName("slides.pdf")
                        .fileSize(4096L)
                        .remainingSeconds(1790L)
                        .maxDownloads(1)
                        .downloadCount(0)
                        .remainingDownloads(1)
                        .downloadable(true)
                        .status("ACTIVE")
                        .expiresAt(LocalDateTime.now().plusMinutes(30))
                        .build()
        );
        when(downloadShareLinkService.issuePresignedDownloadUrl("tok1", null)).thenReturn(
                DownloadShareLinkDto.PublicDownloadUrlRes.builder()
                        .presignedUrl("https://minio.local/bucket/slides.pdf?X-Amz-Signature=sig")
                        .fileName("slides.pdf")
                        .downloadCount(1)
                        .remainingDownloads(0)
                        .status("EXHAUSTED")
                        .urlExpiresInSeconds(300L)
                        .build()
        );

        mockMvc.perform(get("/file/share-links/public/tok1"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.result.fileName").value("slides.pdf"))
                .andExpect(jsonPath("$.result.remainingDownloads").value(1));

        mockMvc.perform(post("/file/share-links/public/tok1/download-url")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.presignedUrl").value("https://minio.local/bucket/slides.pdf?X-Amz-Signature=sig"))
                .andExpect(jsonPath("$.result.remainingDownloads").value(0));
    }

    @Test
    void directDownloadSkipsSlotConsumptionForHeadAndLinkPreviewBotsAndRedirectsRealDownload() throws Exception {
        SecurityContextHolder.clearContext();

        mockMvc.perform(head("/file/share-links/public/tok2/download"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/file/share-links/public/tok2/download")
                        .header("User-Agent", "KakaoTalk-Scrap/1.0"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "/share-link/tok2"));

        verify(downloadShareLinkService, never()).issuePresignedDownloadUrl(eq("tok2"), any());

        when(downloadShareLinkService.issuePresignedDownloadUrl("tok2", null)).thenReturn(
                DownloadShareLinkDto.PublicDownloadUrlRes.builder()
                        .presignedUrl("https://minio.local/bucket/file.zip?X-Amz-Signature=ok")
                        .build()
        );

        mockMvc.perform(get("/file/share-links/public/tok2/download")
                        .header("User-Agent", "curl/8.6.0"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "https://minio.local/bucket/file.zip?X-Amz-Signature=ok"));

        when(downloadShareLinkService.issuePresignedDownloadUrl("tok2", null))
                .thenThrow(BaseException.from(BaseResponseStatus.SHARE_LINK_DOWNLOAD_LIMIT_REACHED));

        mockMvc.perform(get("/file/share-links/public/tok2/download")
                        .header("Accept", "application/json"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value(7403));

        mockMvc.perform(get("/file/share-links/public/tok2/download")
                        .header("Accept", "text/html,application/xhtml+xml"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "/share-link/tok2"));
    }
}
