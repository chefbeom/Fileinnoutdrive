package com.example.WaffleBear.chat;

import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Set;

@Service
@RequiredArgsConstructor
public class ChatAttachmentStorageService {
    private static final long MAX_IMAGE_SIZE = 5L * 1024 * 1024;
    private static final long MAX_FILE_SIZE = 30L * 1024 * 1024;
    private static final int DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60 * 24;
    private static final Set<String> IMAGE_TYPES = Set.of(
            "image/png", "image/jpeg", "image/jpg"
    );

    private final MinioClient minioClient;
    private final MinioPresignedUrlService minioPresignedUrlService;
    private final MinioProperties minioProperties;

    public String uploadChatAttachment(Long roomIdx, Long userIdx, MultipartFile file) {
        String contentType = file.getContentType();
        validateSize(file, contentType);

        try {
            String objectKey = "chat/" + roomIdx + "/" + userIdx + "/"
                    + System.currentTimeMillis() + "_" + file.getOriginalFilename();

            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(objectKey)
                            .stream(file.getInputStream(), file.getSize(), -1)
                            .contentType(contentType)
                            .build()
            );

            return minioPresignedUrlService.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(minioProperties.getBucket_cloud())
                            .object(objectKey)
                            .expiry(DOWNLOAD_URL_EXPIRY_SECONDS)
                            .build()
            );
        } catch (Exception e) {
            throw new RuntimeException("파일 업로드 실패: " + e.getMessage());
        }
    }

    private void validateSize(MultipartFile file, String contentType) {
        boolean isImage = IMAGE_TYPES.contains(contentType);

        if (isImage && file.getSize() > MAX_IMAGE_SIZE) {
            throw new IllegalArgumentException("이미지는 5MB 이하만 업로드 가능합니다.");
        }
        if (!isImage && file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("파일은 30MB 이하만 업로드 가능합니다.");
        }
    }
}