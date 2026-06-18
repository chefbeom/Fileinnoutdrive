package com.example.WaffleBear.config.oauth2;

import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.TokenDto;
import com.example.WaffleBear.user.service.AuthService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
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

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Value("${app.secure-cookie:false}")
    private boolean secureCookie;

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

        Cookie refreshCookie = new Cookie("refresh", tokens.refreshToken());
        refreshCookie.setMaxAge(14 * 24 * 60 * 60);
        refreshCookie.setHttpOnly(true);
        refreshCookie.setPath("/");
        refreshCookie.setSecure(secureCookie);
        response.addCookie(refreshCookie);

        clearAuthenticationAttributes(request);

        String redirectUrl = UriComponentsBuilder
                .fromUriString(frontendUrl)
                .path("/main/home")
                .queryParam("accessToken", tokens.accessToken())
                .build()
                .toUriString();
        getRedirectStrategy().sendRedirect(request, response, redirectUrl);
    }
}
