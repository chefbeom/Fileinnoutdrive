package com.example.WaffleBear.config;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import okhttp3.ConnectionPool;
import okhttp3.OkHttpClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.util.StringUtils;

import java.util.concurrent.TimeUnit;

@Slf4j
@Configuration
@RequiredArgsConstructor
public class MinioConfig {
    private final MinioProperties minioProperties;

    @Bean
    @Primary
    public MinioClient minioClient() {
        MinioClient minioClient = buildClient(minioProperties.getEndpoint());
        initBucket(minioClient);
        return minioClient;
    }

    @Bean(name = "presignedMinioClient")
    public MinioClient presignedMinioClient() {
        return buildClient(minioProperties.getPublicEndpoint());
    }

    private MinioClient buildClient(String endpoint) {
        OkHttpClient httpClient = new OkHttpClient.Builder()
                .connectTimeout(5, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .connectionPool(new ConnectionPool(10, 2, TimeUnit.MINUTES))
                .build();

        MinioClient.Builder builder = MinioClient.builder()
                .endpoint(endpoint)
                .httpClient(httpClient)
                .credentials(minioProperties.getAccessKey(), minioProperties.getSecretKey());

        if (StringUtils.hasText(minioProperties.getRegion())) {
            builder.region(minioProperties.getRegion());
        }

        return builder.build();
    }

    private void initBucket(MinioClient minioClient) {
        String[] buckets = { minioProperties.getBucket_cloud(), minioProperties.getBucket_work() };

        for (String bucketName : buckets) {
            if (bucketName == null || bucketName.isBlank()) {
                continue;
            }

            try {
                boolean found = minioClient.bucketExists(
                        BucketExistsArgs.builder().bucket(bucketName).build()
                );

                if (!found) {
                    log.info("Creating MinIO bucket: [{}]", bucketName);
                    minioClient.makeBucket(
                            MakeBucketArgs.builder().bucket(bucketName).build()
                    );
                }
            } catch (Exception e) {
                log.error("Failed to initialize bucket [{}]: {}", bucketName, e.getMessage());
            }
        }
    }
}
