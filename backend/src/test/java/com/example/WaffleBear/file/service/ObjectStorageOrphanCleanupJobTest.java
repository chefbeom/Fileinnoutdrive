package com.example.WaffleBear.file.service;

import com.example.WaffleBear.file.service.ObjectStorageConsistencyService.StorageObjectCleanupReport;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ObjectStorageOrphanCleanupJobTest {

    @Test
    void cleanupCloudOrphansUsesConfiguredScanLimitAndDryRunMode() {
        ObjectStorageConsistencyService consistencyService = mock(ObjectStorageConsistencyService.class);
        ObjectStorageOrphanCleanupJob job = new ObjectStorageOrphanCleanupJob(consistencyService);
        ReflectionTestUtils.setField(job, "maxScan", 25);
        ReflectionTestUtils.setField(job, "dryRun", true);
        when(consistencyService.cleanupCloudOrphanObjects(25, true))
                .thenReturn(new StorageObjectCleanupReport(3, 2, List.of("orphan.tmp"), false, true, false));

        job.cleanupCloudOrphans();

        verify(consistencyService).cleanupCloudOrphanObjects(25, true);
    }

    @Test
    void cleanupCloudOrphansDoesNotPropagateRuntimeFailures() {
        ObjectStorageConsistencyService consistencyService = mock(ObjectStorageConsistencyService.class);
        ObjectStorageOrphanCleanupJob job = new ObjectStorageOrphanCleanupJob(consistencyService);
        ReflectionTestUtils.setField(job, "maxScan", 100);
        ReflectionTestUtils.setField(job, "dryRun", false);
        when(consistencyService.cleanupCloudOrphanObjects(100, false))
                .thenThrow(new IllegalStateException("scan failed"));

        assertThatCode(job::cleanupCloudOrphans).doesNotThrowAnyException();

        verify(consistencyService).cleanupCloudOrphanObjects(100, false);
    }
}