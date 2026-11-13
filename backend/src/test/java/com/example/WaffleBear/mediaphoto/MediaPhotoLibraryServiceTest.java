package com.example.WaffleBear.mediaphoto;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.secret.SecretAccessGuard;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MediaPhotoLibraryServiceTest {

    @Mock
    private MediaPhotoLibraryRepository mediaPhotoLibraryRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private SecretAccessGuard secretAccessGuard;

    private MediaPhotoLibraryService mediaPhotoLibraryService;

    @BeforeEach
    void setUp() {
        mediaPhotoLibraryService = new MediaPhotoLibraryService(
                mediaPhotoLibraryRepository,
                userRepository,
                new ObjectMapper(),
                secretAccessGuard
        );
    }

    @Test
    void getVaultRejectsWhenVaultIsLocked() {
        doThrow(BaseException.from(BaseResponseStatus.VAULT_UNLOCK_REQUIRED))
                .when(secretAccessGuard).requireVaultUnlocked(7L);

        assertThatThrownBy(() -> mediaPhotoLibraryService.getVault(7L))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.VAULT_UNLOCK_REQUIRED);

        verify(mediaPhotoLibraryRepository, never()).findByUser_Idx(any());
    }

    @Test
    void saveVaultRejectsWhenVaultIsLocked() {
        doThrow(BaseException.from(BaseResponseStatus.VAULT_UNLOCK_REQUIRED))
                .when(secretAccessGuard).requireVaultUnlocked(7L);

        assertThatThrownBy(() -> mediaPhotoLibraryService.saveVault(7L, Map.of("mediaSourceMode", "all")))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.VAULT_UNLOCK_REQUIRED);

        verify(mediaPhotoLibraryRepository, never()).saveAndFlush(any());
    }

    @Test
    void normalAndVaultStatesAreStoredAndReadIndependently() {
        User owner = User.builder().idx(7L).email("owner@example.com").build();
        MediaPhotoLibrary entity = MediaPhotoLibrary.create(owner, "{\"mediaSourceMode\":\"manual\"}");
        when(userRepository.findById(7L)).thenReturn(Optional.of(owner));
        when(mediaPhotoLibraryRepository.findByUser_Idx(7L)).thenReturn(Optional.of(entity));
        when(mediaPhotoLibraryRepository.saveAndFlush(entity)).thenReturn(entity);

        MediaPhotoLibraryDto.ResLibrary savedVault = mediaPhotoLibraryService.saveVault(
                7L,
                Map.of("mediaSourceMode", "all", "favoriteSeriesKeys", java.util.List.of("secret-anime"))
        );

        assertThat(savedVault.state()).containsEntry("mediaSourceMode", "all");
        verify(secretAccessGuard).requireVaultUnlocked(7L);

        MediaPhotoLibraryDto.ResLibrary normalState = mediaPhotoLibraryService.get(7L);
        MediaPhotoLibraryDto.ResLibrary vaultState = mediaPhotoLibraryService.getVault(7L);

        assertThat(normalState.state()).containsEntry("mediaSourceMode", "manual");
        assertThat(normalState.state()).doesNotContainKey("favoriteSeriesKeys");
        assertThat(vaultState.state()).containsEntry("mediaSourceMode", "all");
        assertThat(vaultState.state()).containsKey("favoriteSeriesKeys");

        mediaPhotoLibraryService.save(7L, Map.of("photoSourceMode", "manual"));

        assertThat(mediaPhotoLibraryService.getVault(7L).state())
                .containsEntry("mediaSourceMode", "all")
                .containsKey("favoriteSeriesKeys");
        assertThat(mediaPhotoLibraryService.get(7L).state())
                .containsEntry("photoSourceMode", "manual")
                .doesNotContainKey("favoriteSeriesKeys");
    }

    @Test
    void getVaultReturnsEmptyStateWhenOnlyNormalStateExists() {
        User owner = User.builder().idx(7L).build();
        MediaPhotoLibrary entity = MediaPhotoLibrary.create(owner, "{\"photoSourceMode\":\"manual\"}");
        when(mediaPhotoLibraryRepository.findByUser_Idx(7L)).thenReturn(Optional.of(entity));

        MediaPhotoLibraryDto.ResLibrary vaultState = mediaPhotoLibraryService.getVault(7L);

        assertThat(vaultState.state()).isEmpty();
        verify(secretAccessGuard).requireVaultUnlocked(7L);
    }
}
