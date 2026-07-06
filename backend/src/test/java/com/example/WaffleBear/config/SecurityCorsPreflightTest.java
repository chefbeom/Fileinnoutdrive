package com.example.WaffleBear.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "app.admin-only=true",
        "app.frontend-url=https://app.fileinnout.local",
        "app.cors.allowed-origin-patterns=https://app.fileinnout.local",
        "app.cors.allow-development-origin-patterns=false",
        "REDIS_HOST=127.0.0.1",
        "REDIS_PORT=6379"
})
@ActiveProfiles("test")
@AutoConfigureMockMvc
class SecurityCorsPreflightTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void allowsConfiguredOriginPreflightWithCredentials() throws Exception {
        mockMvc.perform(options("/api/file/list")
                        .contextPath("/api")
                        .header("Origin", "https://app.fileinnout.local")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://app.fileinnout.local"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    @Test
    void rejectsUnconfiguredPrivateNetworkOriginPreflight() throws Exception {
        mockMvc.perform(options("/api/file/list")
                        .contextPath("/api")
                        .header("Origin", "http://192.168.35.151:5173")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}