package com.example.WaffleBear.config;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.lettuce.core.ClientOptions;
import io.lettuce.core.ReadFrom;
import io.lettuce.core.SocketOptions;
import io.lettuce.core.protocol.ProtocolVersion;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisSentinelConfiguration;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Configuration
public class RedisConfig {

    @Value("${REDIS_KEY_PREFIX:}")
    private String redisKeyPrefix;

    public static String resolvePrefixedName(String rawPrefix, String name) {
        if (!StringUtils.hasText(name)) {
            return name;
        }
        if (!StringUtils.hasText(rawPrefix)) {
            return name;
        }
        String normalizedPrefix = rawPrefix.trim().replaceAll(":+$", "") + ":";
        return name.startsWith(normalizedPrefix) ? name : normalizedPrefix + name;
    }

    @Bean
    @Primary
    public RedisConnectionFactory redisConnectionFactory(
            @Value("${REDIS_SENTINEL_MASTER:}") String sentinelMaster,
            @Value("${REDIS_SENTINEL_NODES:}") String sentinelNodes,
            @Value("${REDIS_HOST:127.0.0.1}") String redisHost,
            @Value("${REDIS_PORT:6379}") int redisPort,
            @Value("${REDIS_USERNAME:}") String redisUsername,
            @Value("${REDIS_PASSWORD:}") String redisPassword
    ) {
        return createConnectionFactory(
                sentinelMaster,
                sentinelNodes,
                redisHost,
                redisPort,
                redisUsername,
                redisPassword,
                false
        );
    }

    @Bean(name = "readRedisConnectionFactory")
    public RedisConnectionFactory readRedisConnectionFactory(
            @Value("${REDIS_SENTINEL_MASTER:}") String sentinelMaster,
            @Value("${REDIS_SENTINEL_NODES:}") String sentinelNodes,
            @Value("${REDIS_HOST:127.0.0.1}") String redisHost,
            @Value("${REDIS_PORT:6379}") int redisPort,
            @Value("${REDIS_USERNAME:}") String redisUsername,
            @Value("${REDIS_PASSWORD:}") String redisPassword
    ) {
        return createConnectionFactory(
                sentinelMaster,
                sentinelNodes,
                redisHost,
                redisPort,
                redisUsername,
                redisPassword,
                true
        );
    }

