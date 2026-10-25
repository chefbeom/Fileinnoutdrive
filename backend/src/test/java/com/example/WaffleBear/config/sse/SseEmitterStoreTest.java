package com.example.WaffleBear.config.sse;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SseEmitterStoreTest {

    @Test
    void removingOneTabEmitterKeepsOtherTabEmitterActive() {
        SseEmitterStore store = new SseEmitterStore();
        SseEmitter tab1 = new SseEmitter(60_000L);
        SseEmitter tab2 = new SseEmitter(60_000L);

        store.put(7L, tab1);
        store.put(7L, tab2);

        assertEquals(2, store.getAll(7L).size());

        store.remove(7L, tab1);

        assertEquals(1, store.getAll(7L).size());
        assertTrue(store.getAll(7L).contains(tab2));
        assertFalse(store.getAll(7L).contains(tab1));
        assertNotNull(store.get(7L));

        store.remove(7L, tab2);

        assertTrue(store.getAll(7L).isEmpty());
        assertNull(store.get(7L));
    }
}
