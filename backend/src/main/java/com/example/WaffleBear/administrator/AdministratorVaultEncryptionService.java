package com.example.WaffleBear.administrator;

import com.example.WaffleBear.administrator.model.AdministratorDto;
import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileEncryptionMode;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.model.FileSpaceType;
import com.example.WaffleBear.file.service.VaultEncryptionMigrationService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.repository.UserRepository;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Administrator coordinator for auditing legacy plaintext Vault files and running
 * single-flight background AES-256-GCM envelope migration batches across users.
 */
@Slf4j
@Service
public class AdministratorVaultEncryptionService {

    private static final int MAX_RECENT_FAILURES = 20;

    private final AdministratorService administratorService;
    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final UserRepository userRepository;
    private final VaultEncryptionMigrationService vaultEncryptionMigrationService;
    private final ExecutorService migrationExecutor;

    private final Object jobLock = new Object();
    private MutableJobState jobState = MutableJobState.idle();

    @Autowired
    public AdministratorVaultEncryptionService(
            AdministratorService administratorService,
            FileUpDownloadRepository fileUpDownloadRepository,
            UserRepository userRepository,
            VaultEncryptionMigrationService vaultEncryptionMigrationService
    ) {
        this(
                administratorService,
                fileUpDownloadRepository,
                userRepository,
                vaultEncryptionMigrationService,
                createDaemonExecutor()
        );
    }

    AdministratorVaultEncryptionService(
            AdministratorService administratorService,
            FileUpDownloadRepository fileUpDownloadRepository,
            UserRepository userRepository,
            VaultEncryptionMigrationService vaultEncryptionMigrationService,
            ExecutorService migrationExecutor
    ) {
        this.administratorService = administratorService;
        this.administratorService.getClass();
        this.fileUpDownloadRepository = fileUpDownloadRepository;
        this.userRepository = userRepository;
        this.vaultEncryptionMigrationService = vaultEncryptionMigrationService;
        this.migrationExecutor = migrationExecutor != null ? migrationExecutor : createDaemonExecutor();
    }

    @PreDestroy
    void shutdownExecutor() {
        migrationExecutor.shutdownNow();
    }

    public AdministratorDto.VaultEncryptionStatusRes getStatus(AuthUserDetails adminUser) {
        administratorService.validateAdministratorAccess(adminUser);
        return buildStatusResponse();
    }

    public AdministratorDto.VaultEncryptionStatusRes startMigration(
            AuthUserDetails adminUser,
            Long requestedUserIdx
    ) {
        administratorService.validateAdministratorAccess(adminUser);

        Long targetUserIdx = (requestedUserIdx != null && requestedUserIdx > 0L) ? requestedUserIdx : null;
        if (targetUserIdx != null && userRepository.findById(targetUserIdx).isEmpty()) {
            throw BaseException.from(BaseResponseStatus.USER_NOT_FOUND);
        }

        List<FileUpDownloadRepository.VaultMigrationCandidateProjection> candidates;
        synchronized (jobLock) {
            if (jobState.running) {
                throw BaseException.from(
                        BaseResponseStatus.REQUEST_ERROR,
                        "이미 비밀 공간 파일 일괄 암호화 작업이 진행 중입니다."
                );
            }

            candidates = fileUpDownloadRepository.findActivePlaintextVaultCandidates(
                    FileNodeType.FILE,
                    FileSpaceType.VAULT,
                    FileEncryptionMode.NONE,
                    targetUserIdx
            );
            String jobId = UUID.randomUUID().toString();
            LocalDateTime now = LocalDateTime.now();

            if (candidates.isEmpty()) {
                jobState = MutableJobState.finishedEmpty(jobId, targetUserIdx, now);
                return buildStatusResponse();
            }

            jobState = MutableJobState.started(jobId, targetUserIdx, now, candidates.size());
        }

        final String activeJobId;
        synchronized (jobLock) {
            activeJobId = jobState.jobId;
        }

        migrationExecutor.submit(() -> executeBatch(activeJobId, candidates));
        return buildStatusResponse();
    }

    private void executeBatch(
            String activeJobId,
            List<FileUpDownloadRepository.VaultMigrationCandidateProjection> candidates
    ) {
        try {
            for (FileUpDownloadRepository.VaultMigrationCandidateProjection candidate : candidates) {
                String originName = candidate.getFileOriginName();
                synchronized (jobLock) {
                    if (!activeJobId.equals(jobState.jobId)) {
                        return;
                    }
                    jobState.currentFileName = originName != null ? originName : ("#" + candidate.getFileIdx());
                }

                long plainSize = Math.max(0L, candidate.getFileSize() == null ? 0L : candidate.getFileSize());
                VaultEncryptionMigrationService.FileMigrationOutcome outcome =
                        vaultEncryptionMigrationService.migrateSingleVaultFile(
                                candidate.getUserIdx(),
                                candidate.getFileIdx(),
                                candidate.getFileSavePath(),
                                plainSize
                        );

                synchronized (jobLock) {
                    if (!activeJobId.equals(jobState.jobId)) {
                        return;
                    }
                    jobState.processedCount += 1;
                    switch (outcome) {
                        case MIGRATED -> jobState.migratedCount += 1;
                        case SKIPPED -> jobState.skippedCount += 1;
                        case FAILED -> {
                            jobState.failedCount += 1;
                            if (jobState.recentFailures.size() < MAX_RECENT_FAILURES) {
                                jobState.recentFailures.add(AdministratorDto.VaultEncryptionFailureRes.builder()
                                        .fileIdx(candidate.getFileIdx())
                                        .userIdx(candidate.getUserIdx())
                                        .fileName(originName)
                                        .reason("암호화 또는 스토리지 처리 실패")
                                        .build());
                            }
                        }
                    }
                }
            }
        } catch (Exception exception) {
            log.warn("Administrator vault encryption batch [jobId={}] aborted unexpectedly: {}",
                    activeJobId, exception.getMessage());
            synchronized (jobLock) {
                if (activeJobId.equals(jobState.jobId)) {
                    jobState.lastError = "일괄 암호화 작업 중 예기치 않은 오류가 발생했습니다.";
                }
            }
        } finally {
            synchronized (jobLock) {
                if (activeJobId.equals(jobState.jobId)) {
                    jobState.running = false;
                    jobState.currentFileName = null;
                    jobState.finishedAt = LocalDateTime.now();
                }
            }
        }
    }

