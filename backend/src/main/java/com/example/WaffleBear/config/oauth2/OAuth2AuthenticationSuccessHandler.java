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

@Component
@RequiredArgsConstructor
public class OAuth2AuthenticationSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final AuthService authService;
    private final CookieResponseWriter cookieResponseWriter;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException, ServletException {
        AuthUserDetails user = (AuthUserDetails) authentication.getPrincipal();

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
}
