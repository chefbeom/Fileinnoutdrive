package com.example.WaffleBear.administrator;

import com.example.WaffleBear.administrator.model.AdministratorDto;
import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileEncryptionMode;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import com.example.WaffleBear.file.service.VaultEncryptionMigrationService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdministratorVaultEncryptionServiceTest {

    @Mock
    private AdministratorService administratorService;

    @Mock
    private FileUpDownloadRepository fileUpDownloadRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private VaultEncryptionMigrationService vaultEncryptionMigrationService;

    private AdministratorVaultEncryptionService service;

    @BeforeEach
    void setUp() {
        service = new AdministratorVaultEncryptionService(
                administratorService,
                fileUpDownloadRepository,
                userRepository,
                vaultEncryptionMigrationService,
                directExecutor()
        );
    }

    @Test
    void getStatusAggregatesOverallAndPerUserVaultCounts() {
        when(fileUpDownloadRepository.aggregateVaultEncryptionStats(
                FileNodeType.FILE,
                FileSpaceType.VAULT,
                FileEncryptionMode.NONE
        )).thenReturn(List.of(
                statRow(7L, "alice@example.com", "Alice", 10L, 4L, 6L, 6000L, 4000L),
                statRow(8L, "bob@example.com", "Bob", 3L, 3L, 0L, 0L, 1500L)
        ));

        AdministratorDto.VaultEncryptionStatusRes status = service.getStatus(admin());

        verify(administratorService).validateAdministratorAccess(any());
        assertThat(status.getTotalVaultFiles()).isEqualTo(13L);
        assertThat(status.getEncryptedVaultFiles()).isEqualTo(7L);
        assertThat(status.getPlaintextVaultFiles()).isEqualTo(6L);
        assertThat(status.getPlaintextBytes()).isEqualTo(6000L);
        assertThat(status.getEncryptedBytes()).isEqualTo(5500L);
        assertThat(status.getUsers()).hasSize(2);
        assertThat(status.getUsers().get(0).getEmail()).isEqualTo("alice@example.com");
        assertThat(status.getUsers().get(0).getPlaintextVaultFiles()).isEqualTo(6L);
        assertThat(status.getJob().isRunning()).isFalse();
    }

    @Test
    void rejectsNonAdministratorRequests() {
        AuthUserDetails member = AuthUserDetails.builder()
                .idx(2L)
                .email("member@example.com")
                .role("ROLE_USER")
                .enable(true)
                .accountStatus(UserAccountStatus.ACTIVE)
                .build();
        doThrow(new AccessDeniedException("administrator only"))
                .when(administratorService).validateAdministratorAccess(member);

        assertThatThrownBy(() -> service.getStatus(member))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> service.startMigration(member, null))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void startMigrationProcessesCandidatesAndRecordsCountsAndFailures() {
        when(fileUpDownloadRepository.findActivePlaintextVaultCandidates(
                FileNodeType.FILE,
                FileSpaceType.VAULT,
                FileEncryptionMode.NONE,
                null
        )).thenReturn(List.of(
                candidate(101L, 7L, "clip.mp4", "7/clip.mp4", 1024L),
                candidate(102L, 7L, "note.txt", "7/note.txt", 128L),
                candidate(103L, 8L, "missing.png", "8/missing.png", 512L)
        ));

        when(vaultEncryptionMigrationService.migrateSingleVaultFile(7L, 101L, "7/clip.mp4", 1024L))
                .thenReturn(VaultEncryptionMigrationService.FileMigrationOutcome.MIGRATED);
        when(vaultEncryptionMigrationService.migrateSingleVaultFile(7L, 102L, "7/note.txt", 128L))
                .thenReturn(VaultEncryptionMigrationService.FileMigrationOutcome.SKIPPED);
        when(vaultEncryptionMigrationService.migrateSingleVaultFile(8L, 103L, "8/missing.png", 512L))
                .thenReturn(VaultEncryptionMigrationService.FileMigrationOutcome.FAILED);

        AdministratorDto.VaultEncryptionStatusRes response = service.startMigration(admin(), null);
        AdministratorDto.VaultEncryptionJobRes job = response.getJob();

        assertThat(job.isRunning()).isFalse();
        assertThat(job.getScannedCount()).isEqualTo(3);
        assertThat(job.getProcessedCount()).isEqualTo(3);
        assertThat(job.getMigratedCount()).isEqualTo(1);
        assertThat(job.getSkippedCount()).isEqualTo(1);
        assertThat(job.getFailedCount()).isEqualTo(1);
        assertThat(job.getFinishedAt()).isNotNull();
        assertThat(job.getRecentFailures()).hasSize(1);
        assertThat(job.getRecentFailures().get(0).getFileIdx()).isEqualTo(103L);
        assertThat(job.getRecentFailures().get(0).getFileName()).isEqualTo("missing.png");
    }

    @Test
    void startMigrationTargetsSingleUserAndRejectsUnknownUser() {
        when(userRepository.findById(999L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.startMigration(admin(), 999L))
                .isInstanceOf(BaseException.class);

        when(userRepository.findById(7L)).thenReturn(Optional.of(User.builder().idx(7L).build()));
        when(fileUpDownloadRepository.findActivePlaintextVaultCandidates(
                FileNodeType.FILE,
                FileSpaceType.VAULT,
                FileEncryptionMode.NONE,
                7L
        )).thenReturn(List.of());

        AdministratorDto.VaultEncryptionStatusRes response = service.startMigration(admin(), 7L);
        assertThat(response.getJob().isRunning()).isFalse();
        assertThat(response.getJob().getTargetUserIdx()).isEqualTo(7L);
        assertThat(response.getJob().getScannedCount()).isZero();
    }

    @Test
    void startMigrationRejectsDuplicateRunWhileAlreadyRunning() throws Exception {
        ExecutorService singleThread = Executors.newSingleThreadExecutor();
        AdministratorVaultEncryptionService asyncService = new AdministratorVaultEncryptionService(
                administratorService,
                fileUpDownloadRepository,
                userRepository,
                vaultEncryptionMigrationService,
                singleThread
        );

        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);

        try {
            when(fileUpDownloadRepository.findActivePlaintextVaultCandidates(
                    FileNodeType.FILE,
                    FileSpaceType.VAULT,
                    FileEncryptionMode.NONE,
                    null
            )).thenReturn(List.of(candidate(101L, 7L, "clip.mp4", "7/clip.mp4", 1024L)));

            doAnswer(invocation -> {
                entered.countDown();
                release.await(5, TimeUnit.SECONDS);
                return VaultEncryptionMigrationService.FileMigrationOutcome.MIGRATED;
            }).when(vaultEncryptionMigrationService).migrateSingleVaultFile(7L, 101L, "7/clip.mp4", 1024L);

            AdministratorDto.VaultEncryptionStatusRes first = asyncService.startMigration(admin(), null);
            assertThat(first.getJob().isRunning()).isTrue();
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();

            assertThatThrownBy(() -> asyncService.startMigration(admin(), null))
                    .isInstanceOf(BaseException.class);
        } finally {
            release.countDown();
            singleThread.shutdownNow();
            singleThread.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    private static FileUpDownloadRepository.VaultEncryptionStatProjection statRow(
            Long userIdx,
            String email,
            String name,
            long total,
            long encrypted,
            long plaintext,
            long plainBytes,
            long encBytes
    ) {
        return new FileUpDownloadRepository.VaultEncryptionStatProjection() {
            @Override public Long getUserIdx() { return userIdx; }
            @Override public String getUserEmail() { return email; }
            @Override public String getUserName() { return name; }
            @Override public Long getTotalCount() { return total; }
            @Override public Long getEncryptedCount() { return encrypted; }
            @Override public Long getPlaintextCount() { return plaintext; }
            @Override public Long getPlaintextBytes() { return plainBytes; }
            @Override public Long getEncryptedBytes() { return encBytes; }
        };
    }

    private static FileUpDownloadRepository.VaultMigrationCandidateProjection candidate(
            Long fileIdx,
            Long userIdx,
            String name,
            String objectKey,
            Long fileSize
    ) {
        return new FileUpDownloadRepository.VaultMigrationCandidateProjection() {
            @Override public Long getFileIdx() { return fileIdx; }
            @Override public Long getUserIdx() { return userIdx; }
            @Override public String getFileOriginName() { return name; }
            @Override public String getFileSavePath() { return objectKey; }
            @Override public Long getFileSize() { return fileSize; }
        };
    }

    private static AuthUserDetails admin() {
        return AuthUserDetails.builder()
                .idx(1L)
                .id("admin@example.com")
                .email("admin@example.com")
                .name("Admin")
                .role("ROLE_ADMIN")
                .enable(true)
                .accountStatus(UserAccountStatus.ACTIVE)
                .build();
    }

    private static ExecutorService directExecutor() {
        return new AbstractExecutorService() {
            private volatile boolean shutdown;
            @Override public void shutdown() { shutdown = true; }
            @Override public List<Runnable> shutdownNow() { shutdown = true; return List.of(); }
            @Override public boolean isShutdown() { return shutdown; }
            @Override public boolean isTerminated() { return shutdown; }
            @Override public boolean awaitTermination(long timeout, TimeUnit unit) { return true; }
            @Override public void execute(Runnable command) { command.run(); }
        };
    }
}
