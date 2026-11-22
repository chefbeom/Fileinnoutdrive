package com.example.WaffleBear.chat;

import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
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
    private static final Set<String> IMAGE_EXTENSIONS = Set.of(
            "png", "jpg", "jpeg"
    );

    private final MinioClient minioClient;
    private final MinioPresignedUrlService minioPresignedUrlService;
    private final MinioProperties minioProperties;

    public String uploadChatAttachment(Long roomIdx, Long userIdx, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("업로드할 파일이 비어 있습니다.");
        }

        String safeFileName = sanitizeFileName(file.getOriginalFilename());
        String normalizedContentType = normalizeContentType(file.getContentType());
        boolean isImage = IMAGE_TYPES.contains(normalizedContentType) && hasAllowedImageExtension(safeFileName);
        validateSize(file, isImage);

        String storedContentType = isImage ? normalizedContentType : "application/octet-stream";

        try {
            String objectKey = "chat/" + roomIdx + "/" + userIdx + "/"
                    + System.currentTimeMillis() + "_" + safeFileName;

            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(objectKey)
                            .stream(file.getInputStream(), file.getSize(), -1)
                            .contentType(storedContentType)
                            .build()
            );

            GetPresignedObjectUrlArgs.Builder urlArgs = GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(minioProperties.getBucket_cloud())
                    .object(objectKey)
                    .expiry(DOWNLOAD_URL_EXPIRY_SECONDS);
            if (!isImage) {
                urlArgs.extraQueryParams(Map.of(
                        "response-content-disposition",
                        ContentDisposition.attachment()
                                .filename(safeFileName, StandardCharsets.UTF_8)
                                .build()
                                .toString(),
                        "response-content-type",
                        "application/octet-stream"
                ));
            }

            return minioPresignedUrlService.getPresignedObjectUrl(urlArgs.build());
        } catch (Exception e) {
            throw new RuntimeException("파일 업로드 실패: " + e.getMessage());
        }
    }

    private void validateSize(MultipartFile file, boolean isImage) {
        if (isImage && file.getSize() > MAX_IMAGE_SIZE) {
            throw new IllegalArgumentException("이미지는 5MB 이하만 업로드 가능합니다.");
        }
        if (!isImage && file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("파일은 30MB 이하만 업로드 가능합니다.");
        }
    }

    private String normalizeContentType(String contentType) {
        if (contentType == null) {
            return "";
        }
        String baseType = contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return baseType;
    }

    private String sanitizeFileName(String originalFilename) {
        String normalized = originalFilename == null ? "" : originalFilename.replace('\\', '/').trim();
        int slashIndex = normalized.lastIndexOf('/');
        if (slashIndex >= 0) {
            normalized = normalized.substring(slashIndex + 1);
        }
        if (normalized.isBlank() || normalized.contains("\u0000") || normalized.contains("..") || ".".equals(normalized)) {
            throw new IllegalArgumentException("유효하지 않은 파일명입니다.");
        }
        String sanitized = normalized.replaceAll("[^A-Za-z0-9가-힣._-]", "_");
        if (sanitized.isBlank() || sanitized.replace(".", "").isBlank()) {
            throw new IllegalArgumentException("유효하지 않은 파일명입니다.");
        }
        return sanitized;
    }

    private boolean hasAllowedImageExtension(String fileName) {
        if (fileName == null) {
            return false;
        }
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex < 0 || dotIndex >= fileName.length() - 1) {
            return false;
        }
        String ext = fileName.substring(dotIndex + 1).trim().toLowerCase(Locale.ROOT);
        return IMAGE_EXTENSIONS.contains(ext);
    }
}