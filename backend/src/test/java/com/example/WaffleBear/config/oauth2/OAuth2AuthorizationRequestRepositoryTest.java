package com.example.WaffleBear.config.oauth2;

import com.example.WaffleBear.config.CookieResponseWriter;
import com.example.WaffleBear.utils.Aes256;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

class OAuth2AuthorizationRequestRepositoryTest {
    private OAuth2AuthorizationRequestRepository repository;

    @BeforeEach
    void setUp() {
        new Aes256().setSecretKey("aessecretkey01234567891011121314");
        CookieResponseWriter cookieResponseWriter = new CookieResponseWriter();
        ReflectionTestUtils.setField(cookieResponseWriter, "secureCookie", false);
        ReflectionTestUtils.setField(cookieResponseWriter, "sameSite", "Lax");
        repository = new OAuth2AuthorizationRequestRepository(cookieResponseWriter);
    }

    @Test
    void saveLoadAndRemoveAuthorizationRequest() {
        OAuth2AuthorizationRequest authorizationRequest = OAuth2AuthorizationRequest.authorizationCode()
                .authorizationUri("https://accounts.example.test/oauth/authorize")
                .clientId("client-id")
                .redirectUri("http://localhost/api/login/oauth2/code/google")
                .state("state-123")
                .build();

        MockHttpServletResponse saveResponse = new MockHttpServletResponse();
        repository.saveAuthorizationRequest(authorizationRequest, new MockHttpServletRequest(), saveResponse);

        String storedCookieHeader = saveResponse.getHeader(HttpHeaders.SET_COOKIE);
        assertThat(storedCookieHeader)
                .contains("OAUTH2_REQUEST=")
                .contains("Max-Age=300")
                .contains("Path=/")
                .contains("HttpOnly")
                .contains("SameSite=Lax")
                .doesNotContain("Secure");

        Cookie storedCookie = cookieFromSetCookie(storedCookieHeader);
        MockHttpServletRequest callbackRequest = new MockHttpServletRequest();
        callbackRequest.setCookies(storedCookie);

        OAuth2AuthorizationRequest loadedRequest = repository.loadAuthorizationRequest(callbackRequest);
        assertThat(loadedRequest).isNotNull();
        assertThat(loadedRequest.getState()).isEqualTo("state-123");
        assertThat(loadedRequest.getRedirectUri()).isEqualTo("http://localhost/api/login/oauth2/code/google");

        MockHttpServletResponse removeResponse = new MockHttpServletResponse();
        OAuth2AuthorizationRequest removedRequest = repository.removeAuthorizationRequest(callbackRequest, removeResponse);

        assertThat(removedRequest).isNotNull();
        assertThat(removedRequest.getState()).isEqualTo("state-123");
        assertThat(removeResponse.getHeader(HttpHeaders.SET_COOKIE))
                .contains("OAUTH2_REQUEST=")
                .contains("Max-Age=0")
                .contains("SameSite=Lax");
    }

    @Test
    void loadWithoutCookieReturnsNull() {
        assertThat(repository.loadAuthorizationRequest(new MockHttpServletRequest())).isNull();
    }

    @Test
    void loadInvalidCookieReturnsNull() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie("OAUTH2_REQUEST", "invalid-cookie-value"));

        assertThat(repository.loadAuthorizationRequest(request)).isNull();
    }

    private Cookie cookieFromSetCookie(String setCookie) {
        String nameValue = setCookie.split(";", 2)[0];
        String[] pair = nameValue.split("=", 2);
        return new Cookie(pair[0], pair.length > 1 ? pair[1] : "");
    }
}