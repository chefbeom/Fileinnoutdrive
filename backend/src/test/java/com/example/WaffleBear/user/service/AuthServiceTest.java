package com.example.WaffleBear.user.service;

import com.example.WaffleBear.user.model.RefreshToken;
import com.example.WaffleBear.user.model.TokenDto;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.RefreshTokenRepository;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.utils.JwtUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private JwtUtil jwtUtil;

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private AuthService authService;

    @Test
    void issueTokensStoresOnlyRefreshTokenHash() {
        when(jwtUtil.createToken(anyString(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyLong()))
                .thenReturn("access-token", "refresh-token");

        TokenDto.AuthTokenResponse result =
                authService.issueTokens(7L, "user@example.com", "user@example.com", "User", "ROLE_USER");

        ArgumentCaptor<RefreshToken> savedToken = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).save(savedToken.capture());
        assertThat(savedToken.getValue().getTokenHash())
                .isEqualTo(hash("refresh-token"))
                .isNotEqualTo("refresh-token");
        assertThat(result.refreshToken()).isEqualTo("refresh-token");
    }

    @Test
    void reissueUsesStoredHashAndRotatesToNewHash() {
        String refreshToken = "old-refresh-token";
        RefreshToken storedToken = RefreshToken.builder()
                .id(11L)
                .email("user@example.com")
                .tokenHash(hash(refreshToken))
                .expiryDate(LocalDateTime.now().plusDays(1))
                .build();
        User user = User.builder()
                .idx(7L)
                .email("user@example.com")
                .name("User")
                .role("ROLE_USER")
                .enable(true)
                .accountStatus(UserAccountStatus.ACTIVE)
                .build();

        when(jwtUtil.isExpired(refreshToken)).thenReturn(false);
        when(jwtUtil.getCategory(refreshToken)).thenReturn("refresh");
        when(refreshTokenRepository.findFirstByTokenHashOrderByIdDesc(hash(refreshToken)))
                .thenReturn(Optional.of(storedToken));
        when(refreshTokenRepository.findAllByTokenHash(hash(refreshToken))).thenReturn(List.of(storedToken));
        when(jwtUtil.getEmail(refreshToken)).thenReturn(user.getEmail());
        when(jwtUtil.getId(refreshToken)).thenReturn(user.getEmail());
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(jwtUtil.createToken(anyString(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyLong()))
                .thenReturn("new-access-token", "new-refresh-token");

        TokenDto.AuthTokenResponse result = authService.reissue(refreshToken);

        verify(refreshTokenRepository).findFirstByTokenHashOrderByIdDesc(hash(refreshToken));
        assertThat(storedToken.getTokenHash()).isEqualTo(hash("new-refresh-token"));
        assertThat(result.accessToken()).isEqualTo("new-access-token");
        assertThat(result.refreshToken()).isEqualTo("new-refresh-token");
    }

    @Test
    void logoutDeletesRefreshTokenByHash() {
        authService.logout("refresh-token");

        verify(refreshTokenRepository).deleteByTokenHash(hash("refresh-token"));
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))
            );
        } catch (NoSuchAlgorithmException exception) {
            throw new AssertionError(exception);
        }
    }
}