package com.example.WaffleBear.config.oauth2;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "app.admin-only=false",
        "REDIS_HOST=127.0.0.1",
        "REDIS_PORT=6379",
        "spring.security.oauth2.client.registration.google.client-id=google-client",
        "spring.security.oauth2.client.registration.google.client-secret=google-secret",
        "spring.security.oauth2.client.registration.kakao.client-id=kakao-client",
        "spring.security.oauth2.client.registration.kakao.client-secret=kakao-secret",
        "spring.security.oauth2.client.registration.naver.client-id=naver-client",
        "spring.security.oauth2.client.registration.naver.client-secret=disabled"
})
@ActiveProfiles("test")
@AutoConfigureMockMvc
class OAuth2ProviderStatusEndpointTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void providerStatusExposesOnlyAvailabilityWithoutSecrets() throws Exception {
        mockMvc.perform(get("/api/auth/oauth2/providers").contextPath("/api"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.adminOnly").value(false))
                .andExpect(jsonPath("$.providers[0].id").value("google"))
                .andExpect(jsonPath("$.providers[0].enabled").value(true))
                .andExpect(jsonPath("$.providers[0].authorizationUrl").value("/oauth2/authorization/google"))
                .andExpect(jsonPath("$.providers[1].id").value("kakao"))
                .andExpect(jsonPath("$.providers[1].enabled").value(true))
                .andExpect(jsonPath("$.providers[1].authorizationUrl").value("/oauth2/authorization/kakao"))
                .andExpect(jsonPath("$.providers[2].id").value("naver"))
                .andExpect(jsonPath("$.providers[2].enabled").value(false))
                .andExpect(jsonPath("$.providers[2].authorizationUrl").doesNotExist());
    }
}
