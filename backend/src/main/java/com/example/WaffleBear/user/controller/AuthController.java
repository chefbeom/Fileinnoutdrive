package com.example.WaffleBear.user.controller;

import com.example.WaffleBear.administrator.SocialLoginSettingsService;
import com.example.WaffleBear.config.CookieResponseWriter;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.TokenDto;
import com.example.WaffleBear.user.service.AuthService;
import com.example.WaffleBear.user.service.DemoAccountService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
@Tag(name = "Auth", description = "Token lifecycle APIs")
public class AuthController {

    private final AuthService authService;
    private final DemoAccountService demoAccountService;
    private final CookieResponseWriter cookieResponseWriter;
    private final SocialLoginSettingsService socialLoginSettingsService;

    @Value("${app.admin-only:false}")
    private boolean adminOnly;

    @Value("${spring.security.oauth2.client.registration.google.client-id:}")
    private String googleClientId;

    @Value("${spring.security.oauth2.client.registration.google.client-secret:}")
    private String googleClientSecret;

    @Value("${spring.security.oauth2.client.registration.kakao.client-id:}")
    private String kakaoClientId;

    @Value("${spring.security.oauth2.client.registration.kakao.client-secret:}")
    private String kakaoClientSecret;

    @Value("${spring.security.oauth2.client.registration.naver.client-id:}")
    private String naverClientId;

    @Value("${spring.security.oauth2.client.registration.naver.client-secret:}")
    private String naverClientSecret;

    @GetMapping("/oauth2/providers")
    @Operation(summary = "OAuth2 provider status", description = "Returns public social-login provider availability.")
    public ResponseEntity<OAuthProviderStatusRes> oauth2Providers() {
        boolean socialLoginVisible = socialLoginSettingsService.isSocialLoginVisible();
        return ResponseEntity.ok(new OAuthProviderStatusRes(
                adminOnly,
                socialLoginVisible,
                List.of(
                        provider("google", "Google", googleClientId, googleClientSecret),
                        provider("kakao", "Kakao", kakaoClientId, kakaoClientSecret),
                        provider("naver", "Naver", naverClientId, naverClientSecret)
                )
        ));
    }

    @PostMapping("/demo-login")
    @Operation(summary = "Demo login", description = "Resets demo data and starts an isolated demo session.")
    public ResponseEntity<DemoLoginRes> demoLogin(HttpServletResponse response) {
        if (adminOnly || !demoAccountService.isEnabled()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        TokenDto.AuthTokenResponse tokens = demoAccountService.loginAndReset();
        response.setHeader("Authorization", "Bearer " + tokens.accessToken());
        cookieResponseWriter.addSessionRefreshCookie(response, tokens.refreshToken());
        return ResponseEntity.ok(new DemoLoginRes(tokens.accessToken()));
    }

    @PostMapping("/reissue")
    @Operation(summary = "Reissue token", description = "Reissues access and refresh tokens using the refresh cookie.")
    public ResponseEntity<?> reissue(HttpServletRequest request, HttpServletResponse response) {
        String refreshToken = null;
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (cookie.getName().equals("refresh")) {
                    refreshToken = cookie.getValue();
                    break;
                }
            }
        }

        TokenDto.AuthTokenResponse tokens = authService.reissue(refreshToken);

        response.setHeader("Authorization", "Bearer " + tokens.accessToken());
        cookieResponseWriter.addRefreshCookie(response, tokens.refreshToken());

        return ResponseEntity.ok().body("토큰 재발급 완료");
    }

    @PostMapping("/logout")
    @Operation(summary = "Logout", description = "Invalidates the refresh token and clears the refresh cookie.")
    public ResponseEntity<?> logout(
            HttpServletRequest request,
            HttpServletResponse response,
            @AuthenticationPrincipal AuthUserDetails userDetails) {
        String refreshToken = null;
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (cookie.getName().equals("refresh")) {
                    refreshToken = cookie.getValue();
                    break;
                }
            }
        }

        AuthUserDetails sessionUser = userDetails != null
                ? userDetails
                : authService.resolveUserByRefreshToken(refreshToken);
        demoAccountService.resetAfterLogout(sessionUser);

        if (refreshToken != null) {
            authService.logout(refreshToken);
        }
        cookieResponseWriter.clearRefreshCookie(response);

        return ResponseEntity.ok().body("로그아웃 완료");
    }

    private OAuthProviderRes provider(String id, String label, String clientId, String clientSecret) {
        boolean enabled = !adminOnly && isConfiguredCredential(clientId) && isConfiguredCredential(clientSecret);
        return new OAuthProviderRes(
                id,
                label,
                enabled,
                enabled ? "/oauth2/authorization/" + id : null
        );
    }

    private boolean isConfiguredCredential(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }

        String normalized = value.trim().toLowerCase();
        return !normalized.equals("disabled")
                && !normalized.equals("dummy")
                && !normalized.startsWith("dummy-");
    }

    public record DemoLoginRes(String accessToken) {
    }

    public record OAuthProviderStatusRes(
            boolean adminOnly,
            boolean socialLoginVisible,
            List<OAuthProviderRes> providers
    ) {
    }

    public record OAuthProviderRes(String id, String label, boolean enabled, String authorizationUrl) {
    }
}
