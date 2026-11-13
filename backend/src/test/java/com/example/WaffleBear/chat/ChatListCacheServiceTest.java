package com.example.WaffleBear.chat;

import com.example.WaffleBear.chat.model.dto.ChatRoomsDto;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.RedisTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatListCacheServiceTest {

    @Test
    @SuppressWarnings("unchecked")
    void fallsBackGracefullyWhenRedisThrowsConnectionOrPermissionException() {
        RedisTemplate<String, Object> writeTemplate = mock(RedisTemplate.class);
        RedisTemplate<String, Object> readTemplate = mock(RedisTemplate.class);

        when(readTemplate.opsForValue()).thenThrow(new RedisConnectionFailureException("NOPERM info"));
        when(writeTemplate.opsForValue()).thenThrow(new RedisConnectionFailureException("NOPERM info"));
        when(writeTemplate.opsForSet()).thenThrow(new RedisConnectionFailureException("NOPERM info"));

        ChatListCacheService cacheService = new ChatListCacheService(writeTemplate, readTemplate);

        assertNull(cacheService.get(1L, 0, 10));
        assertDoesNotThrow(() -> cacheService.put(1L, 0, 10, ChatRoomsDto.PageRes.builder().build()));
        assertDoesNotThrow(() -> cacheService.evictUser(1L));
    }
}
