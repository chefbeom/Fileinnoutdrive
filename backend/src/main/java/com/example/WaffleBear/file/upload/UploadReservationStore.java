package com.example.WaffleBear.file.upload;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

@Service
public class UploadReservationStore {

    private static final String PREFIX = "fileinnout:upload:reservation";
    private static final String USER_INDEX_KEY = PREFIX + ":users";
    private static final Duration LOCK_TTL = Duration.ofSeconds(10);
    private static final Duration LOCK_WAIT_TIMEOUT = Duration.ofSeconds(2);
    private static final Duration RESERVATION_KEY_RETENTION = Duration.ofDays(1);
    private static final DefaultRedisScript<Long> RELEASE_LOCK_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            Long.class
    );

    private final StringRedisTemplate redisTemplate;

    public UploadReservationStore(@Qualifier("stringRedisTemplate") StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public boolean reserve(Long userIdx, long quotaBytes, long usedBytes, List<ReservationCandidate> candidates, long expiresAtMillis) {
        if (userIdx == null || candidates == null || candidates.isEmpty()) {
            return true;
        }

        Map<String, Long> normalizedCandidates = normalizeCandidates(candidates);
        if (normalizedCandidates.isEmpty()) {
            return true;
        }

        return withUserLock(userIdx, () -> {
            cleanupExpiredNoLock(userIdx);
            long currentReservedBytes = reservedBytesNoLock(userIdx, null);
            long nextReservedBytes = currentReservedBytes;
            Map<Object, Object> currentReservations = redisTemplate.opsForHash().entries(bytesKey(userIdx));

            for (Map.Entry<String, Long> candidate : normalizedCandidates.entrySet()) {
                long existingBytes = parseLong(currentReservations.get(candidate.getKey()));
                nextReservedBytes = nextReservedBytes - existingBytes + candidate.getValue();
            }

            if (quotaBytes > 0) {
                long remainingQuotaBytes = Math.max(0L, quotaBytes - Math.max(0L, usedBytes));
                if (nextReservedBytes > remainingQuotaBytes) {
                    return false;
                }
            }

            Duration keyTtl = reservationKeyTtl(expiresAtMillis);
            String userKey = String.valueOf(userIdx);
            redisTemplate.opsForSet().add(USER_INDEX_KEY, userKey);

            for (Map.Entry<String, Long> candidate : normalizedCandidates.entrySet()) {
                redisTemplate.opsForHash().put(bytesKey(userIdx), candidate.getKey(), String.valueOf(candidate.getValue()));
                redisTemplate.opsForZSet().add(expiresKey(userIdx), candidate.getKey(), expiresAtMillis);
            }

            redisTemplate.expire(bytesKey(userIdx), keyTtl);
            redisTemplate.expire(expiresKey(userIdx), keyTtl);
            return true;
        });
    }

    public void release(String finalObjectKey) {
        Long userIdx = resolveUserIdx(finalObjectKey);
        if (userIdx == null) {
            return;
        }

        String normalizedKey = finalObjectKey.trim();
        withUserLock(userIdx, () -> {
            redisTemplate.opsForHash().delete(bytesKey(userIdx), normalizedKey);
            redisTemplate.opsForZSet().remove(expiresKey(userIdx), normalizedKey);
            removeUserIndexIfEmptyNoLock(userIdx);
            return null;
        });
    }

    public long reservedBytes(Long userIdx, String ignoredReservationKey) {
        if (userIdx == null) {
            return 0L;
        }

        return withUserLock(userIdx, () -> {
            cleanupExpiredNoLock(userIdx);
            return reservedBytesNoLock(userIdx, ignoredReservationKey);
        });
    }

    public void cleanupExpiredReservations() {
        Set<String> userIds = redisTemplate.opsForSet().members(USER_INDEX_KEY);
        if (userIds == null || userIds.isEmpty()) {
            return;
        }

        for (String userId : userIds) {
            Long userIdx = parseNullableLong(userId);
            if (userIdx == null) {
                redisTemplate.opsForSet().remove(USER_INDEX_KEY, userId);
                continue;
            }

            withUserLock(userIdx, () -> {
                cleanupExpiredNoLock(userIdx);
                return null;
            });
        }
    }

    public long totalReservedBytes() {
        Set<String> userIds = redisTemplate.opsForSet().members(USER_INDEX_KEY);
        if (userIds == null || userIds.isEmpty()) {
            return 0L;
        }

        long totalReservedBytes = 0L;
        for (String userId : userIds) {
            Long userIdx = parseNullableLong(userId);
            if (userIdx != null) {
                totalReservedBytes += reservedBytes(userIdx, null);
            }
        }
        return totalReservedBytes;
    }

    private Map<String, Long> normalizeCandidates(List<ReservationCandidate> candidates) {
        Map<String, Long> normalized = new LinkedHashMap<>();
        for (ReservationCandidate candidate : candidates) {
            if (candidate == null || !StringUtils.hasText(candidate.finalObjectKey()) || candidate.reservedBytes() <= 0L) {
                continue;
            }
            normalized.put(candidate.finalObjectKey().trim(), candidate.reservedBytes());
        }
        return normalized;
    }

    private void cleanupExpiredNoLock(Long userIdx) {
        long now = System.currentTimeMillis();
        Set<String> expiredKeys = redisTemplate.opsForZSet().rangeByScore(expiresKey(userIdx), 0, now);
        if (expiredKeys != null && !expiredKeys.isEmpty()) {
            redisTemplate.opsForHash().delete(bytesKey(userIdx), expiredKeys.toArray());
            redisTemplate.opsForZSet().remove(expiresKey(userIdx), expiredKeys.toArray());
        }
        removeUserIndexIfEmptyNoLock(userIdx);
    }

    private void removeUserIndexIfEmptyNoLock(Long userIdx) {
        Long count = redisTemplate.opsForHash().size(bytesKey(userIdx));
        if (count == null || count <= 0L) {
            redisTemplate.delete(bytesKey(userIdx));
            redisTemplate.delete(expiresKey(userIdx));
            redisTemplate.opsForSet().remove(USER_INDEX_KEY, String.valueOf(userIdx));
        }
    }

    private long reservedBytesNoLock(Long userIdx, String ignoredReservationKey) {
        Map<Object, Object> entries = redisTemplate.opsForHash().entries(bytesKey(userIdx));
        if (entries == null || entries.isEmpty()) {
            return 0L;
        }

        long total = 0L;
        for (Map.Entry<Object, Object> entry : entries.entrySet()) {
            String reservationKey = String.valueOf(entry.getKey());
            if (Objects.equals(reservationKey, ignoredReservationKey)) {
                continue;
            }
            total += parseLong(entry.getValue());
        }
        return total;
    }

    private <T> T withUserLock(Long userIdx, Supplier<T> supplier) {
        String lockKey = lockKey(userIdx);
        String lockValue = UUID.randomUUID().toString();
        long deadline = System.nanoTime() + LOCK_WAIT_TIMEOUT.toNanos();
        boolean acquired = false;

        while (System.nanoTime() < deadline) {
            Boolean locked = redisTemplate.opsForValue().setIfAbsent(lockKey, lockValue, LOCK_TTL);
            if (Boolean.TRUE.equals(locked)) {
                acquired = true;
                break;
            }
            sleepBeforeRetry();
        }

        if (!acquired) {
            throw new IllegalStateException("Timed out while acquiring upload reservation lock for user " + userIdx);
        }

        try {
            return supplier.get();
        } finally {
            redisTemplate.execute(RELEASE_LOCK_SCRIPT, List.of(lockKey), lockValue);
        }
    }

    private void sleepBeforeRetry() {
        try {
            Thread.sleep(25L);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting for upload reservation lock", exception);
        }
    }

    private Duration reservationKeyTtl(long expiresAtMillis) {
        long remainingMillis = Math.max(1000L, expiresAtMillis - System.currentTimeMillis());
        return Duration.ofMillis(remainingMillis).plus(RESERVATION_KEY_RETENTION);
    }

    private Long resolveUserIdx(String finalObjectKey) {
        if (!StringUtils.hasText(finalObjectKey)) {
            return null;
        }

        String normalized = finalObjectKey.trim();
        int separatorIndex = normalized.indexOf('/');
        if (separatorIndex <= 0) {
            return null;
        }
        return parseNullableLong(normalized.substring(0, separatorIndex));
    }

    private Long parseNullableLong(String value) {
        try {
            return value == null ? null : Long.parseLong(value.trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private long parseLong(Object value) {
        if (value == null) {
            return 0L;
        }
        try {
            return Math.max(0L, Long.parseLong(String.valueOf(value)));
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    private String lockKey(Long userIdx) {
        return PREFIX + ":user:" + userIdx + ":lock";
    }

    private String bytesKey(Long userIdx) {
        return PREFIX + ":user:" + userIdx + ":bytes";
    }

    private String expiresKey(Long userIdx) {
        return PREFIX + ":user:" + userIdx + ":expires";
    }

    public record ReservationCandidate(String finalObjectKey, long reservedBytes) {
    }
}
