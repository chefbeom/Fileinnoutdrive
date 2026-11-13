package com.example.WaffleBear.chat;

import com.example.WaffleBear.chat.model.dto.ChatRoomsDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Collection;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ChatListCacheService {

    private static final Duration TTL = Duration.ofSeconds(10);

    private final RedisTemplate<String, Object> writeRedisTemplate;
    private final RedisTemplate<String, Object> readRedisTemplate;

    public ChatListCacheService(
            @Qualifier("redisTemplate") RedisTemplate<String, Object> writeRedisTemplate,
            @Qualifier("readRedisTemplate") RedisTemplate<String, Object> readRedisTemplate
    ) {
        this.writeRedisTemplate = writeRedisTemplate;
        this.readRedisTemplate = readRedisTemplate;
    }

    private String cacheKey(Long userIdx, int page, int size) {
        return "chat:list:user:" + userIdx + ":page:" + page + ":size:" + size;
    }

    private String indexKey(Long userIdx) {
        return "chat:list:user:" + userIdx + ":keys";
    }

    public ChatRoomsDto.PageRes get(Long userIdx, int page, int size) {
        try {
            Object value = readRedisTemplate.opsForValue().get(cacheKey(userIdx, page, size));
            if (value instanceof ChatRoomsDto.PageRes pageRes) {
                return pageRes;
            }
        } catch (Exception e) {
            log.warn("Failed to read chat room list cache for userIdx={}: {}", userIdx, e.getMessage());
        }
        return null;
    }

    public void put(Long userIdx, int page, int size, ChatRoomsDto.PageRes value) {
        try {
            String key = cacheKey(userIdx, page, size);
            writeRedisTemplate.opsForValue().set(key, value, TTL);
            writeRedisTemplate.opsForSet().add(indexKey(userIdx), key);
            writeRedisTemplate.expire(indexKey(userIdx), TTL.multipliedBy(2));
        } catch (Exception e) {
            log.warn("Failed to write chat room list cache for userIdx={}: {}", userIdx, e.getMessage());
        }
    }

    public void evictUser(Long userIdx) {
        try {
            String indexKey = indexKey(userIdx);
            Set<Object> rawKeys = writeRedisTemplate.opsForSet().members(indexKey);

            if (rawKeys != null && !rawKeys.isEmpty()) {
                Set<String> keys = rawKeys.stream()
                        .map(String::valueOf)
                        .collect(Collectors.toSet());
                writeRedisTemplate.delete(keys);
            }

            writeRedisTemplate.delete(indexKey);
        } catch (Exception e) {
            log.warn("Failed to evict chat room list cache for userIdx={}: {}", userIdx, e.getMessage());
        }
    }

    public void evictUsers(Collection<Long> userIds) {
        if (userIds == null) return;
        userIds.stream().filter(Objects::nonNull).distinct().forEach(this::evictUser);
    }
}
