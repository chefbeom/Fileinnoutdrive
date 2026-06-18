package com.example.WaffleBear.user.model;

import lombok.Builder;

import java.util.Locale;
import java.util.Map;

public class UserDto {
    public record SignupReq(String email, String name, String password) {
        public User toEntity() {
            return User.builder()
                    .email(email)
                    .name(name)
                    .password(password)
                    .enable(false)
                    .role("ROLE_USER")
                    .accountStatus(UserAccountStatus.ACTIVE)
                    .build();
        }
    }

    @Builder
    public record SignupRes(Long idx, String email, String name) {
        public static SignupRes from(User entity) {
            return SignupRes.builder()
                    .idx(entity.getIdx())
                    .email(entity.getEmail())
                    .name(entity.getName())
                    .build();
        }
    }

    @Builder
    public record OAuth(String email, String name, String provider, boolean enable, String role) {
        public static OAuth from(Map<String, Object> attributes, String provider) {
            if ("google".equals(provider)) {
                return fromGoogle(attributes, provider);
            } else if ("kakao".equals(provider)) {
                return fromKakao(attributes, provider);
            } else if ("naver".equals(provider)) {
                return fromNaver(attributes, provider);
            }

            throw new IllegalArgumentException("Unsupported OAuth2 provider: " + provider);
        }

        private static OAuth fromGoogle(Map<String, Object> attributes, String provider) {
            String providerId = firstPresent(asString(attributes.get("sub")), asString(attributes.get("id")));
            String email = firstPresent(asString(attributes.get("email")), fallbackEmail(provider, providerId));
            String name = firstPresent(asString(attributes.get("name")), email, "Google User");
            return of(email, name, provider);
        }

        private static OAuth fromKakao(Map<String, Object> attributes, String provider) {
            Map<String, Object> properties = asMap(attributes.get("properties"));
            Map<String, Object> account = asMap(attributes.get("kakao_account"));
            Map<String, Object> profile = asMap(account.get("profile"));

            String providerId = asString(attributes.get("id"));
            String email = firstPresent(asString(account.get("email")), fallbackEmail(provider, providerId));
            String name = firstPresent(
                    asString(properties.get("nickname")),
                    asString(profile.get("nickname")),
                    email,
                    "Kakao User"
            );
            return of(email, name, provider);
        }

        private static OAuth fromNaver(Map<String, Object> attributes, String provider) {
            Map<String, Object> response = asMap(attributes.get("response"));

            String providerId = firstPresent(asString(response.get("id")), asString(attributes.get("id")));
            String email = firstPresent(asString(response.get("email")), fallbackEmail(provider, providerId));
            String name = firstPresent(asString(response.get("name")), asString(response.get("nickname")), email, "Naver User");
            return of(email, name, provider);
        }

        private static OAuth of(String email, String name, String provider) {
            return OAuth.builder()
                    .email(email.trim().toLowerCase(Locale.ROOT))
                    .name(name)
                    .provider(provider)
                    .enable(true)
                    .role("ROLE_USER")
                    .build();
        }

        @SuppressWarnings("unchecked")
        private static Map<String, Object> asMap(Object value) {
            if (value instanceof Map<?, ?>) {
                return (Map<String, Object>) value;
            }
            return Map.of();
        }

        private static String asString(Object value) {
            return value == null ? null : String.valueOf(value);
        }

        private static String firstPresent(String... values) {
            for (String value : values) {
                if (value != null && !value.isBlank()) {
                    return value.trim();
                }
            }
            return "";
        }

        private static String fallbackEmail(String provider, String providerId) {
            String normalizedId = firstPresent(providerId, "unknown").replaceAll("[^A-Za-z0-9._-]", "_");
            return provider + "-" + normalizedId + "@" + provider + ".social";
        }

        public User toEntity() {
            return User.builder()
                    .email(email)
                    .name(name)
                    .password(provider)
                    .enable(enable)
                    .role(role)
                    .accountStatus(UserAccountStatus.ACTIVE)
                    .build();
        }
    }

    public record LoginReq(String email, String name, String password) {
    }
}
