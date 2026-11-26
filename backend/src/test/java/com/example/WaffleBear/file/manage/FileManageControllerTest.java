package com.example.WaffleBear.file.manage;

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

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class FileManageControllerTest {

    private static final String AUTH_USER_ATTR = "authUser";

    @Mock
    private FileManageService fileManageService;

    @Mock
    private FileThumbnailQueryService fileThumbnailQueryService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        FileManageController controller = new FileManageController(fileManageService, fileThumbnailQueryService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setCustomArgumentResolvers(authUserArgumentResolver())
                .build();
    }

    @Test
    void moveToVaultEndpointAcceptsOptionalBodyAndDelegatesToService() throws Exception {
        when(fileManageService.moveToVault(7L, 15L, null))
                .thenReturn(FileCommonDto.FileActionRes.builder()
                        .targetIdx(null)
                        .action("move-to-vault")
                        .affectedCount(1)
                        .build());

        mockMvc.perform(patch("/file/{fileIdx}/move-to-vault", 15L)
                        .requestAttr(AUTH_USER_ATTR, authenticatedUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action").value("move-to-vault"))
                .andExpect(jsonPath("$.affectedCount").value(1));

        verify(fileManageService).moveToVault(7L, 15L, null);
    }

    @Test
    void moveBatchToVaultAndTargetSpaceRoutesToVaultMove() throws Exception {
        when(fileManageService.moveFilesToVault(7L, List.of(10L, 11L), 20L))
                .thenReturn(FileCommonDto.FileActionRes.builder()
                        .targetIdx(20L)
                        .action("move-to-vault")
                        .affectedCount(2)
                        .build());

        mockMvc.perform(patch("/file/move-to-vault")
                        .requestAttr(AUTH_USER_ATTR, authenticatedUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileIdxList\":[10,11],\"targetParentId\":20}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.targetIdx").value(20))
                .andExpect(jsonPath("$.action").value("move-to-vault"))
                .andExpect(jsonPath("$.affectedCount").value(2));

        verify(fileManageService).moveFilesToVault(7L, List.of(10L, 11L), 20L);

        mockMvc.perform(patch("/file/move")
                        .requestAttr(AUTH_USER_ATTR, authenticatedUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileIdxList\":[10,11],\"targetParentId\":20,\"targetSpaceType\":\"VAULT\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action").value("move-to-vault"));
    }

    @Test
    void moveFromVaultSingleAndBatchEndpointsDelegateWithRestoreOriginalParentFlag() throws Exception {
        when(fileManageService.moveFromVault(7L, 55L, null, true))
                .thenReturn(FileCommonDto.FileActionRes.builder()
                        .targetIdx(12L)
                        .action("move-from-vault")
                        .affectedCount(1)
                        .build());

        mockMvc.perform(patch("/file/{fileIdx}/move-from-vault", 55L)
                        .requestAttr(AUTH_USER_ATTR, authenticatedUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"restoreOriginalParent\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.targetIdx").value(12))
                .andExpect(jsonPath("$.action").value("move-from-vault"));

        verify(fileManageService).moveFromVault(7L, 55L, null, true);

        when(fileManageService.moveFilesFromVault(7L, List.of(55L, 56L), 30L, false))
                .thenReturn(FileCommonDto.FileActionRes.builder()
                        .targetIdx(30L)
                        .action("move-from-vault")
                        .affectedCount(2)
                        .build());

        mockMvc.perform(patch("/file/move-from-vault")
                        .requestAttr(AUTH_USER_ATTR, authenticatedUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileIdxList\":[55,56],\"targetParentId\":30,\"restoreOriginalParent\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.targetIdx").value(30))
                .andExpect(jsonPath("$.affectedCount").value(2));

        verify(fileManageService).moveFilesFromVault(7L, List.of(55L, 56L), 30L, false);
    }

    @Test
    void setFavoriteEndpointDelegatesBatchRequest() throws Exception {
        when(fileManageService.setFavoriteFiles(7L, List.of(10L, 11L), true))
                .thenReturn(FileCommonDto.FileActionRes.builder()
                        .action("favorite")
                        .affectedCount(2)
                        .build());

        mockMvc.perform(patch("/file/favorite")
                        .requestAttr(AUTH_USER_ATTR, authenticatedUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fileIdxList\":[10,11],\"favorite\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action").value("favorite"))
                .andExpect(jsonPath("$.affectedCount").value(2));

        verify(fileManageService).setFavoriteFiles(7L, List.of(10L, 11L), true);
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
        return AuthUserDetails.builder()
                .idx(7L)
                .id("user@example.com")
                .email("user@example.com")
                .name("User")
                .role("ROLE_USER")
                .enable(true)
                .build();
    }
}
