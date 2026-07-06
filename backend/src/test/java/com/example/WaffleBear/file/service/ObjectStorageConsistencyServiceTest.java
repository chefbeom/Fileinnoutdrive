package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.version.FileVersionRepository;
import com.example.WaffleBear.workspace.asset.WorkspaceAssetRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ObjectStorageConsistencyServiceTest {

    private FileUpDownloadRepository fileUpDownloadRepository;
    private FileVersionRepository fileVersionRepository;
    private WorkspaceAssetRepository workspaceAssetRepository;
    private FileObjectDeletionService fileObjectDeletionService;

    @BeforeEach
    void setUp() {
        fileUpDownloadRepository = mock(FileUpDownloadRepository.class);
        fileVersionRepository = mock(FileVersionRepository.class);
        workspaceAssetRepository = mock(WorkspaceAssetRepository.class);
        fileObjectDeletionService = mock(FileObjectDeletionService.class);
    }

    @Test
    void loadReferencedCloudObjectKeysMergesAndNormalizesDatabaseKeys() {
        when(fileUpDownloadRepository.findStoredObjectKeys()).thenReturn(Arrays.asList(" 1/report.txt ", "", null));
        when(fileVersionRepository.findStoredObjectKeys()).thenReturn(List.of("1/report-v1.txt", "1/report.txt"));
        when(workspaceAssetRepository.findAllObjectKeys()).thenReturn(List.of("file/workspace/a.png", " "));
        ObjectStorageConsistencyService service = serviceWithCloudObjects(List.of(), false);

        Set<String> referencedKeys = service.loadReferencedCloudObjectKeys();

        assertThat(referencedKeys).containsExactly("1/report.txt", "1/report-v1.txt", "file/workspace/a.png");
    }

    @Test
    void findCloudOrphanObjectsReportsOnlyObjectsNotReferencedByDatabase() {
        when(fileUpDownloadRepository.findStoredObjectKeys()).thenReturn(List.of("1/report.txt"));
        when(fileVersionRepository.findStoredObjectKeys()).thenReturn(List.of("1/report-v1.txt"));
        when(workspaceAssetRepository.findAllObjectKeys()).thenReturn(List.of("file/workspace/a.png"));
        ObjectStorageConsistencyService service = serviceWithCloudObjects(
                List.of("1/report.txt", "1/orphan.tmp", "file/workspace/a.png", "unused.bin"),
                true
        );

        ObjectStorageConsistencyService.StorageObjectCleanupReport report = service.findCloudOrphanObjects(10);

        assertThat(report.scannedCount()).isEqualTo(4);
        assertThat(report.referencedCount()).isEqualTo(3);
        assertThat(report.orphanObjectKeys()).containsExactly("1/orphan.tmp", "unused.bin");
        assertThat(report.orphanCount()).isEqualTo(2);
        assertThat(report.truncated()).isTrue();
        assertThat(report.dryRun()).isTrue();
        assertThat(report.deleted()).isFalse();
        verify(fileObjectDeletionService, never()).deleteObjects(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void cleanupCloudOrphanObjectsKeepsDryRunNonDestructive() {
        when(fileUpDownloadRepository.findStoredObjectKeys()).thenReturn(List.of("1/report.txt"));
        when(fileVersionRepository.findStoredObjectKeys()).thenReturn(List.of());
        when(workspaceAssetRepository.findAllObjectKeys()).thenReturn(List.of());
        ObjectStorageConsistencyService service = serviceWithCloudObjects(List.of("1/report.txt", "1/orphan.tmp"), false);

        ObjectStorageConsistencyService.StorageObjectCleanupReport report = service.cleanupCloudOrphanObjects(10, true);

        assertThat(report.orphanObjectKeys()).containsExactly("1/orphan.tmp");
        assertThat(report.dryRun()).isTrue();
        assertThat(report.deleted()).isFalse();
        verify(fileObjectDeletionService, never()).deleteObjects(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void cleanupCloudOrphanObjectsDeletesOrphansOnlyWhenDryRunIsDisabled() {
        when(fileUpDownloadRepository.findStoredObjectKeys()).thenReturn(List.of("1/report.txt"));
        when(fileVersionRepository.findStoredObjectKeys()).thenReturn(List.of());
        when(workspaceAssetRepository.findAllObjectKeys()).thenReturn(List.of());
        ObjectStorageConsistencyService service = serviceWithCloudObjects(List.of("1/report.txt", "1/orphan.tmp"), false);

        ObjectStorageConsistencyService.StorageObjectCleanupReport report = service.cleanupCloudOrphanObjects(10, false);

        assertThat(report.orphanObjectKeys()).containsExactly("1/orphan.tmp");
        assertThat(report.dryRun()).isFalse();
        assertThat(report.deleted()).isTrue();
        verify(fileObjectDeletionService).deleteObjects(List.of("1/orphan.tmp"));
    }

    @Test
    void cleanupCloudOrphanObjectsPropagatesDeletionFailuresForRetry() {
        when(fileUpDownloadRepository.findStoredObjectKeys()).thenReturn(List.of("1/report.txt"));
        when(fileVersionRepository.findStoredObjectKeys()).thenReturn(List.of());
        when(workspaceAssetRepository.findAllObjectKeys()).thenReturn(List.of());
        doThrow(new IllegalStateException("delete failed"))
                .when(fileObjectDeletionService).deleteObjects(List.of("1/orphan.tmp"));
        ObjectStorageConsistencyService service = serviceWithCloudObjects(List.of("1/report.txt", "1/orphan.tmp"), false);

        assertThatThrownBy(() -> service.cleanupCloudOrphanObjects(10, false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("delete failed");

        verify(fileObjectDeletionService).deleteObjects(List.of("1/orphan.tmp"));
    }

    private ObjectStorageConsistencyService serviceWithCloudObjects(List<String> objectKeys, boolean truncated) {
        return new ObjectStorageConsistencyService(
                null,
                null,
                fileUpDownloadRepository,
                fileVersionRepository,
                workspaceAssetRepository,
                fileObjectDeletionService
        ) {
            @Override
            ObjectStorageConsistencyService.ListedObjectKeys listCloudObjectKeys(int maxScan) {
                return new ObjectStorageConsistencyService.ListedObjectKeys(objectKeys, truncated);
            }
        };
    }
}