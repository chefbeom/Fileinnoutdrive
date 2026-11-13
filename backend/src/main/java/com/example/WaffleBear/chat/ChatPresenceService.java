package com.example.WaffleBear.chat;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Slf4j
@Service
public class ChatPresenceService {

    private static final Duration TTL = Duration.ofMinutes(5);

    private final StringRedisTemplate writeRedisTemplate;
    private final StringRedisTemplate readRedisTemplate;

    public ChatPresenceService(
            @Qualifier("stringRedisTemplate") StringRedisTemplate writeRedisTemplate,
            @Qualifier("readStringRedisTemplate") StringRedisTemplate readRedisTemplate
    ) {
        this.writeRedisTemplate = writeRedisTemplate;
        this.readRedisTemplate = readRedisTemplate;
    }

    private String key(Long roomId, Long userId) {
        return "chat:presence:room:" + roomId + ":user:" + userId;
    }

    public void enter(Long roomId, Long userId) {
        try {
            writeRedisTemplate.opsForValue().set(key(roomId, userId), "1", TTL);
        } catch (Exception e) {
            log.warn("Failed to record chat room enter presence (roomId={}, userId={}): {}", roomId, userId, e.getMessage());
        }
    }

    public void refresh(Long roomId, Long userId) {
        try {
            writeRedisTemplate.opsForValue().set(key(roomId, userId), "1", TTL);
        } catch (Exception e) {
            log.warn("Failed to refresh chat room presence (roomId={}, userId={}): {}", roomId, userId, e.getMessage());
        }
    }

    public void leave(Long roomId, Long userId) {
        try {
            writeRedisTemplate.delete(key(roomId, userId));
        } catch (Exception e) {
            log.warn("Failed to clear chat room presence (roomId={}, userId={}): {}", roomId, userId, e.getMessage());
        }
    }

    public boolean isActiveInRoom(Long roomId, Long userId) {
        try {
            Boolean exists = readRedisTemplate.hasKey(key(roomId, userId));
            return Boolean.TRUE.equals(exists);
        } catch (Exception e) {
            log.warn("Failed to check chat room presence (roomId={}, userId={}): {}", roomId, userId, e.getMessage());
            return false;
        }
    }
}
