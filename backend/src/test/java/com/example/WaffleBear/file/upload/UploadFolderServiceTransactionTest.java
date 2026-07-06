package com.example.WaffleBear.file.upload;

import com.example.WaffleBear.file.upload.dto.UploadDto;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class UploadFolderServiceTransactionTest {

    @Test
    void committedFolderCreationUsesIndependentTransaction() throws NoSuchMethodException {
        Transactional transactional = UploadFolderService.class
                .getMethod("findOrCreateCommittedFolder", Long.class, Long.class, String.class)
                .getAnnotation(Transactional.class);

        assertThat(transactional).isNotNull();
        assertThat(transactional.value()).isEqualTo(Transactional.TxType.REQUIRES_NEW);
    }

    @Test
    void completedUploadJoinsCallerTransaction() throws NoSuchMethodException {
        Transactional transactional = UploadFolderService.class
                .getMethod(
                        "saveCompletedUpload",
                        Long.class,
                        UploadDto.CompleteReq.class,
                        String.class,
                        String.class,
                        long.class,
                        String.class
                )
                .getAnnotation(Transactional.class);

        assertThat(transactional).isNotNull();
        assertThat(transactional.value()).isEqualTo(Transactional.TxType.REQUIRED);
    }
}