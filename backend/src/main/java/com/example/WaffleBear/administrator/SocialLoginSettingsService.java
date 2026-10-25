package com.example.WaffleBear.administrator;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicBoolean;

@Service
@Slf4j
public class SocialLoginSettingsService {

    private static final String REDIS_KEY = "wafflebear:settings:social-login-visible";

    private final ObjectProvider<StringRedisTemplate> redisTemplateProvider;
    private final AtomicBoolean fallbackVisible;

    public SocialLoginSettingsService(
            ObjectProvider<StringRedisTemplate> redisTemplateProvider,
            @Value("${app.social-login.visible-default:false}") boolean defaultVisible
    ) {
        this.redisTemplateProvider = redisTemplateProvider;
        this.fallbackVisible = new AtomicBoolean(defaultVisible);
    }

    public boolean isSocialLoginVisible() {
        try {
            StringRedisTemplate redisTemplate = redisTemplateProvider.getIfAvailable();
            if (redisTemplate != null) {
                String rawValue = redisTemplate.opsForValue().get(REDIS_KEY);
                if (rawValue != null && !rawValue.isBlank()) {
                    boolean parsed = Boolean.parseBoolean(rawValue.trim());
                    fallbackVisible.set(parsed);
                    return parsed;
                }
            }
        } catch (Exception e) {
            log.debug("Failed to read social login visibility from Redis, using in-memory state", e);
        }
        return fallbackVisible.get();
    }

    public boolean setSocialLoginVisible(boolean visible) {
        fallbackVisible.set(visible);
        try {
            StringRedisTemplate redisTemplate = redisTemplateProvider.getIfAvailable();
            if (redisTemplate != null) {
                redisTemplate.opsForValue().set(REDIS_KEY, Boolean.toString(visible));
            }
        } catch (Exception e) {
            log.warn("Failed to persist social login visibility to Redis, kept in-memory state", e);
        }
        return fallbackVisible.get();
    }
}
