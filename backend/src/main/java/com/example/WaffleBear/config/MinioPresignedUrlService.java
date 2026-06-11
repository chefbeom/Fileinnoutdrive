package com.example.WaffleBear.config;

import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

@Service
public class MinioPresignedUrlService {

    private final MinioClient minioClient;

    public MinioPresignedUrlService(@Qualifier("presignedMinioClient") MinioClient minioClient) {
        this.minioClient = minioClient;
    }

    public String getPresignedObjectUrl(GetPresignedObjectUrlArgs args) throws Exception {
        return minioClient.getPresignedObjectUrl(args);
    }
}
