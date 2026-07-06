package com.example.WaffleBear.config.oauth2;

import com.example.WaffleBear.user.repository.UserRepository;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "app.admin-only=false",
        "app.frontend-url=http://localhost",
        "app.backend-url=http://localhost/api",
        "REDIS_HOST=127.0.0.1",
        "REDIS_PORT=6379",
        "spring.security.oauth2.client.registration.google.client-id=google-client",
        "spring.security.oauth2.client.registration.google.client-secret=google-secret",
        "spring.security.oauth2.client.registration.kakao.client-id=kakao-client",
        "spring.security.oauth2.client.registration.kakao.client-secret=kakao-secret",
        "spring.security.oauth2.client.registration.naver.client-id=naver-client",
        "spring.security.oauth2.client.registration.naver.client-secret=naver-secret"
})
@ActiveProfiles("test")
@AutoConfigureMockMvc
class OAuth2LoginCallbackFlowTest {
    private static HttpServer oauthServer;
    private static String oauthBaseUrl;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @DynamicPropertySource
    static void registerOAuthProviderProperties(DynamicPropertyRegistry registry) {
        startMockOAuthServer();

        registry.add("spring.security.oauth2.client.provider.google.authorization-uri", () -> oauthBaseUrl + "/google/authorize");
        registry.add("spring.security.oauth2.client.provider.google.token-uri", () -> oauthBaseUrl + "/google/token");
        registry.add("spring.security.oauth2.client.provider.google.user-info-uri", () -> oauthBaseUrl + "/google/userinfo");
        registry.add("spring.security.oauth2.client.provider.google.user-name-attribute", () -> "sub");

        registry.add("spring.security.oauth2.client.provider.kakao.authorization-uri", () -> oauthBaseUrl + "/kakao/authorize");
        registry.add("spring.security.oauth2.client.provider.kakao.token-uri", () -> oauthBaseUrl + "/kakao/token");
        registry.add("spring.security.oauth2.client.provider.kakao.user-info-uri", () -> oauthBaseUrl + "/kakao/userinfo");
        registry.add("spring.security.oauth2.client.provider.kakao.user-name-attribute", () -> "id");

        registry.add("spring.security.oauth2.client.provider.naver.authorization-uri", () -> oauthBaseUrl + "/naver/authorize");
        registry.add("spring.security.oauth2.client.provider.naver.token-uri", () -> oauthBaseUrl + "/naver/token");
        registry.add("spring.security.oauth2.client.provider.naver.user-info-uri", () -> oauthBaseUrl + "/naver/userinfo");
        registry.add("spring.security.oauth2.client.provider.naver.user-name-attribute", () -> "response");
    }

    @AfterAll
    static void stopMockOAuthServer() {
        if (oauthServer != null) {
            oauthServer.stop(0);
        }
    }

    @ParameterizedTest
    @CsvSource({
            "google,google-user@example.com,Google User",
            "kakao,kakao-user@example.com,Kakao User",
            "naver,naver-user@example.com,Naver User"
    })
    void oauth2LoginCallbackCreatesUserAndRedirectsWithoutAccessToken(
            String provider,
            String expectedEmail,
            String expectedName
    ) throws Exception {
        MvcResult authorizationResult = mockMvc
                .perform(get("/api/oauth2/authorization/{provider}", provider).contextPath("/api"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Set-Cookie", containsString("OAUTH2_REQUEST=")))
                .andExpect(header().string("Set-Cookie", containsString("SameSite=Lax")))
                .andReturn();

        Cookie authorizationCookie = cookieFromSetCookie(authorizationResult.getResponse().getHeader("Set-Cookie"));
        String state = queryParam(authorizationResult.getResponse().getRedirectedUrl(), "state");

        MvcResult callbackResult = mockMvc.perform(get("/api/login/oauth2/code/{provider}", provider)
                        .contextPath("/api")
                        .param("code", "mock-code-" + provider)
                        .param("state", state)
                        .cookie(authorizationCookie))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().stringValues("Set-Cookie", hasItem(containsString("refresh="))))
                .andExpect(header().stringValues("Set-Cookie", hasItem(containsString("SameSite=Lax"))))
                .andExpect(header().string("Location", "http://localhost/main/home"))
                .andReturn();

        assertThat(callbackResult.getResponse().getRedirectedUrl())
                .doesNotContain("accessToken")
                .doesNotContain("mock-access-token");
        assertThat(userRepository.findByEmail(expectedEmail))
                .isPresent()
                .get()
                .satisfies(user -> {
                    assertThat(user.getName()).isEqualTo(expectedName);
                    assertThat(user.getRole()).isEqualTo("ROLE_USER");
                    assertThat(user.getEnable()).isTrue();
                });
    }

    private static Cookie cookieFromSetCookie(String setCookie) {
        String nameValue = setCookie.split(";", 2)[0];
        String[] pair = nameValue.split("=", 2);
        return new Cookie(pair[0], pair.length > 1 ? pair[1] : "");
    }
    private static void startMockOAuthServer() {
        if (oauthServer != null) {
            return;
        }

        try {
            oauthServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            oauthServer.setExecutor(Executors.newCachedThreadPool());

            for (String provider : new String[]{"google", "kakao", "naver"}) {
                oauthServer.createContext("/" + provider + "/authorize", exchange -> respondJson(exchange, "{}"));
                oauthServer.createContext("/" + provider + "/token", OAuth2LoginCallbackFlowTest::respondToken);
                oauthServer.createContext("/" + provider + "/userinfo", exchange -> respondJson(exchange, userInfoJson(provider)));
            }

            oauthServer.start();
            oauthBaseUrl = "http://127.0.0.1:" + oauthServer.getAddress().getPort();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to start mock OAuth2 server", e);
        }
    }

    private static void respondToken(HttpExchange exchange) throws IOException {
        respondJson(exchange, """
                {
                  "access_token": "mock-provider-access-token",
                  "token_type": "Bearer",
                  "expires_in": 3600,
                  "scope": "email profile"
                }
                """);
    }

    private static String userInfoJson(String provider) {
        return switch (provider) {
            case "google" -> """
                    {
                      "sub": "google-id",
                      "email": "google-user@example.com",
                      "name": "Google User"
                    }
                    """;
            case "kakao" -> """
                    {
                      "id": 123456,
                      "kakao_account": {
                        "email": "kakao-user@example.com",
                        "profile": {
                          "nickname": "Kakao User"
                        }
                      }
                    }
                    """;
            case "naver" -> """
                    {
                      "response": {
                        "id": "naver-id",
                        "email": "naver-user@example.com",
                        "name": "Naver User"
                      }
                    }
                    """;
            default -> "{}";
        };
    }

    private static void respondJson(HttpExchange exchange, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json;charset=UTF-8");
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream responseBody = exchange.getResponseBody()) {
            responseBody.write(body);
        }
    }

    private static String queryParam(String url, String name) {
        String rawQuery = URI.create(url).getRawQuery();
        assertThat(rawQuery).isNotBlank();

        for (String part : rawQuery.split("&")) {
            String[] pair = part.split("=", 2);
            String key = URLDecoder.decode(pair[0], StandardCharsets.UTF_8);
            if (name.equals(key)) {
                return pair.length > 1 ? URLDecoder.decode(pair[1], StandardCharsets.UTF_8) : "";
            }
        }

        throw new IllegalArgumentException("Missing query parameter: " + name);
    }
}
