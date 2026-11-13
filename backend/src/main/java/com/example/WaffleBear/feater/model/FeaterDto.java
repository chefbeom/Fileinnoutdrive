package com.example.WaffleBear.feater.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.Map;

public class FeaterDto {

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SettingsUpdateReq {
        private String displayName;
        private String localeCode;
        private String regionCode;
        private Boolean marketingOptIn;
        private Boolean privateProfile;
        private Boolean emailNotification;
        private Boolean securityNotification;
        private String profileImageUrl;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SettingsRes {
        private Long userIdx;
        private String email;
        private String displayName;
        private String role;
        private Boolean emailVerified;
        private String localeCode;
        private String regionCode;
        private Boolean marketingOptIn;
        private Boolean privateProfile;
        private Boolean emailNotification;
        private Boolean securityNotification;
        private String profileImageUrl;
        private String membershipCode;
        private String membershipLabel;
        private String storagePlanLabel;
        private Long storageQuotaBytes;
        private Long storageBaseQuotaBytes;
        private Long storageAddonBytes;
        private LocalDateTime joinedAt;
        private LocalDateTime updatedAt;
        private Boolean socialAccount;
        private String socialProvider;
        private Boolean withdrawAllowed;
        private String withdrawBlockedReason;
    }

    public record UiLayoutReq(
            Map<String, Object> layout
    ) {
    }

    public record UiLayoutRes(
            Map<String, Object> layout,
            LocalDateTime updatedAt
    ) {
        public static UiLayoutRes empty() {
            return new UiLayoutRes(Map.of(), null);
        }
    }
}
