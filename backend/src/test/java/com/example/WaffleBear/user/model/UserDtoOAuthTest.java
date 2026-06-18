package com.example.WaffleBear.user.model;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UserDtoOAuthTest {

    @Test
    void googleProfileUsesEmailAndName() {
        UserDto.OAuth oauth = UserDto.OAuth.from(
                Map.of("sub", "google-id", "email", "User@Example.com", "name", "Google User"),
                "google"
        );

        assertThat(oauth.email()).isEqualTo("user@example.com");
        assertThat(oauth.name()).isEqualTo("Google User");
        assertThat(oauth.provider()).isEqualTo("google");
        assertThat(oauth.enable()).isTrue();
    }

    @Test
    void kakaoProfileUsesAccountEmailWhenPresent() {
        UserDto.OAuth oauth = UserDto.OAuth.from(
                Map.of(
                        "id", 12345L,
                        "kakao_account", Map.of(
                                "email", "Kakao@Example.com",
                                "profile", Map.of("nickname", "Kakao Account")
                        )
                ),
                "kakao"
        );

        assertThat(oauth.email()).isEqualTo("kakao@example.com");
        assertThat(oauth.name()).isEqualTo("Kakao Account");
    }

    @Test
    void kakaoProfileFallsBackToSyntheticEmailAndPropertiesNickname() {
        UserDto.OAuth oauth = UserDto.OAuth.from(
                Map.of(
                        "id", 98765,
                        "properties", Map.of("nickname", "Kakao User")
                ),
                "kakao"
        );

        assertThat(oauth.email()).isEqualTo("kakao-98765@kakao.social");
        assertThat(oauth.name()).isEqualTo("Kakao User");
    }

    @Test
    void naverProfileFallsBackToSyntheticEmail() {
        UserDto.OAuth oauth = UserDto.OAuth.from(
                Map.of("response", Map.of("id", "naver-id", "nickname", "Naver User")),
                "naver"
        );

        assertThat(oauth.email()).isEqualTo("naver-naver-id@naver.social");
        assertThat(oauth.name()).isEqualTo("Naver User");
    }

    @Test
    void unsupportedProviderThrowsException() {
        assertThatThrownBy(() -> UserDto.OAuth.from(Map.of(), "unknown"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unsupported OAuth2 provider");
    }
}
