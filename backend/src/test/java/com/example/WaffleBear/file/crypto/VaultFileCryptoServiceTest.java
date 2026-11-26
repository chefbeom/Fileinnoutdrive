package com.example.WaffleBear.file.crypto;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.file.model.FileEncryptionMode;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.SecureRandom;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VaultFileCryptoServiceTest {

    @Mock
    private MinioClient minioClient;

    private VaultKeyManagementService keyManagementService;
    private VaultFileCryptoService service;

    @BeforeEach
    void setUp() {
        MinioProperties props = new MinioProperties();
        props.setBucket_cloud("fileinnout-test");
        byte[] masterKey = new byte[32];
        new SecureRandom().nextBytes(masterKey);
        keyManagementService = new VaultKeyManagementService(Base64.getEncoder().encodeToString(masterKey), "", 1);
        service = new VaultFileCryptoService(minioClient, props, keyManagementService);
    }

    @Test
    void decryptToPlaintextObjectStreamsDecryptedBytesAndResolvesSafeExtension() throws Exception {
        byte[] plaintext = new byte[2560];
        new SecureRandom().nextBytes(plaintext);

        byte[] dek = keyManagementService.generateDek();
        byte[] noncePrefix = keyManagementService.generateNoncePrefix();
        String wrappedDek = keyManagementService.wrapDek(dek);
        String noncePrefixB64 = keyManagementService.encodeBase64Url(noncePrefix);

        byte[] ciphertext;
        try (InputStream enc = VaultChunkCrypto.openEncryptingStream(
                new ByteArrayInputStream(plaintext),
                plaintext.length,
                dek,
                noncePrefix,
                1024,
                VaultChunkCrypto.STREAM_KIND_FILE
        );
             ByteArrayOutputStream encOut = new ByteArrayOutputStream()) {
            enc.transferTo(encOut);
            ciphertext = encOut.toByteArray();
        }

        FileInfo encryptedFile = FileInfo.builder()
                .idx(99L)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .encryptionKeyVersion(1)
                .wrappedDek(wrappedDek)
                .encryptionNoncePrefix(noncePrefixB64)
                .encryptionChunkSize(1024)
                .fileOriginName("holiday.mp4")
                .fileFormat("mp4")
                .fileSaveName("abc.enc")
                .fileSavePath("7/vault/abc.enc")
                .fileSize((long) plaintext.length)
                .encryptedFileSize((long) ciphertext.length)
                .build();

        when(minioClient.getObject(any(GetObjectArgs.class)))
                .thenReturn(new GetObjectResponse(null, "fileinnout-test", null, "7/vault/abc.enc", new ByteArrayInputStream(ciphertext)));

        ByteArrayOutputStream uploadedBytes = new ByteArrayOutputStream();
        when(minioClient.putObject(any(PutObjectArgs.class))).thenAnswer(inv -> {
            PutObjectArgs args = inv.getArgument(0);
            args.stream().transferTo(uploadedBytes);
            return null;
        });

        VaultFileCryptoService.VaultDecryptionResult result = service.decryptToPlaintextObject(7L, encryptedFile);

        assertThat(result.plaintextObjectKey()).startsWith("7/").endsWith(".mp4");
        assertThat(result.plaintextSaveName()).endsWith(".mp4");
        assertThat(result.plaintextSize()).isEqualTo(plaintext.length);
        assertThat(uploadedBytes.toByteArray()).isEqualTo(plaintext);
    }

    @Test
    void decryptToPlaintextObjectCleansUpTargetObjectOnPutFailure() throws Exception {
        byte[] dek = keyManagementService.generateDek();
        byte[] noncePrefix = keyManagementService.generateNoncePrefix();
        byte[] plaintext = "hello".getBytes();
        byte[] ciphertext;
        try (InputStream enc = VaultChunkCrypto.openEncryptingStream(
                new ByteArrayInputStream(plaintext),
                plaintext.length,
                dek,
                noncePrefix,
                1024,
                VaultChunkCrypto.STREAM_KIND_FILE
        );
             ByteArrayOutputStream encOut = new ByteArrayOutputStream()) {
            enc.transferTo(encOut);
            ciphertext = encOut.toByteArray();
        }

        FileInfo encryptedFile = FileInfo.builder()
                .idx(100L)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .encryptionKeyVersion(1)
                .wrappedDek(keyManagementService.wrapDek(dek))
                .encryptionNoncePrefix(keyManagementService.encodeBase64Url(noncePrefix))
                .encryptionChunkSize(1024)
                .fileOriginName("secret.txt")
                .fileFormat("txt")
                .fileSaveName("sec.enc")
                .fileSavePath("7/vault/sec.enc")
                .fileSize((long) plaintext.length)
                .encryptedFileSize((long) ciphertext.length)
                .build();

        when(minioClient.getObject(any(GetObjectArgs.class)))
                .thenReturn(new GetObjectResponse(null, "fileinnout-test", null, "7/vault/sec.enc", new ByteArrayInputStream(ciphertext)));
        when(minioClient.putObject(any(PutObjectArgs.class))).thenThrow(new RuntimeException("disk full"));

        assertThatThrownBy(() -> service.decryptToPlaintextObject(7L, encryptedFile))
                .isInstanceOf(BaseException.class);

        ArgumentCaptor<RemoveObjectArgs> removeCaptor = ArgumentCaptor.forClass(RemoveObjectArgs.class);
        verify(minioClient).removeObject(removeCaptor.capture());
        assertThat(removeCaptor.getValue().object()).startsWith("7/").endsWith(".txt");
    }
}
