package com.example.WaffleBear.file.crypto;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.util.FileContentUtils;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.UUID;

/**
 * High-level MinIO streaming envelope encryption/decryption operations for secret vault files.
 */
@Service
@RequiredArgsConstructor
public class VaultFileCryptoService {

    private final MinioClient minioClient;
    private final MinioProperties minioProperties;
    private final VaultKeyManagementService keyManagementService;

    @Value("${app.vault.encryption.chunk-size-bytes:1048576}")
    private int defaultChunkSize = VaultChunkCrypto.DEFAULT_CHUNK_SIZE;

    public record VaultEncryptionResult(
            String encryptedObjectKey,
            String encryptedSaveName,
            int keyVersion,
            String wrappedDek,
            String noncePrefixBase64,
            int chunkSize,
            long plaintextSize,
            long encryptedFileSize
    ) {
    }

    public record VaultDecryptionResult(
            String plaintextObjectKey,
            String plaintextSaveName,
            long plaintextSize
    ) {
    }

    public VaultDecryptionResult decryptToPlaintextObject(Long userIdx, FileInfo encryptedFile) {
        if (userIdx == null || userIdx <= 0 || encryptedFile == null || !encryptedFile.isEncrypted()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        String sourceKey = encryptedFile.getFileSavePath();
        if (sourceKey == null || sourceKey.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        String safeExtension = resolveSafePlainExtension(encryptedFile);
        String saveName = UUID.randomUUID() + "." + safeExtension;
        String targetObjectKey = userIdx + "/" + saveName;
        long plainSize = resolvePlaintextSize(encryptedFile);
        String contentType = FileContentUtils.resolveSafeMediaContentType(
                encryptedFile.getFileOriginName(),
                safeExtension
        );

        try (InputStream plainIn = openDecryptedInputStream(encryptedFile)) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(targetObjectKey)
                            .stream(plainIn, plainSize, -1)
                            .contentType(contentType)
                            .build()
            );
            return new VaultDecryptionResult(targetObjectKey, saveName, plainSize);
        } catch (Exception exception) {
            deleteObjectQuietly(targetObjectKey);
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private String resolveSafePlainExtension(FileInfo file) {
        String raw = file.getFileFormat();
        if ((raw == null || raw.isBlank()) && file.getFileOriginName() != null) {
            String originName = file.getFileOriginName();
            int dot = originName.lastIndexOf('.');
            if (dot >= 0 && dot < originName.length() - 1) {
                raw = originName.substring(dot + 1);
            }
        }
        if (raw == null) {
            return "bin";
        }
        String cleaned = raw.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
        if (cleaned.isEmpty()) {
            return "bin";
        }
        return cleaned.length() > 16 ? cleaned.substring(0, 16) : cleaned;
    }

    public VaultEncryptionResult encryptPlaintextObject(
            Long userIdx,
            String sourcePlaintextObjectKey,
            long plaintextSize
    ) {
        if (userIdx == null || userIdx <= 0 || sourcePlaintextObjectKey == null || sourcePlaintextObjectKey.isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        int chunkSize = resolveDefaultChunkSize();
        long normalizedPlainSize = Math.max(0L, plaintextSize);
        long encryptedSize = VaultChunkCrypto.encryptedSize(normalizedPlainSize, chunkSize);

        String saveName = UUID.randomUUID() + ".enc";
        String targetObjectKey = userIdx + "/vault/" + saveName;

        byte[] dek = keyManagementService.generateDek();
        byte[] noncePrefix = keyManagementService.generateNoncePrefix();
        String wrappedDek = keyManagementService.wrapDek(dek);
        String noncePrefixBase64 = keyManagementService.encodeBase64Url(noncePrefix);

        try (InputStream plainIn = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(minioProperties.getBucket_cloud())
                        .object(sourcePlaintextObjectKey)
                        .build()
        );
             InputStream encStream = VaultChunkCrypto.openEncryptingStream(
                     plainIn,
                     normalizedPlainSize,
                     dek,
                     noncePrefix,
                     chunkSize,
                     VaultChunkCrypto.STREAM_KIND_FILE
             )) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(targetObjectKey)
                            .stream(encStream, encryptedSize, -1)
                            .contentType("application/octet-stream")
                            .build()
            );
            return new VaultEncryptionResult(
                    targetObjectKey,
                    saveName,
                    keyManagementService.getCurrentKeyVersion(),
                    wrappedDek,
                    noncePrefixBase64,
                    chunkSize,
                    normalizedPlainSize,
                    encryptedSize
            );
        } catch (Exception exception) {
            deleteObjectQuietly(targetObjectKey);
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    public void streamDecryptedRange(FileInfo file, long plainStart, long plainEnd, OutputStream out) throws IOException {
        CryptoMaterial material = unwrapMaterial(file);
        long plainSize = resolvePlaintextSize(file);
        if (plainSize == 0L) {
            // Read and verify the authenticated tag of an empty object.
            try (InputStream decrypted = openDecryptedInputStream(file)) {
                decrypted.transferTo(out);
            }
            return;
        }

        VaultChunkCrypto.EncryptedByteSlice slice = VaultChunkCrypto.computeEncryptedRange(
                plainSize,
                material.chunkSize(),
                plainStart,
                plainEnd
        );

        try (InputStream cipherSlice = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(minioProperties.getBucket_cloud())
                        .object(file.getFileSavePath())
                        .offset(slice.encStart())
                        .length(slice.encLength())
                        .build()
        )) {
            VaultChunkCrypto.decryptRangeStream(
                    cipherSlice,
                    out,
                    material.dek(),
                    material.noncePrefix(),
                    material.chunkSize(),
                    plainSize,
                    plainStart,
                    plainEnd,
                    VaultChunkCrypto.STREAM_KIND_FILE
            );
        } catch (IOException ioException) {
            throw ioException;
        } catch (Exception exception) {
            throw new IOException("Failed to stream encrypted vault range", exception);
        }
    }

    public InputStream openDecryptedInputStream(FileInfo file) {
        CryptoMaterial material = unwrapMaterial(file);
        long plainSize = resolvePlaintextSize(file);
        try {
            InputStream cipherStream = minioClient.getObject(
                    GetObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(file.getFileSavePath())
                            .build()
            );
            return VaultChunkCrypto.openDecryptingStream(
                    cipherStream,
                    material.dek(),
                    material.noncePrefix(),
                    material.chunkSize(),
                    plainSize,
                    VaultChunkCrypto.STREAM_KIND_FILE
            );
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    public byte[] readDecryptedBytes(FileInfo file) {
        long plainSize = resolvePlaintextSize(file);
        int initialCapacity = plainSize > 0L && plainSize <= Integer.MAX_VALUE ? (int) plainSize : 1024;
        try (InputStream decrypted = openDecryptedInputStream(file);
             ByteArrayOutputStream out = new ByteArrayOutputStream(initialCapacity)) {
            decrypted.transferTo(out);
            return out.toByteArray();
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    public InputStream openDecryptedPrefixStream(FileInfo file, long maxPlainBytes) {
        long plainSize = resolvePlaintextSize(file);
        if (plainSize == 0L || maxPlainBytes <= 0L) {
            return openDecryptedInputStream(file);
        }
        long end = Math.min(plainSize - 1L, maxPlainBytes - 1L);
        try (ByteArrayOutputStream buffer = new ByteArrayOutputStream((int) (end + 1L))) {
            streamDecryptedRange(file, 0L, end, buffer);
            return new ByteArrayInputStream(buffer.toByteArray());
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    public void encryptAndStoreThumbnail(FileInfo file, String encryptedThumbKey, byte[] plainThumbBytes) throws Exception {
        if (file == null || !file.isEncrypted() || encryptedThumbKey == null || encryptedThumbKey.isBlank()) {
            return;
        }
        if (plainThumbBytes == null || plainThumbBytes.length == 0) {
            return;
        }
        byte[] dek = unwrapMaterial(file).dek();
        byte[] encryptedBlob = VaultChunkCrypto.encryptThumbnailBlob(plainThumbBytes, dek);
        try (ByteArrayInputStream in = new ByteArrayInputStream(encryptedBlob)) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(encryptedThumbKey)
                            .stream(in, encryptedBlob.length, -1)
                            .contentType("application/octet-stream")
                            .build()
            );
        }
    }

    public byte[] loadDecryptedThumbnail(FileInfo file, String encryptedThumbKey) {
        if (file == null || !file.isEncrypted() || encryptedThumbKey == null || encryptedThumbKey.isBlank()) {
            return null;
        }
        byte[] dek = unwrapMaterial(file).dek();
        try (InputStream in = minioClient.getObject(
                GetObjectArgs.builder()
                        .bucket(minioProperties.getBucket_cloud())
                        .object(encryptedThumbKey)
                        .build()
        );
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            in.transferTo(out);
            return VaultChunkCrypto.decryptThumbnailBlob(out.toByteArray(), dek);
        } catch (Exception ignored) {
            return null;
        }
    }

    public void deleteObjectQuietly(String objectKey) {
        if (objectKey == null || objectKey.isBlank() || minioProperties.getBucket_cloud() == null) {
            return;
        }
        try {
            minioClient.removeObject(
                    RemoveObjectArgs.builder()
                            .bucket(minioProperties.getBucket_cloud())
                            .object(objectKey)
                            .build()
            );
        } catch (Exception ignored) {
        }
    }

    private CryptoMaterial unwrapMaterial(FileInfo file) {
        if (file == null || !file.isEncrypted() || file.getFileSavePath() == null || file.getFileSavePath().isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        byte[] dek = keyManagementService.unwrapDek(file.getWrappedDek(), file.getEncryptionKeyVersion());
        byte[] noncePrefix = keyManagementService.decodeBase64Url(file.getEncryptionNoncePrefix());
        int chunkSize = file.getEncryptionChunkSize() != null && file.getEncryptionChunkSize() > 0
                ? file.getEncryptionChunkSize()
                : resolveDefaultChunkSize();
        return new CryptoMaterial(dek, noncePrefix, chunkSize);
    }

    private long resolvePlaintextSize(FileInfo file) {
        return Math.max(0L, file.getFileSize() == null ? 0L : file.getFileSize());
    }

    private int resolveDefaultChunkSize() {
        return defaultChunkSize > 0 ? defaultChunkSize : VaultChunkCrypto.DEFAULT_CHUNK_SIZE;
    }

    private record CryptoMaterial(byte[] dek, byte[] noncePrefix, int chunkSize) {
    }
}
