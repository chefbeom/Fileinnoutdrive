package com.example.WaffleBear.config.Filter;

import com.example.WaffleBear.config.CookieResponseWriter;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.TokenDto;
import com.example.WaffleBear.user.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LoginFilterTest {

    private AuthenticationManager authenticationManager;
    private AuthService authService;
    private CookieResponseWriter cookieResponseWriter;
    private LoginFilter loginFilter;

    @BeforeEach
    void setUp() {
        authenticationManager = mock(AuthenticationManager.class);
        authService = mock(AuthService.class);
        cookieResponseWriter = mock(CookieResponseWriter.class);
        loginFilter = new LoginFilter(authenticationManager, authService, cookieResponseWriter);
        when(authService.issueTokens(anyLong(), anyString(), anyString(), anyString(), anyString()))
                .thenReturn(new TokenDto.AuthTokenResponse("access-1", "refresh-1"));
    }

    @Test
    void malformedJsonPayloadReturnsUnauthorizedInsteadOfThrowing() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/login");
        request.setServletPath("/login");
        request.setRemoteAddr("192.168.35.50");
        request.setContent("{not-json".getBytes(StandardCharsets.UTF_8));
        MockHttpServletResponse response = new MockHttpServletResponse();

        loginFilter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void rateLimitsAfterTenFailedLoginsAndClearsFailuresOnSuccess() throws Exception {
        when(authenticationManager.authenticate(any()))
                .thenThrow(new BadCredentialsException("bad credentials"));

        for (int attempt = 0; attempt < 10; attempt++) {
            MockHttpServletRequest request = loginRequest("victim@example.com", "wrong", "192.168.35.60");
            MockHttpServletResponse response = new MockHttpServletResponse();
            loginFilter.doFilter(request, response, new MockFilterChain());
            assertThat(response.getStatus()).isEqualTo(401);
        }

        MockHttpServletRequest blockedRequest = loginRequest("victim@example.com", "wrong", "192.168.35.61");
        MockHttpServletResponse blockedResponse = new MockHttpServletResponse();
        loginFilter.doFilter(blockedRequest, blockedResponse, new MockFilterChain());
        assertThat(blockedResponse.getStatus()).isEqualTo(429);

        AuthUserDetails user = AuthUserDetails.builder()
                .idx(7L)
                .id("other@example.com")
                .email("other@example.com")
                .name("Other")
                .role("ROLE_USER")
                .build();
        doReturn(new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()))
                .when(authenticationManager).authenticate(any());

        MockHttpServletRequest okRequest = loginRequest("other@example.com", "good-pass", "192.168.35.62");
        MockHttpServletResponse okResponse = new MockHttpServletResponse();
        loginFilter.doFilter(okRequest, okResponse, new MockFilterChain());
        assertThat(okResponse.getStatus()).isEqualTo(200);
    }

    private static MockHttpServletRequest loginRequest(String email, String password, String ip) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/login");
        request.setServletPath("/login");
        request.setRemoteAddr(ip);
        request.setContent(("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}")
                .getBytes(StandardCharsets.UTF_8));
        return request;
    }
}
