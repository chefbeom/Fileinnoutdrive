package com.example.WaffleBear.mediaphoto;

import com.example.WaffleBear.user.model.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Table(
        name = "media_photo_library",
        uniqueConstraints = @UniqueConstraint(name = "uk_media_photo_library_user", columnNames = "user_idx")
)
public class MediaPhotoLibrary {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "media_photo_library_idx")
    private Long idx;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_idx", nullable = false, unique = true)
    private User user;

    @Column(name = "state_json", columnDefinition = "LONGTEXT", nullable = false)
    private String stateJson;

    @Column(name = "secret_state_json", columnDefinition = "LONGTEXT")
    private String secretStateJson;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    public static MediaPhotoLibrary create(User user, String stateJson) {
        return MediaPhotoLibrary.builder()
                .user(user)
                .stateJson(stateJson == null || stateJson.isBlank() ? "{}" : stateJson)
                .build();
    }

    public static MediaPhotoLibrary createVault(User user, String secretStateJson) {
        return MediaPhotoLibrary.builder()
                .user(user)
                .stateJson("{}")
                .secretStateJson(secretStateJson == null || secretStateJson.isBlank() ? "{}" : secretStateJson)
                .build();
    }

    public void updateStateJson(String stateJson) {
        this.stateJson = (stateJson == null || stateJson.isBlank()) ? "{}" : stateJson;
    }

    public void updateSecretStateJson(String secretStateJson) {
        this.secretStateJson = (secretStateJson == null || secretStateJson.isBlank()) ? "{}" : secretStateJson;
    }

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
        if (stateJson == null || stateJson.isBlank()) {
            stateJson = "{}";
        }
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
        if (stateJson == null || stateJson.isBlank()) {
            stateJson = "{}";
        }
    }
}
