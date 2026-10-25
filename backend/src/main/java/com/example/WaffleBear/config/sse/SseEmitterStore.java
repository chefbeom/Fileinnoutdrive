package com.example.WaffleBear.config.sse;

import lombok.Getter;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class SseEmitterStore {
    // 사용자별 active SSE emitter 목록을 저장합니다 (멀티 탭/멀티 디바이스 지원).
    @Getter
    private final ConcurrentMap<Long, SseEmitter> emitters = new ConcurrentHashMap<>();
    private final ConcurrentMap<Long, CopyOnWriteArraySet<SseEmitter>> emitterSets = new ConcurrentHashMap<>();

    public void put(Long userId, SseEmitter emitter) {
        if (userId == null || emitter == null) return;
        emitterSets.computeIfAbsent(userId, key -> new CopyOnWriteArraySet<>()).add(emitter);
        emitters.put(userId, emitter);
    }

    public SseEmitter get(Long userId) {
        if (userId == null) return null;
        return emitters.get(userId);
    }

    public Set<SseEmitter> getAll(Long userId) {
        if (userId == null) return Collections.emptySet();
        Set<SseEmitter> set = emitterSets.get(userId);
        if (set != null && !set.isEmpty()) {
            return set;
        }
        SseEmitter fallback = emitters.get(userId);
        return fallback != null ? Set.of(fallback) : Collections.emptySet();
    }

    public void remove(Long userId, SseEmitter emitter) {
        if (userId == null || emitter == null) return;
        CopyOnWriteArraySet<SseEmitter> set = emitterSets.get(userId);
        if (set != null) {
            set.remove(emitter);
            if (set.isEmpty()) {
                emitterSets.remove(userId, set);
                emitters.remove(userId, emitter);
            } else {
                emitters.computeIfPresent(userId, (key, current) ->
                        current == emitter ? set.iterator().next() : current
                );
            }
        } else {
            emitters.remove(userId, emitter);
        }
    }

    public void remove(Long userId) {
        if (userId == null) return;
        emitterSets.remove(userId);
        emitters.remove(userId);
    }
}
