package com.example.WaffleBear.config.oauth2;

import com.example.WaffleBear.config.CookieResponseWriter;
import com.example.WaffleBear.utils.Aes256;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.apache.commons.lang3.SerializationUtils;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Component
@RequiredArgsConstructor
public class OAuth2AuthorizationRequestRepository implements AuthorizationRequestRepository<OAuth2AuthorizationRequest> {
    private static final String OAUTH2_REQUEST_COOKIE_NAME = "OAUTH2_REQUEST";
    private static final int OAUTH2_REQUEST_COOKIE_MAX_AGE_SECONDS = (int) Duration.ofMinutes(5).toSeconds();

    private final CookieResponseWriter cookieResponseWriter;

    @Override
    public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
        Cookie cookie = findCookie(request, OAUTH2_REQUEST_COOKIE_NAME);
        if (cookie == null) {
            return null;
        }

        try {
            return (OAuth2AuthorizationRequest) SerializationUtils.deserialize(
                    Aes256.decrypt(cookie.getValue().getBytes(StandardCharsets.UTF_8))
            );
        } catch (RuntimeException e) {
            return null;
        }
    }

    @Override
    public void saveAuthorizationRequest(OAuth2AuthorizationRequest authorizationRequest, HttpServletRequest request, HttpServletResponse response) {
        if (authorizationRequest == null) {
            clearAuthorizationRequestCookie(response);
            return;
        }

        cookieResponseWriter.addOAuth2RequestCookie(response,
                Aes256.encrypt(SerializationUtils.serialize(authorizationRequest)),
                OAUTH2_REQUEST_COOKIE_MAX_AGE_SECONDS);
    }

    @Override
    public OAuth2AuthorizationRequest removeAuthorizationRequest(HttpServletRequest request, HttpServletResponse response) {
        OAuth2AuthorizationRequest authorizationRequest = loadAuthorizationRequest(request);
        clearAuthorizationRequestCookie(response);
        return authorizationRequest;
    }

    private Cookie findCookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }

        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName())) {
                return cookie;
            }
        }
        return null;
    }

    private void clearAuthorizationRequestCookie(HttpServletResponse response) {
        cookieResponseWriter.clearOAuth2RequestCookie(response);
    }
}