    private int parsePort(String rawPort, int fallback) {
        try {
            return Integer.parseInt(rawPort);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private RedisConnectionFactory createConnectionFactory(
            String sentinelMaster,
            String sentinelNodes,
            String redisHost,
            int redisPort,
            String redisUsername,
            String redisPassword,
            boolean replicaPreferred
    ) {
        boolean sentinelEnabled = StringUtils.hasText(sentinelMaster) && StringUtils.hasText(sentinelNodes);
        SocketOptions socketOptions = SocketOptions.builder()
                .connectTimeout(Duration.ofSeconds(3))
                .keepAlive(true)
                .build();
        LettuceClientConfiguration.LettuceClientConfigurationBuilder clientConfigurationBuilder =
                LettuceClientConfiguration.builder()
                        .commandTimeout(Duration.ofSeconds(3))
                        .clientOptions(ClientOptions.builder()
                                .socketOptions(socketOptions)
                                .protocolVersion(ProtocolVersion.RESP2)
                                .build());

        // Standalone Redis에서는 ReadFrom 설정 시 Lettuce MasterReplica가 INFO 명령으로 토폴로지를 조회하므로
        // ACL 제한 계정(NOPERM: info)에서 연결 오류가 발생할 수 있습니다. Sentinel 구성일 때만 활성화합니다.
        if (replicaPreferred && sentinelEnabled) {
            clientConfigurationBuilder.readFrom(ReadFrom.REPLICA_PREFERRED);
        }

        LettuceClientConfiguration clientConfiguration = clientConfigurationBuilder.build();

        if (sentinelEnabled) {
            RedisSentinelConfiguration sentinelConfiguration = new RedisSentinelConfiguration();
            sentinelConfiguration.master(sentinelMaster.trim());

            for (String rawNode : sentinelNodes.split("[,\\s]+")) {
                if (!StringUtils.hasText(rawNode)) {
                    continue;
                }

                String[] hostAndPort = rawNode.trim().split(":");
                String host = hostAndPort[0].trim();
                int port = hostAndPort.length > 1 ? parsePort(hostAndPort[1].trim(), 26379) : 26379;
                sentinelConfiguration.sentinel(host, port);
            }

            if (StringUtils.hasText(redisUsername)) {
                sentinelConfiguration.setUsername(redisUsername.trim());
            }
            if (StringUtils.hasText(redisPassword)) {
                sentinelConfiguration.setPassword(RedisPassword.of(redisPassword.trim()));
            }

            return new LettuceConnectionFactory(sentinelConfiguration, clientConfiguration);
        }

        RedisStandaloneConfiguration standaloneConfiguration =
                new RedisStandaloneConfiguration(redisHost.trim(), redisPort);
        if (StringUtils.hasText(redisUsername)) {
            standaloneConfiguration.setUsername(redisUsername.trim());
        }
        if (StringUtils.hasText(redisPassword)) {
            standaloneConfiguration.setPassword(RedisPassword.of(redisPassword.trim()));
        }
        return new LettuceConnectionFactory(standaloneConfiguration, clientConfiguration);
    }

    private RedisSerializer<String> createKeySerializer() {
        if (!StringUtils.hasText(redisKeyPrefix)) {
            return new StringRedisSerializer();
        }
        final String normalizedPrefix = redisKeyPrefix.trim().replaceAll(":+$", "") + ":";
        return new RedisSerializer<>() {
            @Override
            public byte[] serialize(String value) {
                if (value == null) {
                    return null;
                }
                String prefixed = value.startsWith(normalizedPrefix) ? value : normalizedPrefix + value;
                return prefixed.getBytes(StandardCharsets.UTF_8);
            }

            @Override
            public String deserialize(byte[] bytes) {
                if (bytes == null) {
                    return null;
                }
                String raw = new String(bytes, StandardCharsets.UTF_8);
                return raw.startsWith(normalizedPrefix) ? raw.substring(normalizedPrefix.length()) : raw;
            }
        };
    }

    @Bean
    @Primary
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
        return createRedisTemplate(connectionFactory);
    }

    @Bean(name = "readRedisTemplate")
    public RedisTemplate<String, Object> readRedisTemplate(
            @Qualifier("readRedisConnectionFactory") RedisConnectionFactory connectionFactory
    ) {
        return createRedisTemplate(connectionFactory);
    }

    private RedisTemplate<String, Object> createRedisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        objectMapper.activateDefaultTyping(
                LaissezFaireSubTypeValidator.instance,
                ObjectMapper.DefaultTyping.NON_FINAL,
                JsonTypeInfo.As.PROPERTY
        );

        GenericJackson2JsonRedisSerializer serializer = new GenericJackson2JsonRedisSerializer(objectMapper);

        template.setKeySerializer(createKeySerializer());
        template.setValueSerializer(serializer);
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(serializer);
        template.afterPropertiesSet();

        return template;
    }

    @Bean
    @Primary
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        return createStringRedisTemplate(connectionFactory);
    }

    @Bean(name = "readStringRedisTemplate")
    public StringRedisTemplate readStringRedisTemplate(
            @Qualifier("readRedisConnectionFactory") RedisConnectionFactory connectionFactory
    ) {
        return createStringRedisTemplate(connectionFactory);
    }

    private StringRedisTemplate createStringRedisTemplate(RedisConnectionFactory connectionFactory) {
        StringRedisTemplate template = new StringRedisTemplate();
        template.setConnectionFactory(connectionFactory);
        template.setKeySerializer(createKeySerializer());
        template.setValueSerializer(new StringRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(new StringRedisSerializer());
        template.afterPropertiesSet();
        return template;
    }
}
