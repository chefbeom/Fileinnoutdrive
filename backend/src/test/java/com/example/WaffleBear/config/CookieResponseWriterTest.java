package com.example.WaffleBear.config;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CookieResponseWriterTest {

    @Test
    void refreshCookieIncludesHttpOnlySecureAndSameSite() {
        CookieResponseWriter writer = cookieResponseWriter(true, "Strict");
        MockHttpServletResponse response = new MockHttpServletResponse();

        writer.addRefreshCookie(response, "refresh-token");

        assertThat(response.getHeader(HttpHeaders.SET_COOKIE))
                .contains("refresh=refresh-token")
                .contains("Max-Age=1209600")
                .contains("Path=/")
                .contains("Secure")
                .contains("HttpOnly")
                .contains("SameSite=Strict");
    }

    @Test
    void clearRefreshCookieKeepsSameSecurityPolicy() {
        CookieResponseWriter writer = cookieResponseWriter(false, "Lax");
        MockHttpServletResponse response = new MockHttpServletResponse();

        writer.clearRefreshCookie(response);

        assertThat(response.getHeader(HttpHeaders.SET_COOKIE))
                .contains("refresh=")
                .contains("Max-Age=0")
                .contains("Path=/")
                .contains("HttpOnly")
                .contains("SameSite=Lax")
                .doesNotContain("Secure");
    }

    @Test
    void rejectsSameSiteNoneWithoutSecureCookie() {
        CookieResponseWriter writer = cookieResponseWriter(false, "None");

        assertThatThrownBy(() -> writer.addRefreshCookie(new MockHttpServletResponse(), "refresh-token"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SameSite=None requires app.secure-cookie=true");
    }

    @Test
    void rejectsUnsupportedSameSitePolicy() {
        CookieResponseWriter writer = cookieResponseWriter(false, "wide-open");

        assertThatThrownBy(() -> writer.addRefreshCookie(new MockHttpServletResponse(), "refresh-token"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Unsupported cookie SameSite policy");
    }

    private CookieResponseWriter cookieResponseWriter(boolean secureCookie, String sameSite) {
        CookieResponseWriter writer = new CookieResponseWriter();
        ReflectionTestUtils.setField(writer, "secureCookie", secureCookie);
        ReflectionTestUtils.setField(writer, "sameSite", sameSite);
        return writer;
    }
}
