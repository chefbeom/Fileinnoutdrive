package com.example.WaffleBear.file.secret;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

public class SecretFolderDto {

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PinReq {
        private String pin;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PinChangeReq {
        private String currentPin;
        private String newPin;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FolderConfigReq {
        private Boolean hidden;
        private Boolean pinEnabled;
        private String pin;
        private String currentPin;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class VaultStatusRes {
        private boolean pinRegistered;
        private boolean unlocked;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UnlockRes {
        private boolean unlocked;
        private boolean pinRegistered;
        private String unlockToken;
        private Long folderIdx;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FolderStatusRes {
        private Long folderIdx;
        private boolean hidden;
        private boolean pinEnabled;
        private boolean pinRegistered;
        private boolean unlocked;
        private String unlockToken;
    }
}
