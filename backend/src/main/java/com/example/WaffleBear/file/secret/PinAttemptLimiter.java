package com.example.WaffleBear.file.secret;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class PinAttemptLimiter {

    private static final int MAX_ATTEMPTS = 5;
    private static final Duration LOCK_DURATION = Duration.ofMinutes(5);
    private static final String REDIS_COUNT_PREFIX = "secret:pin-fail:";
    private static final String REDIS_LOCK_PREFIX = "secret:pin-lock:";

    private final ObjectProvider<StringRedisTemplate> redisTemplateProvider;
    private final Map<String, LocalAttemptState> localStates = new ConcurrentHashMap<>();

    private record LocalAttemptState(int failures, long lockedUntilMs) {
    }

    public PinAttemptLimiter() {
        this.redisTemplateProvider = null;
    }

    @Autowired
    public PinAttemptLimiter(ObjectProvider<StringRedisTemplate> redisTemplateProvider) {
        this.redisTemplateProvider = redisTemplateProvider;
    }

    public void assertNotLocked(String scopeKey) {
        if (scopeKey == null || scopeKey.isBlank()) {
            return;
        }
        StringRedisTemplate redis = getRedis();
        if (redis != null) {
            try {
                if (Boolean.TRUE.equals(redis.hasKey(REDIS_LOCK_PREFIX + scopeKey))) {
                    throw BaseException.from(BaseResponseStatus.PIN_ATTEMPTS_EXCEEDED);
                }
                return;
            } catch (BaseException ex) {
                throw ex;
            } catch (Exception ignored) {
                // Fallback to local memory if Redis is unreachable.
            }
        }

        LocalAttemptState state = localStates.get(scopeKey);
        if (state != null && state.lockedUntilMs() > System.currentTimeMillis()) {
            throw BaseException.from(BaseResponseStatus.PIN_ATTEMPTS_EXCEEDED);
        }
    }

    public void recordFailure(String scopeKey) {
        if (scopeKey == null || scopeKey.isBlank()) {
            return;
        }
        StringRedisTemplate redis = getRedis();
        if (redis != null) {
            try {
                String countKey = REDIS_COUNT_PREFIX + scopeKey;
                Long count = redis.opsForValue().increment(countKey);
                if (count != null && count == 1L) {
                    redis.expire(countKey, LOCK_DURATION);
                }
                if (count != null && count >= MAX_ATTEMPTS) {
                    redis.opsForValue().set(REDIS_LOCK_PREFIX + scopeKey, "1", LOCK_DURATION);
                    redis.delete(countKey);
                }
                return;
            } catch (Exception ignored) {
                // Fallback to local memory if Redis is unreachable.
            }
        }

        long now = System.currentTimeMillis();
        localStates.compute(scopeKey, (key, current) -> {
            if (current != null && current.lockedUntilMs() > now) {
                return current;
            }
            int nextFailures = (current == null || current.lockedUntilMs() > 0 && current.lockedUntilMs() <= now)
                    ? 1
                    : current.failures() + 1;
            if (nextFailures >= MAX_ATTEMPTS) {
                return new LocalAttemptState(0, now + LOCK_DURATION.toMillis());
            }
            return new LocalAttemptState(nextFailures, 0L);
        });
    }

    public void clearFailures(String scopeKey) {
        if (scopeKey == null || scopeKey.isBlank()) {
            return;
        }
        StringRedisTemplate redis = getRedis();
        if (redis != null) {
            try {
                redis.delete(REDIS_COUNT_PREFIX + scopeKey);
                redis.delete(REDIS_LOCK_PREFIX + scopeKey);
            } catch (Exception ignored) {
                // Ignore Redis cleanup failure; local state still cleared.
            }
        }
        localStates.remove(scopeKey);
    }

    private StringRedisTemplate getRedis() {
        return redisTemplateProvider == null ? null : redisTemplateProvider.getIfAvailable();
    }
}
