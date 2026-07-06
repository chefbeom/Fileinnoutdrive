package com.example.WaffleBear.config;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.util.StreamUtils.copyToString;

class SecurityConfigCorsTest {

    @Test
    void rejectsDevelopmentWildcardPatternsUnlessExplicitlyEnabled() {
        SecurityConfig securityConfig = securityConfig(
                "http://localhost:*,http://192.168.*:*,http://10.*:*",
                false
        );

        assertThatThrownBy(securityConfig::corsConfigurationSource)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CORS wildcard origin patterns require app.cors.allow-development-origin-patterns=true")
                .hasMessageContaining("http://192.168.*:*");
    }

    @Test
    void rejectsNestedPrivateWildcardPatternsInProductionMode() {
        SecurityConfig securityConfig = securityConfig(
                "https://app.fileinnout.local,http://192.168.35.*:*",
                false
        );

        assertThatThrownBy(securityConfig::corsConfigurationSource)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CORS wildcard origin patterns require app.cors.allow-development-origin-patterns=true")
                .hasMessageContaining("http://192.168.35.*:*");
    }

    @Test
    void rejectsGlobalWildcardPatternsWithCredentialsInProductionMode() {
        SecurityConfig securityConfig = securityConfig(
                "*",
                false
        );

        assertThatThrownBy(securityConfig::corsConfigurationSource)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CORS wildcard origin patterns require app.cors.allow-development-origin-patterns=true")
                .hasMessageContaining("*");
    }

    @Test
    void allowsExplicitOriginAllowlistWithoutDevelopmentWildcardFlag() {
        SecurityConfig securityConfig = securityConfig(
                "https://app.fileinnout.local,http://192.168.35.151",
                false
        );

        CorsConfiguration corsConfiguration = resolveCorsConfiguration(securityConfig);

        assertThat(corsConfiguration.getAllowCredentials()).isTrue();
        assertThat(corsConfiguration.getAllowedOriginPatterns())
                .containsExactly("https://app.fileinnout.local", "http://192.168.35.151");
    }

    @Test
    void localProfileCanEnableDevelopmentWildcardPatterns() {
        SecurityConfig securityConfig = securityConfig(
                "http://localhost:*,http://192.168.*:*",
                true
        );

        CorsConfiguration corsConfiguration = resolveCorsConfiguration(securityConfig);

        assertThat(corsConfiguration.getAllowedOriginPatterns())
                .containsExactly("http://localhost:*", "http://192.168.*:*");
    }

    @Test
    void doesNotFallbackToFrontendUrlWhenPatternListIsEmpty() {
        SecurityConfig securityConfig = securityConfig("", false);

        CorsConfiguration corsConfiguration = resolveCorsConfiguration(securityConfig);

        assertThat(corsConfiguration.getAllowedOriginPatterns()).isEmpty();
    }

    @Test
    void productionProfileKeepsDevelopmentCorsAndOptionalPublicDocsDisabledByDefault() throws Exception {
        String prodConfig = copyToString(
                new ClassPathResource("application-prod.yml").getInputStream(),
                StandardCharsets.UTF_8
        );

        assertThat(prodConfig)
                .contains("allowed-origin-patterns: ${APP_CORS_ALLOWED_ORIGIN_PATTERNS:}")
                .contains("allow-development-origin-patterns: ${APP_CORS_ALLOW_DEVELOPMENT_ORIGIN_PATTERNS:false}")

                .contains("same-site: ${APP_COOKIE_SAME_SITE:Lax}")
                .contains("public-openapi: ${APP_DOCS_PUBLIC_OPENAPI:false}")
                .doesNotContain("APP_HEALTH_PUBLIC_TEST_VERSION")
                .doesNotContain("public-test-version")
                .doesNotContain("APP_CORS_ALLOW_DEVELOPMENT_ORIGIN_PATTERNS:true")
                .doesNotContain("APP_DOCS_PUBLIC_OPENAPI:true");
    }

    private SecurityConfig securityConfig(String allowedOriginPatterns, boolean allowDevelopmentPatterns) {
        SecurityConfig securityConfig = new SecurityConfig(null, null, null, null, null, null);
        ReflectionTestUtils.setField(securityConfig, "allowedOriginPatterns", allowedOriginPatterns);
        ReflectionTestUtils.setField(securityConfig, "allowDevelopmentOriginPatterns", allowDevelopmentPatterns);
        return securityConfig;
    }

    private CorsConfiguration resolveCorsConfiguration(SecurityConfig securityConfig) {
        CorsConfigurationSource source = securityConfig.corsConfigurationSource();
        CorsConfiguration configuration = source.getCorsConfiguration(new MockHttpServletRequest("GET", "/api/file/list"));
        assertThat(configuration).isNotNull();
        List<String> patterns = configuration.getAllowedOriginPatterns();
        assertThat(patterns).isNotNull();
        return configuration;
    }
}
