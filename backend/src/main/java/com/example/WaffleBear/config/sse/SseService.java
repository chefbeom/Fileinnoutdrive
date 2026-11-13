package com.example.WaffleBear.config.sse;

import com.example.WaffleBear.config.RedisConfig;
import com.example.WaffleBear.config.realtime.RealtimeNodeIdProvider;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class SseService {
    public static final String CHANNEL = "wafflebear:realtime:sse";

    private final SseEmitterStore emitterStore;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final RealtimeNodeIdProvider nodeIdProvider;

    @Value("${REDIS_KEY_PREFIX:}")
    private String redisKeyPrefix;

    public void sendTitleUpdate(Long postId, String newTitle, List<Long> userIds) {
        Map<String, Object> data = new HashMap<>();
        data.put("postId", postId);
        data.put("title", newTitle);

        for (Long userId : userIds) {
            sendEventToUser(userId, "title-updated", data);
        }
    }

    public void sendRoleChanged(Long targetUserIdx, Long postIdx, String newRole) {
        Map<String, Object> payload = Map.of(
                "postIdx", postIdx,
                "newRole", newRole
        );
        sendEventToUser(targetUserIdx, "role-changed", payload);
    }

    public void sendEventToUser(Long userId, String eventName, Object data) {
        if (userId == null || !StringUtils.hasText(eventName)) {
            return;
        }

        String payloadJson = serializePayload(data);
        deliverEventToUser(userId, eventName, payloadJson);
        publish(userId, eventName, payloadJson);
    }

    void deliverEventToUser(Long userId, String eventName, String payloadJson) {
        Set<SseEmitter> userEmitters = emitterStore.getAll(userId);
        if (userEmitters == null || userEmitters.isEmpty()) return;

        for (SseEmitter emitter : userEmitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name(eventName)
                        .data(payloadJson));
            } catch (IOException | IllegalStateException e) {
                emitterStore.remove(userId, emitter);
                completeQuietly(emitter);
            }
        }
    }

    @Scheduled(fixedDelay = 30000)
    public void sendHeartbeat() {
        for (Long userId : emitterStore.getConnectedUserIds()) {
            Set<SseEmitter> userEmitters = emitterStore.getAll(userId);
            for (SseEmitter emitter : userEmitters) {
                try {
                    emitter.send(SseEmitter.event().comment("heartbeat"));
                } catch (IOException | IllegalStateException e) {
                    emitterStore.remove(userId, emitter);
                    completeQuietly(emitter);
                }
            }
        }
    }

    private void completeQuietly(SseEmitter emitter) {
        try {
            emitter.complete();
        } catch (Exception ignored) {
        }
    }

    public boolean isConnected(Long userId) {
        return !emitterStore.getAll(userId).isEmpty();
    }

    private void publish(Long userId, String eventName, String payloadJson) {
        try {
            SseBroadcastMessage message = new SseBroadcastMessage(
                    nodeIdProvider.getNodeId(),
                    userId,
                    eventName,
                    payloadJson
            );
            String channel = RedisConfig.resolvePrefixedName(redisKeyPrefix, CHANNEL);
            redisTemplate.convertAndSend(channel, objectMapper.writeValueAsString(message));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize SSE broadcast message", e);
        } catch (Exception e) {
            log.debug("Redis SSE broadcast skipped: {}", e.getMessage());
        }
    }

    private String serializePayload(Object data) {
        if (data == null) {
            return "null";
        }

        if (data instanceof CharSequence sequence) {
            return sequence.toString();
        }

        try {
            return objectMapper.writeValueAsString(data);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize SSE payload", e);
        }
    }
}
