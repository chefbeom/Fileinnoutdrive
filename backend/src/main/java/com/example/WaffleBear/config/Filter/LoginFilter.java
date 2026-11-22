package com.example.WaffleBear.config.Filter;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.config.CookieResponseWriter;
import com.example.WaffleBear.file.secret.PinAttemptLimiter;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.TokenDto;
import com.example.WaffleBear.user.model.UserDto;
import com.example.WaffleBear.user.service.AuthService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Locale;
import java.util.Map;

@Component
public class LoginFilter extends UsernamePasswordAuthenticationFilter {
    private static final int MAX_LOGIN_ATTEMPTS = 10;
    private static final String ATTR_LOGIN_EMAIL = LoginFilter.class.getName() + ".EMAIL";
    private static final String ATTR_LOGIN_IP = LoginFilter.class.getName() + ".IP";

    private final AuthenticationManager authenticationManager;
    private final AuthService authService;
    private final CookieResponseWriter cookieResponseWriter;
    private final PinAttemptLimiter fallbackAttemptLimiter = new PinAttemptLimiter();

    @Autowired(required = false)
    private PinAttemptLimiter pinAttemptLimiter;

    @Value("${app.admin-only:false}")
    private boolean adminOnly;

    public LoginFilter(
            AuthenticationManager authenticationManager,
            AuthService authService,
            CookieResponseWriter cookieResponseWriter) {

        super(authenticationManager);
        this.authenticationManager = authenticationManager;
        this.authService = authService;
        this.cookieResponseWriter = cookieResponseWriter;
    }

    @Override
    protected void successfulAuthentication(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain,
            Authentication authResult) throws IOException, ServletException {

        AuthUserDetails user = (AuthUserDetails) authResult.getPrincipal();
        clearLoginFailures(request, user.getEmail());
        if (adminOnly && !isAdmin(user)) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json;charset=UTF-8");
            new ObjectMapper().writeValue(response.getWriter(), Map.of(
                    "error", "admin account required"
            ));
            return;
        }

        TokenDto.AuthTokenResponse tokens = authService.issueTokens(
                user.getIdx(),
                user.getId(),
                user.getEmail(),
                user.getName(),
                user.getRole()
        );

        response.setHeader("Authorization", "Bearer " + tokens.accessToken());
        cookieResponseWriter.addRefreshCookie(response, tokens.refreshToken());

        response.setContentType("application/json;charset=UTF-8");
        new ObjectMapper().writeValue(response.getWriter(), Map.of(
                "accessToken", tokens.accessToken(),
                "email", user.getEmail(),
                "role", user.getRole()
        ));
    }

    @Override
    protected void unsuccessfulAuthentication(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException failed) throws IOException, ServletException {

        if (failed instanceof LoginRateLimitedException) {
            response.setStatus(429);
            response.setContentType("application/json;charset=UTF-8");
            new ObjectMapper().writeValue(response.getWriter(), Map.of(
                    "error", "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요."
            ));
            return;
        }

        recordLoginFailure(request);
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        new ObjectMapper().writeValue(response.getWriter(), Map.of(
                "error", "로그인 실패"
        ));
    }

    @Override
    public Authentication attemptAuthentication(
            HttpServletRequest request,
            HttpServletResponse response) throws AuthenticationException {

        String email = "";
        String clientIp = resolveClientIp(request);
        if (request != null) {
            request.setAttribute(ATTR_LOGIN_IP, clientIp);
        }

        try {
            UserDto.LoginReq dto = new ObjectMapper().readValue(
                    request.getInputStream(),
                    UserDto.LoginReq.class);
            email = dto != null && dto.email() != null ? dto.email().trim().toLowerCase(Locale.ROOT) : "";
            if (!email.isEmpty()) {
                request.setAttribute(ATTR_LOGIN_EMAIL, email);
            }

            assertNotRateLimited(email, clientIp);

            UsernamePasswordAuthenticationToken token =
                    new UsernamePasswordAuthenticationToken(
                            dto != null ? dto.email() : null,
                            dto != null ? dto.password() : null,
                            null);

            return authenticationManager.authenticate(token);
        } catch (IOException e) {
            assertNotRateLimited("", clientIp);
            throw new BadCredentialsException("Invalid login request payload", e);
        }
    }

    private void assertNotRateLimited(String email, String clientIp) {
        PinAttemptLimiter limiter = resolveLimiter();
        try {
            if (email != null && !email.isBlank()) {
                limiter.assertNotLocked("login-email:" + email);
            }
            if (clientIp != null && !clientIp.isBlank()) {
                limiter.assertNotLocked("login-ip:" + clientIp);
            }
        } catch (BaseException ex) {
            throw new LoginRateLimitedException("Too many failed login attempts");
        }
    }

    private void recordLoginFailure(HttpServletRequest request) {
        if (request == null) {
            return;
        }
        PinAttemptLimiter limiter = resolveLimiter();
        Object emailAttr = request.getAttribute(ATTR_LOGIN_EMAIL);
        if (emailAttr instanceof String email && !email.isBlank()) {
            limiter.recordFailure("login-email:" + email, MAX_LOGIN_ATTEMPTS);
        }
        Object ipAttr = request.getAttribute(ATTR_LOGIN_IP);
        if (ipAttr instanceof String clientIp && !clientIp.isBlank()) {
            limiter.recordFailure("login-ip:" + clientIp, MAX_LOGIN_ATTEMPTS);
        }
    }

    private void clearLoginFailures(HttpServletRequest request, String authenticatedEmail) {
        PinAttemptLimiter limiter = resolveLimiter();
        String email = authenticatedEmail != null
                ? authenticatedEmail.trim().toLowerCase(Locale.ROOT)
                : (request != null && request.getAttribute(ATTR_LOGIN_EMAIL) instanceof String attr ? attr : "");
        if (!email.isBlank()) {
            limiter.clearFailures("login-email:" + email);
        }
        if (request != null && request.getAttribute(ATTR_LOGIN_IP) instanceof String clientIp && !clientIp.isBlank()) {
            limiter.clearFailures("login-ip:" + clientIp);
        }
    }

    private PinAttemptLimiter resolveLimiter() {
        return pinAttemptLimiter != null ? pinAttemptLimiter : fallbackAttemptLimiter;
    }

    private String resolveClientIp(HttpServletRequest request) {
        if (request == null) {
            return "";
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        String remoteAddr = request.getRemoteAddr();
        return remoteAddr == null ? "" : remoteAddr.trim();
    }

    private boolean isAdmin(AuthUserDetails user) {
        String role = user != null ? user.getRole() : null;
        return role != null && role.toUpperCase(Locale.ROOT).contains("ADMIN");
    }

    private static final class LoginRateLimitedException extends AuthenticationException {
        private LoginRateLimitedException(String msg) {
            super(msg);
        }
    }
}
