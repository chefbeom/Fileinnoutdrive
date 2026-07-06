package com.example.WaffleBear.config;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Locale;

@Component
public class CookieResponseWriter {
    private static final int REFRESH_COOKIE_MAX_AGE_SECONDS = (int) Duration.ofDays(14).toSeconds();

    @Value("${app.secure-cookie:false}")
    private boolean secureCookie;

    @Value("${app.cookie.same-site:Lax}")
    private String sameSite;

    public void addRefreshCookie(HttpServletResponse response, String refreshToken) {
        addCookie(response, "refresh", refreshToken, REFRESH_COOKIE_MAX_AGE_SECONDS);
    }

    public void clearRefreshCookie(HttpServletResponse response) {
        addCookie(response, "refresh", "", 0);
    }

    public void addOAuth2RequestCookie(HttpServletResponse response, String value, int maxAgeSeconds) {
        addCookie(response, "OAUTH2_REQUEST", value, maxAgeSeconds);
    }

    public void clearOAuth2RequestCookie(HttpServletResponse response) {
        addCookie(response, "OAUTH2_REQUEST", "", 0);
    }

    private void addCookie(HttpServletResponse response, String name, String value, int maxAgeSeconds) {
        String resolvedSameSite = resolveSameSite();
        if ("None".equals(resolvedSameSite) && !secureCookie) {
            throw new IllegalStateException("SameSite=None requires app.secure-cookie=true");
        }

        ResponseCookie cookie = ResponseCookie.from(name, value == null ? "" : value)
                .path("/")
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite(resolvedSameSite)
                .maxAge(maxAgeSeconds)
                .build();

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private String resolveSameSite() {
        String normalized = sameSite == null ? "" : sameSite.trim();
        if (normalized.isBlank()) {
            return "Lax";
        }

        return switch (normalized.toLowerCase(Locale.ROOT)) {
            case "lax" -> "Lax";
            case "strict" -> "Strict";
            case "none" -> "None";
            default -> throw new IllegalStateException("Unsupported cookie SameSite policy: " + sameSite);
        };
    }
}
