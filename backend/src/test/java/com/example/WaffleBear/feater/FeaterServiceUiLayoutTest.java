package com.example.WaffleBear.feater;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.config.MinioPresignedUrlService;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.feater.model.Feater;
import com.example.WaffleBear.feater.model.FeaterDto;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.minio.MinioClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FeaterServiceUiLayoutTest {

    @Mock
    FeaterRepository featerRepository;

    @Mock
    UserRepository userRepository;

    @Mock
    MinioClient minioClient;

    @Mock
    MinioPresignedUrlService minioPresignedUrlService;

    @Mock
    MinioProperties minioProperties;

    @Mock
    StoragePlanService storagePlanService;

    @Spy
    ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    FeaterService featerService;

    @Test
    void returnsEmptyUiLayoutWhenUserHasNoSavedSettings() {
        when(featerRepository.findByUser_Idx(11L)).thenReturn(Optional.empty());

        FeaterDto.UiLayoutRes result = featerService.getUiLayout(11L);

        assertThat(result.layout()).isEmpty();
        assertThat(result.updatedAt()).isNull();
    }

    @Test
    void updatesAndReadsUiLayoutJsonForExistingSettings() {
        User user = User.builder()
                .idx(11L)
                .email("tester@example.com")
                .name("Tester")
                .build();
        Feater entity = Feater.builder()
                .user(user)
                .displayName("Tester")
                .localeCode("KO")
                .regionCode("KR")
                .build();

        when(userRepository.findById(11L)).thenReturn(Optional.of(user));
        when(featerRepository.findByUser_Idx(11L)).thenReturn(Optional.of(entity));
        when(featerRepository.saveAndFlush(any(Feater.class))).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> payload = Map.of(
                "version", 1,
                "headerNavPosition", "above-search-right",
                "showPersonalPages", false,
                "headerNavOrder", List.of("media", "photos")
        );

        FeaterDto.UiLayoutRes saved = featerService.updateUiLayout(11L, payload);

        assertThat(saved.layout())
                .containsEntry("headerNavPosition", "above-search-right")
                .containsEntry("showPersonalPages", false);
        assertThat(saved.updatedAt()).isNotNull();
        verify(featerRepository).saveAndFlush(entity);

        FeaterDto.UiLayoutRes reloaded = featerService.getUiLayout(11L);
        assertThat(reloaded.layout())
                .containsEntry("headerNavPosition", "above-search-right")
                .containsEntry("showPersonalPages", false);
    }

    @Test
    void handlesCorruptedUiLayoutJsonGracefully() {
        User user = User.builder().idx(11L).email("tester@example.com").build();
        Feater entity = Feater.builder().user(user).uiLayoutJson("{invalid json").build();
        when(featerRepository.findByUser_Idx(11L)).thenReturn(Optional.of(entity));

        FeaterDto.UiLayoutRes result = featerService.getUiLayout(11L);

        assertThat(result.layout()).isEmpty();
    }

    @Test
    void rejectsOversizedUiLayoutPayload() {
        User user = User.builder().idx(11L).email("tester@example.com").build();
        Feater entity = Feater.builder().user(user).build();
        when(userRepository.findById(11L)).thenReturn(Optional.of(user));
        when(featerRepository.findByUser_Idx(11L)).thenReturn(Optional.of(entity));

        String hugeValue = "x".repeat(270_000);
        Map<String, Object> payload = Map.of("blob", hugeValue);

        assertThatThrownBy(() -> featerService.updateUiLayout(11L, payload))
                .isInstanceOf(BaseException.class);
    }
}
