package com.example.WaffleBear.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

@Configuration
public class FileAsyncConfig {

    @Bean(name = "videoThumbnailExecutor")
    public Executor thumbnailTaskExecutor(
            @Value("${app.thumbnail.executor.core-pool-size:1}") int corePoolSize,
            @Value("${app.thumbnail.executor.max-pool-size:2}") int maxPoolSize,
            @Value("${app.thumbnail.executor.queue-capacity:50}") int queueCapacity
    ) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        int normalizedCorePoolSize = Math.max(1, corePoolSize);
        int normalizedMaxPoolSize = Math.max(normalizedCorePoolSize, maxPoolSize);
        executor.setCorePoolSize(normalizedCorePoolSize);
        executor.setMaxPoolSize(normalizedMaxPoolSize);
        executor.setQueueCapacity(Math.max(0, queueCapacity));
        executor.setThreadNamePrefix("thumbnail-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.initialize();
        return executor;
    }
}
