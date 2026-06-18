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
    void healthVersionEndpointRemainsPublic() throws Exception {
        mockMvc.perform(get("/api/test/version").contextPath("/api"))
                .andExpect(status().isOk());
    }

    @Test
    void oauthProviderStatusEndpointRemainsPublic() throws Exception {
        mockMvc.perform(get("/api/auth/oauth2/providers").contextPath("/api"))
                .andExpect(status().isOk());
    }
}
