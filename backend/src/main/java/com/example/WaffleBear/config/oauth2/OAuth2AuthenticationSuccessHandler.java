package com.example.WaffleBear.config.oauth2;

import com.example.WaffleBear.config.CookieResponseWriter;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.TokenDto;
import com.example.WaffleBear.user.service.AuthService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.util.Locale;

@Component
@RequiredArgsConstructor
public class OAuth2AuthenticationSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final AuthService authService;
    private final CookieResponseWriter cookieResponseWriter;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Value("${app.admin-only:false}")
    private boolean adminOnly;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException, ServletException {
        AuthUserDetails user = (AuthUserDetails) authentication.getPrincipal();

        if (!user.isEnabled() || (adminOnly && !isAdmin(user))) {
            clearAuthenticationAttributes(request);
            String errorCode = adminOnly ? "admin_only" : "account_disabled";
            String errorRedirectUrl = UriComponentsBuilder
                    .fromUriString(frontendUrl)
                    .path("/login")
                    .queryParam("oauthError", errorCode)
                    .build()
                    .toUriString();
            getRedirectStrategy().sendRedirect(request, response, errorRedirectUrl);
            return;
        }

        TokenDto.AuthTokenResponse tokens = authService.issueTokens(
                user.getIdx(),
                user.getId(),
                user.getEmail(),
                user.getName(),
                user.getRole()
        );

        cookieResponseWriter.addRefreshCookie(response, tokens.refreshToken());

        clearAuthenticationAttributes(request);

        String redirectUrl = UriComponentsBuilder
                .fromUriString(frontendUrl)
                .path("/main/home")
                .build()
                .toUriString();
        getRedirectStrategy().sendRedirect(request, response, redirectUrl);
    }

    private boolean isAdmin(AuthUserDetails user) {
        String role = user != null ? user.getRole() : null;
        return role != null && role.toUpperCase(Locale.ROOT).contains("ADMIN");
    }
}
