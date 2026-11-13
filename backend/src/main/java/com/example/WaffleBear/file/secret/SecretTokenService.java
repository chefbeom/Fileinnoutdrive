package com.example.WaffleBear.file.secret;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SecretTokenService {

    private static final String TOKEN_CATEGORY = "secret-unlock";
    private static final String SCOPE_VAULT = "VAULT";
    private static final String SCOPE_FOLDER = "FOLDER";
    private static final long UNLOCK_TTL_MS = 2L * 60L * 60L * 1000L;
    private static final Duration EPOCH_TTL = Duration.ofHours(4);
    private static final String REDIS_VAULT_EPOCH_PREFIX = "secret:epoch:vault:";
    private static final String REDIS_FOLDER_EPOCH_PREFIX = "secret:epoch:folder:";

    private final SecretKey secretKey;
    private final ObjectProvider<StringRedisTemplate> redisTemplateProvider;
    private final Map<String, Long> localEpochs = new ConcurrentHashMap<>();

    public SecretTokenService(String key) {
        this(key, null);
    }

    @Autowired
    public SecretTokenService(
            @Value("${jwt.key}") String key,
            ObjectProvider<StringRedisTemplate> redisTemplateProvider
    ) {
        this.secretKey = deriveSecretKey(key);
        this.redisTemplateProvider = redisTemplateProvider;
    }

    public String createVaultUnlockToken(Long userIdx) {
        if (userIdx == null || userIdx <= 0) {
            return null;
        }
        long epoch = currentEpoch(vaultEpochKey(userIdx));
        return createToken(userIdx, SCOPE_VAULT, null, epoch);
    }

    public String createFolderUnlockToken(Long userIdx, Long folderIdx) {
        if (userIdx == null || userIdx <= 0 || folderIdx == null || folderIdx <= 0) {
            return null;
        }
        long epoch = currentEpoch(folderEpochKey(userIdx, folderIdx));
        return createToken(userIdx, SCOPE_FOLDER, folderIdx, epoch);
    }

    public void revokeVaultTokens(Long userIdx) {
        if (userIdx == null || userIdx <= 0) {
            return;
        }
        incrementEpoch(vaultEpochKey(userIdx));
    }

    public void revokeFolderTokens(Long userIdx, Long folderIdx) {
        if (userIdx == null || userIdx <= 0 || folderIdx == null || folderIdx <= 0) {
            return;
        }
        incrementEpoch(folderEpochKey(userIdx, folderIdx));
    }

    public boolean isValidVaultToken(Long userIdx, String token) {
        Claims claims = parseValidClaims(token);
        if (claims == null || userIdx == null) {
            return false;
        }
        Number tokenUserIdx = claims.get("userIdx", Number.class);
        String scope = claims.get("scope", String.class);
        Number epochClaim = claims.get("epoch", Number.class);
        long expectedEpoch = currentEpoch(vaultEpochKey(userIdx));
        return tokenUserIdx != null
                && Objects.equals(tokenUserIdx.longValue(), userIdx)
                && SCOPE_VAULT.equals(scope)
                && epochClaim != null
                && epochClaim.longValue() == expectedEpoch;
    }

    public boolean isValidFolderToken(Long userIdx, Long folderIdx, String token) {
        if (userIdx == null || folderIdx == null || folderIdx <= 0) {
            return false;
        }
        return extractUnlockedFolderIds(userIdx, List.of(token)).contains(folderIdx);
    }

    public Set<Long> extractUnlockedFolderIds(Long userIdx, List<String> tokens) {
        Set<Long> unlocked = new LinkedHashSet<>();
        if (userIdx == null || tokens == null || tokens.isEmpty()) {
            return unlocked;
        }
        for (String token : tokens) {
            Claims claims = parseValidClaims(token);
            if (claims == null) {
                continue;
            }
            Number tokenUserIdx = claims.get("userIdx", Number.class);
            String scope = claims.get("scope", String.class);
            Number folderIdx = claims.get("folderIdx", Number.class);
            Number epochClaim = claims.get("epoch", Number.class);
            if (tokenUserIdx != null
                    && Objects.equals(tokenUserIdx.longValue(), userIdx)
                    && SCOPE_FOLDER.equals(scope)
                    && folderIdx != null
                    && folderIdx.longValue() > 0
                    && epochClaim != null
                    && epochClaim.longValue() == currentEpoch(folderEpochKey(userIdx, folderIdx.longValue()))) {
                unlocked.add(folderIdx.longValue());
            }
        }
        return unlocked;
    }

    private String createToken(Long userIdx, String scope, Long folderIdx, long epoch) {
        long now = System.currentTimeMillis();
        var builder = Jwts.builder()
                .claim("category", TOKEN_CATEGORY)
                .claim("userIdx", userIdx)
                .claim("scope", scope)
                .claim("epoch", epoch)
                .id(UUID.randomUUID().toString())
                .issuedAt(new Date(now))
                .expiration(new Date(now + UNLOCK_TTL_MS))
                .signWith(secretKey);

        if (folderIdx != null) {
            builder.claim("folderIdx", folderIdx);
        }
        return builder.compact();
    }

    private static SecretKey deriveSecretKey(String baseKey) {
        byte[] rawKey = Decoders.BASE64URL.decode(baseKey);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update("wafflebear:secret-unlock:v1:".getBytes(StandardCharsets.UTF_8));
            byte[] derived = digest.digest(rawKey);
            return Keys.hmacShaKeyFor(derived);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private String vaultEpochKey(Long userIdx) {
        return REDIS_VAULT_EPOCH_PREFIX + userIdx;
    }

    private String folderEpochKey(Long userIdx, Long folderIdx) {
        return REDIS_FOLDER_EPOCH_PREFIX + userIdx + ":" + folderIdx;
    }

    private long currentEpoch(String key) {
        StringRedisTemplate redis = redisTemplateProvider == null ? null : redisTemplateProvider.getIfAvailable();
        if (redis != null) {
            try {
                String value = redis.opsForValue().get(key);
                if (value != null && !value.isBlank()) {
                    return Long.parseLong(value.trim());
                }
                return 0L;
            } catch (Exception ignored) {
                // Fallback to local memory
            }
        }
        return localEpochs.getOrDefault(key, 0L);
    }

    private void incrementEpoch(String key) {
        StringRedisTemplate redis = redisTemplateProvider == null ? null : redisTemplateProvider.getIfAvailable();
        if (redis != null) {
            try {
                redis.opsForValue().increment(key);
                redis.expire(key, EPOCH_TTL);
                return;
            } catch (Exception ignored) {
                // Fallback to local memory
            }
        }
        localEpochs.merge(key, 1L, Long::sum);
    }

    private Claims parseValidClaims(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(secretKey)
                    .build()
                    .parseSignedClaims(token.trim())
                    .getPayload();
            if (!TOKEN_CATEGORY.equals(claims.get("category", String.class))) {
                return null;
            }
            Date exp = claims.getExpiration();
            if (exp == null || exp.before(new Date())) {
                return null;
            }
            return claims;
        } catch (Exception ignored) {
            return null;
        }
    }
}
