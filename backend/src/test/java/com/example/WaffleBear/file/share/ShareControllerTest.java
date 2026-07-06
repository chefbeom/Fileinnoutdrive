package com.example.WaffleBear.file.share;

import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.service.FileThumbnailQueryService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ShareControllerTest {

    private static final String AUTH_USER_ATTR = "authUser";

    @Mock
    private ShareService shareService;

    @Mock
    private FileThumbnailQueryService fileThumbnailQueryService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ShareController controller = new ShareController(shareService, fileThumbnailQueryService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setCustomArgumentResolvers(authUserArgumentResolver())
                .build();
    }

    @Test
    void shareFilesPassesAuthenticatedUserAndRequestBodyToService() throws Exception {
        when(shareService.shareFiles(
                eq(7L),
                eq(List.of(10L, 11L)),
                eq("recipient@example.com"),
                eq("DOWNLOAD"),
                eq(List.of("READ", "DOWNLOAD")),
                isNull(),
                eq(3),
                eq(" secret ")
        )).thenReturn(FileCommonDto.FileActionRes.builder()
                .targetIdx(null)
                .action("share")
                .affectedCount(2)
                .build());

        mockMvc.perform(post("/file/share")
                        .requestAttr(AUTH_USER_ATTR, authenticatedUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fileIdxList": [10, 11],
                                  "recipientEmail": "recipient@example.com",
                                  "permission": "DOWNLOAD",
                                  "permissions": ["READ", "DOWNLOAD"],
                                  "downloadLimit": 3,
                                  "sharePassword": " secret "
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action").value("share"))
                .andExpect(jsonPath("$.affectedCount").value(2));

        verify(shareService).shareFiles(
                eq(7L),
                eq(List.of(10L, 11L)),
                eq("recipient@example.com"),
                eq("DOWNLOAD"),
                eq(List.of("READ", "DOWNLOAD")),
                isNull(),
                eq(3),
                eq(" secret ")
        );
    }

    @Test
    void acceptSharedFilePassesAuthenticatedUserAndPathVariableToService() throws Exception {
        when(shareService.acceptSharedFile(7L, 10L))
                .thenReturn(FileCommonDto.FileActionRes.builder()
                        .targetIdx(10L)
                        .action("accept-share")
                        .affectedCount(2)
                        .build());

        mockMvc.perform(post("/file/share/shared/{fileIdx}/accept", 10L)
                        .requestAttr(AUTH_USER_ATTR, authenticatedUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.targetIdx").value(10L))
                .andExpect(jsonPath("$.action").value("accept-share"))
                .andExpect(jsonPath("$.affectedCount").value(2));

        verify(shareService).acceptSharedFile(7L, 10L);
    }

    @Test
    void downloadSharedFileBuildsAttachmentResponse() throws Exception {
        when(shareService.downloadSharedFile(7L, 10L, "pw"))
                .thenReturn(new FileCommonDto.FileDownloadPayload(
                        "hello".getBytes(),
                        "text/plain",
                        "report.txt",
                        5L
                ));

        mockMvc.perform(get("/file/share/shared/{fileIdx}/download", 10L)
                        .requestAttr(AUTH_USER_ATTR, authenticatedUser())
                        .header("X-FileInNOut-Share-Password", "pw"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Length", "5"))
                .andExpect(header().string("Content-Type", "text/plain"))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("report.txt")))
                .andExpect(content().bytes("hello".getBytes()));

        verify(shareService).downloadSharedFile(7L, 10L, "pw");
    }

    @Test
    void downloadLinkPassesSharePasswordHeaderAndWrapsUrl() throws Exception {
        when(shareService.getSharedFileDownloadUrl(7L, 10L, "pw"))
                .thenReturn("http://download.example/report.txt");

        mockMvc.perform(get("/file/share/shared/{fileIdx}/download-link", 10L)
                        .requestAttr(AUTH_USER_ATTR, authenticatedUser())
                        .header("X-FileInNOut-Share-Password", "pw"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.downloadUrl").value("http://download.example/report.txt"));

        verify(shareService).getSharedFileDownloadUrl(7L, 10L, "pw");
    }


    private HandlerMethodArgumentResolver authUserArgumentResolver() {
        return new HandlerMethodArgumentResolver() {
            @Override
            public boolean supportsParameter(MethodParameter parameter) {
                return AuthUserDetails.class.equals(parameter.getParameterType());
            }

            @Override
            public Object resolveArgument(
                    MethodParameter parameter,
                    ModelAndViewContainer mavContainer,
                    NativeWebRequest webRequest,
                    WebDataBinderFactory binderFactory
            ) {
                return webRequest.getAttribute(AUTH_USER_ATTR, NativeWebRequest.SCOPE_REQUEST);
            }
        };
    }

    private AuthUserDetails authenticatedUser() {
        AuthUserDetails user = AuthUserDetails.builder()
                .idx(7L)
                .id("user@example.com")
                .email("user@example.com")
                .name("User")
                .role("ROLE_USER")
                .enable(true)
                .build();
        return user;
    }
}