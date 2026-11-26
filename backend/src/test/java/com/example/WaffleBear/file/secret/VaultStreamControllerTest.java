package com.example.WaffleBear.file.secret;

import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.crypto.VaultChunkCrypto;
import com.example.WaffleBear.file.crypto.VaultFileCryptoService;
import com.example.WaffleBear.file.crypto.VaultKeyManagementService;
import com.example.WaffleBear.file.model.FileEncryptionMode;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import com.example.WaffleBear.file.service.FileObjectDownloadService;
import com.example.WaffleBear.file.service.VaultEncryptionMigrationService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.UserRepository;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class VaultStreamControllerTest {

    private static final String AUTH_USER_ATTR = "authUser";
    private static final int TEST_CHUNK_SIZE = 1024;
    private static final int TEST_PLAIN_SIZE = TEST_CHUNK_SIZE * 2 + 500; // 2548 bytes across 3 chunks

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private SecretAccessGuard secretAccessGuard;

    @Mock
    private FileObjectDownloadService fileObjectDownloadService;

    @Mock
    private VaultEncryptionMigrationService vaultEncryptionMigrationService;

    @Mock
    private MinioClient minioClient;

    private SecretTokenService secretTokenService;
    private VaultKeyManagementService keyManagementService;
    private MockMvc mockMvc;

    private byte[] plaintextBytes;
    private byte[] ciphertextBytes;
    private FileInfo encryptedVideo;
    private FileInfo encryptedHtml;

    @BeforeEach
    void setUp() throws Exception {
        secretTokenService = new SecretTokenService("test-jwt-secret-key-at-least-32-characters-long");
        keyManagementService = new VaultKeyManagementService("test-vault-master-key", "", 1);
        MinioProperties minioProperties = new MinioProperties();
        minioProperties.setBucket_cloud("fileinnout-test");

        VaultFileCryptoService vaultFileCryptoService = new VaultFileCryptoService(
                minioClient,
                minioProperties,
                keyManagementService
        );

        VaultStreamController controller = new VaultStreamController(
                fileUpDownloadRepository,
                userRepository,
                secretTokenService,
                secretAccessGuard,
                vaultFileCryptoService,
                fileObjectDownloadService,
                vaultEncryptionMigrationService
        );

        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setCustomArgumentResolvers(authUserArgumentResolver())
                .build();

        plaintextBytes = new byte[TEST_PLAIN_SIZE];
        new SecureRandom().nextBytes(plaintextBytes);

        byte[] dek = keyManagementService.generateDek();
        byte[] noncePrefix = keyManagementService.generateNoncePrefix();
        try (InputStream encIn = VaultChunkCrypto.openEncryptingStream(
                new ByteArrayInputStream(plaintextBytes),
                plaintextBytes.length,
                dek,
                noncePrefix,
                TEST_CHUNK_SIZE,
                VaultChunkCrypto.STREAM_KIND_FILE
        );
             ByteArrayOutputStream cipherOut = new ByteArrayOutputStream()) {
            encIn.transferTo(cipherOut);
            ciphertextBytes = cipherOut.toByteArray();
        }

        String wrappedDek = keyManagementService.wrapDek(dek);
        String nonceBase64 = keyManagementService.encodeBase64Url(noncePrefix);

        User activeUser = User.builder()
                .idx(7L)
                .email("user@example.com")
                .enable(true)
                .accountStatus(UserAccountStatus.ACTIVE)
                .build();
        lenient().when(userRepository.findById(7L)).thenReturn(Optional.of(activeUser));

        encryptedVideo = FileInfo.builder()
                .idx(15L)
                .user(activeUser)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .fileOriginName("secret-clip.mp4")
                .fileSaveName("vault-15.enc")
                .fileSavePath("7/vault/vault-15.enc")
                .fileFormat("mp4")
                .fileSize((long) plaintextBytes.length)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .encryptionKeyVersion(1)
                .wrappedDek(wrappedDek)
                .encryptionNoncePrefix(nonceBase64)
                .encryptionChunkSize(TEST_CHUNK_SIZE)
                .encryptedFileSize((long) ciphertextBytes.length)
                .build();

        encryptedHtml = FileInfo.builder()
                .idx(16L)
                .user(activeUser)
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .fileOriginName("payload.html")
                .fileSaveName("vault-16.enc")
                .fileSavePath("7/vault/vault-16.enc")
                .fileFormat("html")
                .fileSize((long) plaintextBytes.length)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .encryptionKeyVersion(1)
                .wrappedDek(wrappedDek)
                .encryptionNoncePrefix(nonceBase64)
                .encryptionChunkSize(TEST_CHUNK_SIZE)
                .encryptedFileSize((long) ciphertextBytes.length)
                .build();

        lenient().when(fileUpDownloadRepository.findByIdxAndUser_Idx(15L, 7L))
                .thenReturn(Optional.of(encryptedVideo));
        lenient().when(fileUpDownloadRepository.findByIdxAndUser_Idx(16L, 7L))
                .thenReturn(Optional.of(encryptedHtml));

        lenient().when(minioClient.getObject(any(GetObjectArgs.class))).thenAnswer(invocation -> {
            GetObjectArgs args = invocation.getArgument(0);
            int start = args.offset() != null ? args.offset().intValue() : 0;
            int end = args.length() != null
                    ? Math.min(ciphertextBytes.length, start + args.length().intValue())
                    : ciphertextBytes.length;
            byte[] slice = Arrays.copyOfRange(ciphertextBytes, start, end);
            return new GetObjectResponse(null, "fileinnout-test", null, args.object(), new ByteArrayInputStream(slice));
        });
    }

    @Test
    void streamsFullDecryptedVideoWithSecurityAndRangeHeaders() throws Exception {
        String st = secretTokenService.createVaultStreamToken(7L, 15L);

        MvcResult async = mockMvc.perform(get("/file/secret/stream/{fileIdx}", 15L)
                        .param("st", st))
                .andExpect(request().asyncStarted())
                .andReturn();

        MvcResult completed = mockMvc.perform(asyncDispatch(async))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "video/mp4"))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, org.hamcrest.Matchers.startsWith("inline;")))
                .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, plaintextBytes.length))
                .andReturn();

        assertThat(completed.getResponse().getContentAsByteArray()).isEqualTo(plaintextBytes);
    }

    @Test
    void supportsHttpRangeSeekAcrossChunksAndRejectsOutOfBoundsRange() throws Exception {
        String st = secretTokenService.createVaultStreamToken(7L, 15L);

        // Slice crossing chunk 0 and chunk 1 boundaries (bytes 900..1599 = 700 bytes)
        MvcResult async = mockMvc.perform(get("/file/secret/stream/{fileIdx}", 15L)
                        .param("st", st)
                        .header(HttpHeaders.RANGE, "bytes=900-1599"))
                .andExpect(request().asyncStarted())
                .andReturn();

        MvcResult partial = mockMvc.perform(asyncDispatch(async))
                .andExpect(status().isPartialContent())
                .andExpect(header().string(HttpHeaders.CONTENT_RANGE, "bytes 900-1599/" + plaintextBytes.length))
                .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, 700L))
                .andReturn();

        assertThat(partial.getResponse().getContentAsByteArray())
                .isEqualTo(Arrays.copyOfRange(plaintextBytes, 900, 1600));

        // Invalid range returns 416 Range Not Satisfiable
        mockMvc.perform(get("/file/secret/stream/{fileIdx}", 15L)
                        .param("st", st)
                        .header(HttpHeaders.RANGE, "bytes=999999-"))
                .andExpect(status().isRequestedRangeNotSatisfiable())
                .andExpect(header().string(HttpHeaders.CONTENT_RANGE, "bytes */" + plaintextBytes.length));
    }

    @Test
    void capsInlineOpenEndedRangeAtMaxInlineWindowWhileDownloadRemainsUncapped() throws Exception {
        long tenMbPlainSize = 10L * 1024 * 1024;
        FileInfo largeEncryptedVideo = FileInfo.builder()
                .idx(18L)
                .user(encryptedVideo.getUser())
                .nodeType(FileNodeType.FILE)
                .spaceType(FileSpaceType.VAULT)
                .fileOriginName("large-clip.mp4")
                .fileSaveName("vault-18.enc")
                .fileSavePath("7/vault/vault-18.enc")
                .fileFormat("mp4")
                .fileSize(tenMbPlainSize)
                .encryptionMode(FileEncryptionMode.SERVER_ENVELOPE_V1)
                .encryptionKeyVersion(1)
                .wrappedDek(encryptedVideo.getWrappedDek())
                .encryptionNoncePrefix(encryptedVideo.getEncryptionNoncePrefix())
                .encryptionChunkSize(TEST_CHUNK_SIZE)
                .encryptedFileSize(tenMbPlainSize + 1024L)
                .build();
        when(fileUpDownloadRepository.findByIdxAndUser_Idx(18L, 7L))
                .thenReturn(Optional.of(largeEncryptedVideo));

        String st = secretTokenService.createVaultStreamToken(7L, 18L);

        // Inline open-ended Range: bytes=0- caps at 4 MiB (0..4194303)
        MvcResult inlineHead = mockMvc.perform(head("/file/secret/stream/{fileIdx}", 18L)
                        .param("st", st)
                        .header(HttpHeaders.RANGE, "bytes=0-"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(inlineHead))
                .andExpect(status().isPartialContent())
                .andExpect(header().string(HttpHeaders.CONTENT_RANGE, "bytes 0-4194303/" + tenMbPlainSize))
                .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, 4L * 1024 * 1024));

        // Explicit download=1 keeps full remaining length
        MvcResult downloadHead = mockMvc.perform(head("/file/secret/stream/{fileIdx}", 18L)
                        .param("st", st)
                        .param("download", "1")
                        .header(HttpHeaders.RANGE, "bytes=0-"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(downloadHead))
                .andExpect(status().isPartialContent())
                .andExpect(header().string(HttpHeaders.CONTENT_RANGE, "bytes 0-" + (tenMbPlainSize - 1L) + "/" + tenMbPlainSize))
                .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, tenMbPlainSize));
    }

    @Test
    void supportsHeadDownloadAttachmentAndForcesOctetStreamForActiveWebFiles() throws Exception {
        String videoToken = secretTokenService.createVaultStreamToken(7L, 15L);

        MvcResult headAsync = mockMvc.perform(head("/file/secret/stream/{fileIdx}", 15L)
                        .param("st", videoToken))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(headAsync))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
                .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, plaintextBytes.length))
                .andExpect(content().bytes(new byte[0]));

        MvcResult downloadAsync = mockMvc.perform(get("/file/secret/stream/{fileIdx}", 15L)
                        .param("st", videoToken)
                        .param("download", "true"))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(downloadAsync))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, org.hamcrest.Matchers.startsWith("attachment;")));

        // Active web file (.html) must be forced to attachment + application/octet-stream
        String htmlToken = secretTokenService.createVaultStreamToken(7L, 16L);
        MvcResult htmlAsync = mockMvc.perform(get("/file/secret/stream/{fileIdx}", 16L)
                        .param("st", htmlToken))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(htmlAsync))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "application/octet-stream"))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, org.hamcrest.Matchers.startsWith("attachment;")));
    }

    @Test
    void revokesStreamTokenWhenVaultLocksAndAllowsAuthenticatedSessionFallback() throws Exception {
        String st = secretTokenService.createVaultStreamToken(7L, 15L);
        secretTokenService.revokeVaultTokens(7L);

        // Revoked stream token must fail immediately with 403
        mockMvc.perform(get("/file/secret/stream/{fileIdx}", 15L)
                        .param("st", st))
                .andExpect(status().isForbidden());

        // Missing token and no auth user also forbidden
        mockMvc.perform(get("/file/secret/stream/{fileIdx}", 15L))
                .andExpect(status().isForbidden());

        // Authenticated session + SecretAccessGuard succeeds even without st param
        MvcResult authAsync = mockMvc.perform(get("/file/secret/stream/{fileIdx}", 15L)
                        .requestAttr(AUTH_USER_ATTR, authenticatedUser()))
                .andExpect(request().asyncStarted())
                .andReturn();

        MvcResult authCompleted = mockMvc.perform(asyncDispatch(authAsync))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(authCompleted.getResponse().getContentAsByteArray()).isEqualTo(plaintextBytes);
    }

    private HandlerMethodArgumentResolver authUserArgumentResolver() {
        return new HandlerMethodArgumentResolver() {
            @Override
            public boolean supportsParameter(MethodParameter parameter) {
                return AuthUserDetails.class.equals(parameter.getParameterType());
            }

            @Override
            public Object resolveArgument(
                    MethodParameter parameter,
                    ModelAndViewContainer mavContainer,
                    NativeWebRequest webRequest,
                    WebDataBinderFactory binderFactory
            ) {
                return webRequest.getAttribute(AUTH_USER_ATTR, NativeWebRequest.SCOPE_REQUEST);
            }
        };
    }

    private static AuthUserDetails authenticatedUser() {
        return AuthUserDetails.builder()
                .idx(7L)
                .id("user@example.com")
                .email("user@example.com")
                .name("User")
                .role("ROLE_USER")
                .enable(true)
                .build();
    }
}
