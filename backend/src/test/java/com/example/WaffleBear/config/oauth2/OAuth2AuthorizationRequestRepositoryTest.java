package com.example.WaffleBear.config.oauth2;

import com.example.WaffleBear.utils.Aes256;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class OAuth2AuthorizationRequestRepositoryTest {
    private OAuth2AuthorizationRequestRepository repository;

    @BeforeEach
    void setUp() {
        new Aes256().setSecretKey("aessecretkey01234567891011121314");
        repository = new OAuth2AuthorizationRequestRepository();
        ReflectionTestUtils.setField(repository, "secureCookie", false);
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

        Cookie storedCookie = saveResponse.getCookie("OAUTH2_REQUEST");
        assertThat(storedCookie).isNotNull();
        assertThat(storedCookie.isHttpOnly()).isTrue();
        assertThat(storedCookie.getSecure()).isFalse();
        assertThat(storedCookie.getMaxAge()).isEqualTo(300);

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
        assertThat(removeResponse.getCookie("OAUTH2_REQUEST").getMaxAge()).isZero();
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
}
