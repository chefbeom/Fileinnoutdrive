package com.example.WaffleBear.chat;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

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
        writeRedisTemplate.opsForValue().set(key(roomId, userId), "1", TTL);
    }

    public void refresh(Long roomId, Long userId) {
        writeRedisTemplate.opsForValue().set(key(roomId, userId), "1", TTL);
    }

    public void leave(Long roomId, Long userId) {
        writeRedisTemplate.delete(key(roomId, userId));
    }

    public boolean isActiveInRoom(Long roomId, Long userId) {
        Boolean exists = readRedisTemplate.hasKey(key(roomId, userId));
        return Boolean.TRUE.equals(exists);
    }
}
