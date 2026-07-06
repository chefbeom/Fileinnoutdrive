package com.example.WaffleBear.file.share.model;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileShareAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idx;

    private Long shareIdx;
    private Long fileIdx;
    private String fileName;

    private Long ownerIdx;
    private String ownerEmail;
    private String ownerName;

    private Long recipientIdx;
    private String recipientEmail;
    private String recipientName;

    private Long actorIdx;
    private String actorEmail;
    private String actorName;

    @Enumerated(EnumType.STRING)
    private FileShareAuditAction action;

    private String permission;
    private String status;
    private LocalDateTime expiresAt;
    private Integer downloadLimit;
    private Integer downloadCount;
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
