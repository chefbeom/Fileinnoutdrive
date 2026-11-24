package com.example.WaffleBear.file.crypto;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VaultKeyManagementServiceTest {

    @Test
    void wrapsAndUnwrapsDekUsingDedicatedMasterKey() {
        VaultKeyManagementService service = new VaultKeyManagementService(
                "dedicated-vault-master-key-material",
                "ignored-fallback-key",
                1
        );

        byte[] dek = service.generateDek();
        String wrapped1 = service.wrapDek(dek);
        String wrapped2 = service.wrapDek(dek);

        assertThat(wrapped1).isNotEqualTo(wrapped2);
        assertThat(service.unwrapDek(wrapped1, 1)).isEqualTo(dek);
        assertThat(service.unwrapDek(wrapped2, 1)).isEqualTo(dek);
    }

    @Test
    void fallsBackToProjectAesKeyWhenDedicatedMasterKeyIsBlank() {
        VaultKeyManagementService fallbackService = new VaultKeyManagementService(
                "   ",
                "project-aes-fallback-secret",
                1
        );

        byte[] dek = fallbackService.generateDek();
        String wrapped = fallbackService.wrapDek(dek);

        assertThat(fallbackService.unwrapDek(wrapped, 1)).isEqualTo(dek);
    }

    @Test
    void separatesMasterKeyAndFallbackKeyDomains() {
        VaultKeyManagementService primary = new VaultKeyManagementService("same-secret", "", 1);
        VaultKeyManagementService fallback = new VaultKeyManagementService("", "same-secret", 1);

        byte[] dek = primary.generateDek();
        String wrapped = primary.wrapDek(dek);

        assertThatThrownBy(() -> fallback.unwrapDek(wrapped, 1))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsWrongKeyVersionOrTamperedWrappedDek() {
        VaultKeyManagementService service = new VaultKeyManagementService("master-key-secret", "", 1);
        byte[] dek = service.generateDek();
        String wrapped = service.wrapDek(dek);

        assertThatThrownBy(() -> service.unwrapDek(wrapped, 2))
                .isInstanceOf(IllegalStateException.class);

        byte[] raw = Base64.getUrlDecoder().decode(wrapped);
        raw[raw.length - 1] ^= 0x01;
        String tampered = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        assertThatThrownBy(() -> service.unwrapDek(tampered, 1))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void requiresNonBlankKeyMaterial() {
        assertThatThrownBy(() -> new VaultKeyManagementService("", "   ", 1))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("app.vault.encryption.master-key");
    }

    @Test
    void encodesAndDecodesBase64UrlCleanly() {
        VaultKeyManagementService service = new VaultKeyManagementService("master-key-secret", "", 1);
        byte[] raw = "vault-nonce".getBytes(StandardCharsets.UTF_8);

        String encoded = service.encodeBase64Url(raw);
        assertThat(service.decodeBase64Url(encoded)).isEqualTo(raw);
    }
}
