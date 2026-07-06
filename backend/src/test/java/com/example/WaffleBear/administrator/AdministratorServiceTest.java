package com.example.WaffleBear.administrator;

import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.share.ShareAuditService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.RefreshToken;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.RefreshTokenRepository;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdministratorServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @Mock
    private StoragePlanService storagePlanService;

    @Mock
    private ShareAuditService shareAuditService;

    @InjectMocks
    private AdministratorService administratorService;

    @Test
    void getSessionsReturnsRefreshTokenSessionsWithoutTokenValue() {
        AuthUserDetails admin = admin();
        LocalDateTime createdAt = LocalDateTime.now().minusHours(1);
        LocalDateTime updatedAt = LocalDateTime.now().minusMinutes(5);
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(3);
        RefreshToken token = RefreshToken.builder()
                .id(10L)
                .email("user@example.com")
                .token("raw-refresh-token")
                .createdAt(createdAt)
                .updatedAt(updatedAt)
                .expiryDate(expiresAt)
                .build();
        User user = User.builder()
                .idx(2L)
                .email("user@example.com")
                .name("User")
                .role("ROLE_USER")
                .enable(true)
                .accountStatus(UserAccountStatus.ACTIVE)
                .build();

        when(refreshTokenRepository.findAllByOrderByIdDesc()).thenReturn(List.of(token));
        when(userRepository.findAllByEmailIn(List.of("user@example.com"))).thenReturn(List.of(user));

        var result = administratorService.getSessions(admin);

        verify(refreshTokenRepository).deleteByExpiryDateBefore(any(LocalDateTime.class));
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getSessionId()).isEqualTo(10L);
        assertThat(result.get(0).getEmail()).isEqualTo("user@example.com");
        assertThat(result.get(0).getUserIdx()).isEqualTo(2L);
        assertThat(result.get(0).getName()).isEqualTo("User");
        assertThat(result.get(0).getAccountStatus()).isEqualTo("ACTIVE");
        assertThat(result.get(0).getExpiresAt()).isEqualTo(expiresAt);
        assertThat(result.get(0).isExpired()).isFalse();
    }

    @Test
    void forceLogoutSessionDeletesSingleRefreshTokenRow() {
        AuthUserDetails admin = admin();
        RefreshToken token = RefreshToken.builder()
                .id(10L)
                .email("user@example.com")
                .token("raw-refresh-token")
                .expiryDate(LocalDateTime.now().plusDays(1))
                .build();
        when(refreshTokenRepository.findById(10L)).thenReturn(Optional.of(token));

        var result = administratorService.forceLogoutSession(admin, 10L);

        assertThat(result.getAffectedCount()).isEqualTo(1);
        verify(refreshTokenRepository).delete(token);
    }

    @Test
    void forceLogoutUserSessionsDeletesAllRefreshTokensForUser() {
        AuthUserDetails admin = admin();
        User user = User.builder()
                .idx(2L)
                .email("user@example.com")
                .name("User")
                .role("ROLE_USER")
                .enable(true)
                .accountStatus(UserAccountStatus.ACTIVE)
                .build();
        List<RefreshToken> sessions = List.of(
                RefreshToken.builder().id(10L).email(user.getEmail()).token("a").expiryDate(LocalDateTime.now().plusDays(1)).build(),
                RefreshToken.builder().id(11L).email(user.getEmail()).token("b").expiryDate(LocalDateTime.now().plusDays(1)).build()
        );
        when(userRepository.findById(user.getIdx())).thenReturn(Optional.of(user));
        when(refreshTokenRepository.findAllByEmailOrderByIdDesc(user.getEmail())).thenReturn(sessions);

        var result = administratorService.forceLogoutUserSessions(admin, user.getIdx());

        assertThat(result.getAffectedCount()).isEqualTo(2);
        verify(refreshTokenRepository).deleteAll(sessions);
    }

    private static AuthUserDetails admin() {
        return AuthUserDetails.builder()
                .idx(1L)
                .id("admin@example.com")
                .email("admin@example.com")
                .name("Admin")
                .role("ROLE_ADMIN")
                .enable(true)
                .accountStatus(UserAccountStatus.ACTIVE)
                .build();
    }
}
