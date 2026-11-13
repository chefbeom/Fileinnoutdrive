package com.example.WaffleBear.mediaphoto;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.file.secret.SecretAccessGuard;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import static com.example.WaffleBear.common.model.BaseResponseStatus.FAIL;
import static com.example.WaffleBear.common.model.BaseResponseStatus.USER_NOT_FOUND;

@Service
@RequiredArgsConstructor
public class MediaPhotoLibraryService {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private final MediaPhotoLibraryRepository mediaPhotoLibraryRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final SecretAccessGuard secretAccessGuard;

    @Transactional(readOnly = true)
    public MediaPhotoLibraryDto.ResLibrary get(Long userIdx) {
        return mediaPhotoLibraryRepository.findByUser_Idx(userIdx)
                .map(entity -> new MediaPhotoLibraryDto.ResLibrary(
                        readStateMap(entity.getStateJson()),
                        entity.getUpdatedAt()
                ))
                .orElseGet(MediaPhotoLibraryDto.ResLibrary::empty);
    }

    @Transactional
    public MediaPhotoLibraryDto.ResLibrary save(Long userIdx, Map<String, Object> statePayload) {
        User user = userRepository.findById(userIdx)
                .orElseThrow(() -> new BaseException(USER_NOT_FOUND));

        Map<String, Object> safePayload = statePayload == null ? Map.of() : new LinkedHashMap<>(statePayload);
        String serialized = writeStateJson(safePayload);

        MediaPhotoLibrary entity = mediaPhotoLibraryRepository.findByUser_Idx(userIdx)
                .orElseGet(() -> MediaPhotoLibrary.create(user, serialized));

        entity.updateStateJson(serialized);
        MediaPhotoLibrary saved = mediaPhotoLibraryRepository.saveAndFlush(entity);

        return new MediaPhotoLibraryDto.ResLibrary(
                safePayload,
                saved.getUpdatedAt() != null ? saved.getUpdatedAt() : LocalDateTime.now()
        );
    }

    @Transactional(readOnly = true)
    public MediaPhotoLibraryDto.ResLibrary getVault(Long userIdx) {
        secretAccessGuard.requireVaultUnlocked(userIdx);
        return mediaPhotoLibraryRepository.findByUser_Idx(userIdx)
                .map(entity -> new MediaPhotoLibraryDto.ResLibrary(
                        readStateMap(entity.getSecretStateJson()),
                        entity.getUpdatedAt()
                ))
                .orElseGet(MediaPhotoLibraryDto.ResLibrary::empty);
    }

    @Transactional
    public MediaPhotoLibraryDto.ResLibrary saveVault(Long userIdx, Map<String, Object> statePayload) {
        secretAccessGuard.requireVaultUnlocked(userIdx);
        User user = userRepository.findById(userIdx)
                .orElseThrow(() -> new BaseException(USER_NOT_FOUND));

        Map<String, Object> safePayload = statePayload == null ? Map.of() : new LinkedHashMap<>(statePayload);
        String serialized = writeStateJson(safePayload);

        MediaPhotoLibrary entity = mediaPhotoLibraryRepository.findByUser_Idx(userIdx)
                .orElseGet(() -> MediaPhotoLibrary.createVault(user, serialized));

        entity.updateSecretStateJson(serialized);
        MediaPhotoLibrary saved = mediaPhotoLibraryRepository.saveAndFlush(entity);

        return new MediaPhotoLibraryDto.ResLibrary(
                safePayload,
                saved.getUpdatedAt() != null ? saved.getUpdatedAt() : LocalDateTime.now()
        );
    }

    private Map<String, Object> readStateMap(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, Object> parsed = objectMapper.readValue(rawJson, MAP_TYPE);
            return parsed != null ? parsed : Map.of();
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private String writeStateJson(Map<String, Object> map) {
        try {
            return objectMapper.writeValueAsString(map != null ? map : Map.of());
        } catch (Exception exception) {
            throw new BaseException(FAIL);
        }
    }
}
