package com.example.WaffleBear.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "app.admin-only=true",
        "REDIS_HOST=127.0.0.1",
        "REDIS_PORT=6379"
})
@ActiveProfiles("test")
@AutoConfigureMockMvc
class SecurityBoundaryTest {
    @Autowired
    private MockMvc mockMvc;

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/file/list",
            "/api/file/share/shared/list",
            "/api/workspace/list",
            "/api/workspace/realtime/authorize?workspaceIdx=42",
            "/api/sse/connect",
            "/api/notification/list",
            "/api/group/relationships",
            "/api/administrator/dashboard"
    })
    void protectedEndpointsRejectAnonymousRequests(String path) throws Exception {
        mockMvc.perform(get(path).contextPath("/api"))
                .andExpect(result ->
                        assertThat(result.getResponse().getStatus()).isIn(401, 403)
                );
    }

    @Test
    void administratorEndpointsRejectAuthenticatedNonAdminUsers() throws Exception {
        mockMvc.perform(get("/api/administrator/dashboard").contextPath("/api")
                        .with(user("member@example.com").roles("USER")))
                .andExpect(status().isForbidden());
    }
    @Test
    void actuatorHealthEndpointRemainsPublic() throws Exception {
        mockMvc.perform(get("/api/actuator/health").contextPath("/api"))
                .andExpect(result ->
                        assertThat(result.getResponse().getStatus()).isIn(200, 503)
                );
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/actuator",
            "/api/actuator/info",
            "/api/actuator/metrics",
            "/api/actuator/env"
    })
    void actuatorNonHealthEndpointsAreNotPubliclyAvailable(String path) throws Exception {
        mockMvc.perform(get(path).contextPath("/api"))
                .andExpect(result ->
                        assertThat(result.getResponse().getStatus()).isIn(401, 403, 404)
                );
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/actuator/info",
            "/api/actuator/metrics",
            "/api/actuator/env"
    })
    void actuatorNonHealthEndpointsAreNotMappedEvenForAuthenticatedUsers(String path) throws Exception {
        mockMvc.perform(get(path).contextPath("/api")
                        .with(user("admin@example.com").roles("ADMIN")))
                .andExpect(status().isNotFound());
    }

    @Test
    void testVersionEndpointRejectsAnonymousRequestsByDefault() throws Exception {
        mockMvc.perform(get("/api/test/version").contextPath("/api"))
                .andExpect(result ->
                        assertThat(result.getResponse().getStatus()).isIn(401, 403)
                );
    }

    @Test
    void testVersionEndpointIsNotMappedForAuthenticatedRequests() throws Exception {
        mockMvc.perform(get("/api/test/version").contextPath("/api")
                        .with(user("admin@example.com").roles("ADMIN")))
                .andExpect(status().isNotFound());
    }

    @Test
    void openApiDocsRejectAnonymousRequestsByDefault() throws Exception {
        mockMvc.perform(get("/api/v3/api-docs").contextPath("/api"))
                .andExpect(result ->
                        assertThat(result.getResponse().getStatus()).isIn(401, 403)
                );
    }

    @Test
    void oauthProviderStatusEndpointRemainsPublic() throws Exception {
        mockMvc.perform(get("/api/auth/oauth2/providers").contextPath("/api"))
                .andExpect(status().isOk());
    }
}
