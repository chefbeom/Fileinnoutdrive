package com.example.WaffleBear.file.upload;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.ZSetOperations;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UploadReservationStoreTest {

    private static final String USER_INDEX_KEY = "fileinnout:upload:reservation:users";
    private static final String BYTES_KEY = "fileinnout:upload:reservation:user:7:bytes";
    private static final String EXPIRES_KEY = "fileinnout:upload:reservation:user:7:expires";

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @Mock
    private HashOperations<String, Object, Object> hashOperations;

    @Mock
    private ZSetOperations<String, String> zSetOperations;

    @Mock
    private SetOperations<String, String> setOperations;

    private UploadReservationStore store;

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        lenient().when(redisTemplate.opsForZSet()).thenReturn(zSetOperations);
        lenient().when(redisTemplate.opsForSet()).thenReturn(setOperations);
        lenient().when(valueOperations.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(true);
        lenient().when(zSetOperations.rangeByScore(anyString(), anyDouble(), anyDouble())).thenReturn(Set.of());
        lenient().when(hashOperations.size(anyString())).thenReturn(1L);
        lenient().when(hashOperations.entries(anyString())).thenReturn(Map.of());
        store = new UploadReservationStore(redisTemplate);
    }

    @Test
    void reserveWritesUserScopedReservationWhenQuotaAllowsIt() {
        long expiresAtMillis = System.currentTimeMillis() + Duration.ofMinutes(30).toMillis();

        boolean reserved = store.reserve(
                7L,
                1_000L,
                100L,
                List.of(new UploadReservationStore.ReservationCandidate("7/file.bin", 300L)),
                expiresAtMillis
        );

        assertTrue(reserved);
        verify(setOperations).add(USER_INDEX_KEY, "7");
        verify(hashOperations).put(BYTES_KEY, "7/file.bin", "300");
        verify(zSetOperations).add(EXPIRES_KEY, "7/file.bin", (double) expiresAtMillis);
    }

    @Test
    void reserveRejectsWhenExistingReservationsWouldExceedQuota() {
        when(hashOperations.entries(BYTES_KEY)).thenReturn(Map.of("7/existing.bin", "500"));
        long expiresAtMillis = System.currentTimeMillis() + Duration.ofMinutes(30).toMillis();

        boolean reserved = store.reserve(
                7L,
                1_000L,
                0L,
                List.of(new UploadReservationStore.ReservationCandidate("7/new.bin", 600L)),
                expiresAtMillis
        );

        assertFalse(reserved);
        verify(hashOperations, never()).put(BYTES_KEY, "7/new.bin", "600");
    }

    @Test
    void releaseUsesOwnerPrefixToRemoveReservation() {
        store.release("7/file.bin");

        verify(hashOperations).delete(BYTES_KEY, "7/file.bin");
        verify(zSetOperations).remove(EXPIRES_KEY, "7/file.bin");
    }
}
