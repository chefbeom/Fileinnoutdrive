package com.example.WaffleBear.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "app.admin-only=true",
        "app.docs.public-openapi=true",
        "REDIS_HOST=127.0.0.1",
        "REDIS_PORT=6379"
})
@ActiveProfiles("test")
@AutoConfigureMockMvc
class SecurityPublicOpenApiTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void openApiDocsCanBeOpenedExplicitly() throws Exception {
        mockMvc.perform(get("/api/v3/api-docs").contextPath("/api"))
                .andExpect(status().isOk());
    }
}
