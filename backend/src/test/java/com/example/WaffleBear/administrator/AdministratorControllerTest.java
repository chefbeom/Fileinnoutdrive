package com.example.WaffleBear.administrator;

import com.example.WaffleBear.administrator.model.AdministratorDto;
import com.example.WaffleBear.file.service.StoragePlanService;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdministratorControllerTest {

    private static final String AUTH_USER_ATTR = "authUser";

    @Mock
    private AdministratorService administratorService;

    @Mock
    private StorageAnalyticsService storageAnalyticsService;

    @Mock
    private SocialLoginSettingsService socialLoginSettingsService;

    @Mock
    private StoragePlanService storagePlanService;

    @Mock
    private AdministratorVaultEncryptionService administratorVaultEncryptionService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AdministratorController controller = new AdministratorController(
                administratorService,
                storageAnalyticsService,
                socialLoginSettingsService,
                storagePlanService,
                administratorVaultEncryptionService
        );
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setCustomArgumentResolvers(authUserArgumentResolver())
                .build();
    }

    @Test
    void returnsVaultEncryptionStatusForAdministrator() throws Exception {
        when(administratorVaultEncryptionService.getStatus(any()))
                .thenReturn(AdministratorDto.VaultEncryptionStatusRes.builder()
                        .totalVaultFiles(345L)
                        .encryptedVaultFiles(0L)
                        .plaintextVaultFiles(345L)
                        .plaintextBytes(102400L)
                        .encryptedBytes(0L)
                        .users(List.of())
                        .job(AdministratorDto.VaultEncryptionJobRes.builder().running(false).build())
                        .build());

        mockMvc.perform(get("/administrator/vault-encryption/status")
                        .requestAttr(AUTH_USER_ATTR, adminUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.totalVaultFiles").value(345))
                .andExpect(jsonPath("$.result.plaintextVaultFiles").value(345))
                .andExpect(jsonPath("$.result.job.running").value(false));
    }

    @Test
    void startsGlobalAndSingleUserVaultEncryptionMigration() throws Exception {
        when(administratorVaultEncryptionService.startMigration(any(), isNull()))
                .thenReturn(AdministratorDto.VaultEncryptionStatusRes.builder()
                        .totalVaultFiles(10L)
                        .plaintextVaultFiles(10L)
                        .job(AdministratorDto.VaultEncryptionJobRes.builder().running(true).scannedCount(10).build())
                        .build());
        when(administratorVaultEncryptionService.startMigration(any(), eq(7L)))
                .thenReturn(AdministratorDto.VaultEncryptionStatusRes.builder()
                        .totalVaultFiles(10L)
                        .plaintextVaultFiles(4L)
                        .job(AdministratorDto.VaultEncryptionJobRes.builder().running(true).targetUserIdx(7L).scannedCount(4).build())
                        .build());

        mockMvc.perform(post("/administrator/vault-encryption/migrate")
                        .requestAttr(AUTH_USER_ATTR, adminUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.job.running").value(true))
                .andExpect(jsonPath("$.result.job.scannedCount").value(10));

        verify(administratorVaultEncryptionService).startMigration(any(), isNull());

        mockMvc.perform(post("/administrator/vault-encryption/migrate")
                        .requestAttr(AUTH_USER_ATTR, adminUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIdx\":7}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.job.targetUserIdx").value(7))
                .andExpect(jsonPath("$.result.job.scannedCount").value(4));

        verify(administratorVaultEncryptionService).startMigration(any(), eq(7L));
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

    private static AuthUserDetails adminUser() {
        return AuthUserDetails.builder()
                .idx(1L)
                .id("admin@example.com")
                .email("admin@example.com")
                .name("Admin")
                .role("ROLE_ADMIN")
                .enable(true)
                .build();
    }
}
