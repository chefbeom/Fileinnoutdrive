package com.example.WaffleBear.user.service;

import com.example.WaffleBear.user.model.RefreshToken;
import com.example.WaffleBear.user.model.TokenDto;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.RefreshTokenRepository;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.utils.JwtUtil;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final JwtUtil jwtUtil;
    private final RefreshTokenRepository refreshTokenRepository;
    private final UserRepository userRepository;

    @Transactional
    public TokenDto.AuthTokenResponse issueTokens(Long userIdx, String userId, String email, String name, String role) {
        String resolvedUserId = (userId == null || userId.isBlank()) ? email : userId;
        String access = jwtUtil.createToken("access", userIdx, resolvedUserId, email, name, role, 600000L);
        String refresh = jwtUtil.createToken("refresh", userIdx, resolvedUserId, email, name, role, 1209600000L);

        refreshTokenRepository.save(
                RefreshToken.builder()
                        .email(email)
                        .tokenHash(hashRefreshToken(refresh))
                        .expiryDate(LocalDateTime.now().plusDays(14))
                        .build()
        );

        return new TokenDto.AuthTokenResponse(access, refresh);
    }

    @Transactional
    public TokenDto.AuthTokenResponse reissue(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new IllegalArgumentException("Refresh token is missing.");
        }

        validateRefreshToken(refreshToken);

        String category = jwtUtil.getCategory(refreshToken);
        if (!category.equals("refresh")) {
            throw new IllegalArgumentException("Invalid refresh token category.");
        }

        String refreshTokenHash = hashRefreshToken(refreshToken);
        RefreshToken dbToken = refreshTokenRepository.findFirstByTokenHashOrderByIdDesc(refreshTokenHash)
                .orElseThrow(() -> new IllegalArgumentException("Refresh token is not registered."));
        removeDuplicateRefreshTokenRows(refreshTokenHash, dbToken);

        String email = jwtUtil.getEmail(refreshToken);
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        if (!Boolean.TRUE.equals(user.getEnable()) || resolveStatus(user) != UserAccountStatus.ACTIVE) {
            refreshTokenRepository.deleteByEmail(email);
            throw new IllegalArgumentException("User is not allowed to access.");
        }

        String resolvedUserId = jwtUtil.getId(refreshToken);
        if (resolvedUserId == null || resolvedUserId.isBlank()) {
            resolvedUserId = user.getEmail();
        }

        String newAccess = jwtUtil.createToken(
                "access",
                user.getIdx(),
                resolvedUserId,
                user.getEmail(),
                user.getName(),
                user.getRole(),
                600000L
        );
        String newRefresh = jwtUtil.createToken(
                "refresh",
                user.getIdx(),
                resolvedUserId,
                user.getEmail(),
                user.getName(),
                user.getRole(),
                1209600000L
        );

        dbToken.updateTokenHash(hashRefreshToken(newRefresh), LocalDateTime.now().plusDays(14));

        return new TokenDto.AuthTokenResponse(newAccess, newRefresh);
    }

    private UserAccountStatus resolveStatus(User user) {
        return user.getAccountStatus() == null ? UserAccountStatus.ACTIVE : user.getAccountStatus();
    }

    private void removeDuplicateRefreshTokenRows(String refreshTokenHash, RefreshToken retainedToken) {
        List<RefreshToken> duplicates = refreshTokenRepository.findAllByTokenHash(refreshTokenHash);
        if (duplicates.size() <= 1) {
            return;
        }

        RefreshToken newest = duplicates.stream()
                .max(Comparator.comparing(RefreshToken::getId))
                .orElse(retainedToken);
        for (RefreshToken duplicate : duplicates) {
            if (!duplicate.getId().equals(newest.getId())) {
                refreshTokenRepository.delete(duplicate);
            }
        }
    }

    private void validateRefreshToken(String refreshToken) {
        try {
            if (Boolean.TRUE.equals(jwtUtil.isExpired(refreshToken))) {
                throw new IllegalArgumentException("Refresh token is expired.");
            }
        } catch (ExpiredJwtException e) {
            throw new IllegalArgumentException("Refresh token is expired.");
        } catch (JwtException e) {
            throw new IllegalArgumentException("Invalid refresh token.");
        }
    }

    @Transactional
    public void logout(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            return;
        }
        refreshTokenRepository.deleteByTokenHash(hashRefreshToken(refreshToken));
    }

    private String hashRefreshToken(String refreshToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(refreshToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
