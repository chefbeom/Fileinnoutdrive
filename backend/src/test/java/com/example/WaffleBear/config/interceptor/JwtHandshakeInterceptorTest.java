package com.example.WaffleBear.config.interceptor;

import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.service.AuthService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.web.socket.WebSocketHandler;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JwtHandshakeInterceptorTest {

    @Test
    void rejectsRevokedOrDisabledRefreshCookieAndAcceptsValidSession() {
        AuthService authService = mock(AuthService.class);
        JwtHandshakeInterceptor interceptor = new JwtHandshakeInterceptor(authService);

        MockHttpServletRequest badReq = new MockHttpServletRequest();
        badReq.setCookies(new Cookie("refresh", "revoked-token"));
        when(authService.resolveUserByRefreshToken("revoked-token")).thenReturn(null);

        assertThat(interceptor.beforeHandshake(
                new ServletServerHttpRequest(badReq),
                new ServletServerHttpResponse(new MockHttpServletResponse()),
                mock(WebSocketHandler.class),
                new HashMap<>()
        )).isFalse();

        MockHttpServletRequest suspendedReq = new MockHttpServletRequest();
        suspendedReq.setCookies(new Cookie("refresh", "suspended-token"));
        when(authService.resolveUserByRefreshToken("suspended-token")).thenReturn(AuthUserDetails.builder()
                .idx(9L)
                .email("blocked@test.local")
                .role("ROLE_USER")
                .enable(false)
                .accountStatus(UserAccountStatus.SUSPENDED)
                .build());

        assertThat(interceptor.beforeHandshake(
                new ServletServerHttpRequest(suspendedReq),
                new ServletServerHttpResponse(new MockHttpServletResponse()),
                mock(WebSocketHandler.class),
                new HashMap<>()
        )).isFalse();

        MockHttpServletRequest okReq = new MockHttpServletRequest();
        okReq.setCookies(new Cookie("refresh", "valid-token"));
        when(authService.resolveUserByRefreshToken("valid-token")).thenReturn(AuthUserDetails.builder()
                .idx(10L)
                .email("ok@test.local")
                .role("ROLE_USER")
                .enable(true)
                .accountStatus(UserAccountStatus.ACTIVE)
                .build());

        Map<String, Object> attrs = new HashMap<>();
        assertThat(interceptor.beforeHandshake(
                new ServletServerHttpRequest(okReq),
                new ServletServerHttpResponse(new MockHttpServletResponse()),
                mock(WebSocketHandler.class),
                attrs
        )).isTrue();
        assertThat(attrs.get("user")).isInstanceOf(Authentication.class);
    }
}
