package com.example.WaffleBear.file.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

@Component
public class ThumbnailTaskExecutor {

    private final Executor executor;

    public ThumbnailTaskExecutor(@Qualifier("videoThumbnailExecutor") Executor executor) {
        this.executor = executor;
    }

    public CompletableFuture<Void> runAsync(Runnable task) {
        return CompletableFuture.runAsync(task, executor);
    }
}
