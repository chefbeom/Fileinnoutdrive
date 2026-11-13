package com.example.WaffleBear.config;

import io.lettuce.core.ReadFrom;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RedisConfigTest {

    @Test
    void standaloneReadConnectionFactoryDoesNotUseReplicaPreferredToAvoidInfoCommandPermissionError() {
        RedisConfig redisConfig = new RedisConfig();

        RedisConnectionFactory factory = redisConfig.readRedisConnectionFactory(
                "",
                "",
                "100.81.241.98",
                6379,
                "fileinnout-opt",
                "secret"
        );

        LettuceConnectionFactory lettuceFactory = assertInstanceOf(LettuceConnectionFactory.class, factory);
        assertTrue(lettuceFactory.getClientConfiguration().getReadFrom().isEmpty());
    }

    @Test
    void sentinelReadConnectionFactoryEnablesReplicaPreferred() {
        RedisConfig redisConfig = new RedisConfig();

        RedisConnectionFactory factory = redisConfig.readRedisConnectionFactory(
                "mymaster",
                "127.0.0.1:26379",
                "127.0.0.1",
                6379,
                "",
                ""
        );

        LettuceConnectionFactory lettuceFactory = assertInstanceOf(LettuceConnectionFactory.class, factory);
        assertEquals(ReadFrom.REPLICA_PREFERRED, lettuceFactory.getClientConfiguration().getReadFrom().orElse(null));
    }
}
