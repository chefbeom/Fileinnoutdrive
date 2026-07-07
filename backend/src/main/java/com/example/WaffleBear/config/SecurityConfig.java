package com.example.WaffleBear.config;

import com.example.WaffleBear.config.Filter.JwtFilter;
import com.example.WaffleBear.config.Filter.LoginFilter;
import com.example.WaffleBear.config.oauth2.OAuth2AuthenticationSuccessHandler;
import com.example.WaffleBear.config.oauth2.OAuth2AuthorizationRequestRepository;
import com.example.WaffleBear.user.service.OAuth2UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;

@Configuration
@RequiredArgsConstructor
@EnableWebSecurity
public class SecurityConfig {
    @Value("${app.cors.allowed-origin-patterns:}")
    private String allowedOriginPatterns;
    @Value("${app.cors.allow-development-origin-patterns:false}")
    private boolean allowDevelopmentOriginPatterns;
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

    @Value("${app.docs.public-openapi:false}")
    private boolean publicOpenApi;

    private final AuthenticationConfiguration configuration;
    private final LoginFilter loginFilter;
    private final JwtFilter jwtFilter;
    private final OAuth2UserService oAuth2UserService;
    private final OAuth2AuthenticationSuccessHandler oAuth2AuthenticationSuccessHandler;
    private final OAuth2AuthorizationRequestRepository oAuth2AuthorizationRequestRepository;

    @Bean
    public SecurityFilterChain config(HttpSecurity http) throws Exception {
        http.cors(cors -> cors.configurationSource(corsConfigurationSource()));

        http.csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable);
        http.sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
        if (adminOnly || !hasConfiguredOAuthProvider()) {
            http.oauth2Login(AbstractHttpConfigurer::disable);
        } else {
            http.oauth2Login(config -> {
                config.authorizationEndpoint(
                        endpoint -> endpoint.authorizationRequestRepository(oAuth2AuthorizationRequestRepository));
                config.userInfoEndpoint(
                        endpoint -> endpoint.userService(oAuth2UserService)
                );
                config.successHandler(oAuth2AuthenticationSuccessHandler);
            });
        }

        http.authorizeHttpRequests(auth -> {
            auth.requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                    .requestMatchers("/login", "/error").permitAll()
                    .requestMatchers("/auth/reissue", "/auth/logout", "/auth/oauth2/providers").permitAll()
                    .requestMatchers("/oauth2/**", "/login/oauth2/**").permitAll()
                    .requestMatchers("/user/signup", "/user/verify/**").permitAll();
            if (publicOpenApi) {
                auth.requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll();
            }

            auth.requestMatchers("/ws-stomp/**").permitAll()
                    .requestMatchers("/administrator/**").hasAuthority("ROLE_ADMIN")
                    .anyRequest().authenticated();
        });

        http.addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        http.addFilterBefore(loginFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowCredentials(true);
        configuration.setAllowedOriginPatterns(resolveAllowedOriginPatterns());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Set-Cookie", "Authorization"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private boolean hasConfiguredOAuthProvider() {
        return hasConfiguredOAuthProvider(googleClientId, googleClientSecret)
                || hasConfiguredOAuthProvider(kakaoClientId, kakaoClientSecret)
                || hasConfiguredOAuthProvider(naverClientId, naverClientSecret);
    }

    private boolean hasConfiguredOAuthProvider(String clientId, String clientSecret) {
        return isConfiguredCredential(clientId) && isConfiguredCredential(clientSecret);
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

    private List<String> resolveAllowedOriginPatterns() {
        String rawPatterns = Objects.requireNonNullElse(allowedOriginPatterns, "");
        List<String> patterns = Arrays.stream(rawPatterns.split(","))
                .map(String::trim)
                .filter(pattern -> !pattern.isBlank())
                .distinct()
                .toList();

        validateAllowedOriginPatterns(patterns);
        return patterns;
    }

    private void validateAllowedOriginPatterns(List<String> patterns) {
        if (allowDevelopmentOriginPatterns) {
            return;
        }

        List<String> wildcardPatterns = patterns.stream()
                .filter(pattern -> pattern.contains("*"))
                .toList();
        if (!wildcardPatterns.isEmpty()) {
            throw new IllegalStateException(
                    "CORS wildcard origin patterns require app.cors.allow-development-origin-patterns=true: "
                            + String.join(", ", wildcardPatterns)
            );
        }
    }
}