    private AdministratorDto.VaultEncryptionStatusRes buildStatusResponse() {
        List<FileUpDownloadRepository.VaultEncryptionStatProjection> rows =
                fileUpDownloadRepository.aggregateVaultEncryptionStats(
                        FileNodeType.FILE,
                        FileSpaceType.VAULT,
                        FileEncryptionMode.NONE
                );

        long totalVaultFiles = 0L;
        long encryptedVaultFiles = 0L;
        long plaintextVaultFiles = 0L;
        long plaintextBytes = 0L;
        long encryptedBytes = 0L;

        List<AdministratorDto.VaultEncryptionUserStatRes> users = new ArrayList<>();
        if (rows != null) {
            for (FileUpDownloadRepository.VaultEncryptionStatProjection row : rows) {
                long total = nonNegative(row.getTotalCount());
                long encrypted = nonNegative(row.getEncryptedCount());
                long plaintext = nonNegative(row.getPlaintextCount());
                long plainSize = nonNegative(row.getPlaintextBytes());
                long encSize = nonNegative(row.getEncryptedBytes());

                totalVaultFiles += total;
                encryptedVaultFiles += encrypted;
                plaintextVaultFiles += plaintext;
                plaintextBytes += plainSize;
                encryptedBytes += encSize;

                users.add(AdministratorDto.VaultEncryptionUserStatRes.builder()
                        .userIdx(row.getUserIdx())
                        .email(row.getUserEmail())
                        .name(row.getUserName())
                        .totalVaultFiles(total)
                        .encryptedVaultFiles(encrypted)
                        .plaintextVaultFiles(plaintext)
                        .plaintextBytes(plainSize)
                        .encryptedBytes(encSize)
                        .build());
            }
        }

        AdministratorDto.VaultEncryptionJobRes jobSnapshot;
        synchronized (jobLock) {
            jobSnapshot = jobState.toDto();
        }

        return AdministratorDto.VaultEncryptionStatusRes.builder()
                .totalVaultFiles(totalVaultFiles)
                .encryptedVaultFiles(encryptedVaultFiles)
                .plaintextVaultFiles(plaintextVaultFiles)
                .plaintextBytes(plaintextBytes)
                .encryptedBytes(encryptedBytes)
                .users(users)
                .job(jobSnapshot)
                .build();
    }

    private static long nonNegative(Long value) {
        return Math.max(0L, value == null ? 0L : value);
    }

    private static ExecutorService createDaemonExecutor() {
        return Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "admin-vault-encryption-worker");
            thread.setDaemon(true);
            return thread;
        });
    }

    private static final class MutableJobState {
        boolean running;
        String jobId;
        Long targetUserIdx;
        LocalDateTime startedAt;
        LocalDateTime finishedAt;
        int scannedCount;
        int processedCount;
        int migratedCount;
        int skippedCount;
        int failedCount;
        String currentFileName;
        String lastError;
        final List<AdministratorDto.VaultEncryptionFailureRes> recentFailures = new ArrayList<>();

        private static MutableJobState idle() {
            return new MutableJobState();
        }

        private static MutableJobState started(String jobId, Long targetUserIdx, LocalDateTime now, int scannedCount) {
            MutableJobState state = new MutableJobState();
            state.running = true;
            state.jobId = jobId;
            state.targetUserIdx = targetUserIdx;
            state.startedAt = now;
            state.scannedCount = scannedCount;
            return state;
        }

        private static MutableJobState finishedEmpty(String jobId, Long targetUserIdx, LocalDateTime now) {
            MutableJobState state = new MutableJobState();
            state.running = false;
            state.jobId = jobId;
            state.targetUserIdx = targetUserIdx;
            state.startedAt = now;
            state.finishedAt = now;
            return state;
        }

        private AdministratorDto.VaultEncryptionJobRes toDto() {
            return AdministratorDto.VaultEncryptionJobRes.builder()
                    .running(running)
                    .jobId(jobId)
                    .targetUserIdx(targetUserIdx)
                    .startedAt(startedAt)
                    .finishedAt(finishedAt)
                    .scannedCount(scannedCount)
                    .processedCount(processedCount)
                    .migratedCount(migratedCount)
                    .skippedCount(skippedCount)
                    .failedCount(failedCount)
                    .currentFileName(currentFileName)
                    .lastError(lastError)
                    .recentFailures(List.copyOf(recentFailures))
                    .build();
        }
    }
}
