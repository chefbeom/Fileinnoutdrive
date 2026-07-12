package com.example.WaffleBear.user.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // User 테이블과 강한 결합(Foreign Key)을 피하고 식별자만 저장하여 성능 확보
    @Column(nullable = false)
    private String email;

    // The database stores a one-way SHA-256 fingerprint, never the usable JWT.
    @Column(name = "token", nullable = false, length = 64)
    private String tokenHash;

    @Column(nullable = false)
    private LocalDateTime expiryDate;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    public void updateTokenHash(String tokenHash, LocalDateTime expiryDate) {
        this.tokenHash = tokenHash;
        this.expiryDate = expiryDate;
        this.updatedAt = LocalDateTime.now();
    }
}
