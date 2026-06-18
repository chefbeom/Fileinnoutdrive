package com.example.WaffleBear.config.oauth2;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "app.admin-only=false",
        "REDIS_HOST=127.0.0.1",
        "REDIS_PORT=6379"
})
@ActiveProfiles("test")
@AutoConfigureMockMvc
class OAuth2AuthorizationEndpointTest {
    @Autowired
    private MockMvc mockMvc;

    @ParameterizedTest
    @CsvSource({
            "google,accounts.google.com",
            "kakao,kauth.kakao.com",
            "naver,nid.naver.com"
    })
    void authorizationEndpointRedirectsToProvider(String provider, String expectedHost) throws Exception {
        mockMvc.perform(get("/api/oauth2/authorization/{provider}", provider).contextPath("/api"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", containsString(expectedHost)))
                .andExpect(cookie().exists("OAUTH2_REQUEST"));
    }
}
