package com.example.WaffleBear.file.crypto;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * Manages server-side vault KEK derivation and per-file DEK wrapping/unwrapping.
 */
@Service
public class VaultKeyManagementService {

    private static final String WRAP_AAD_PREFIX = "FINO-DEK-V";
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final byte[] kekBytes;
    private final int currentKeyVersion;

    @Autowired
    public VaultKeyManagementService(
            @Value("${app.vault.encryption.master-key:}") String vaultMasterKey,
            @Value("${project.aes.key:}") String projectAesKey,
            @Value("${app.vault.encryption.key-version:1}") int currentKeyVersion
    ) {
        if (currentKeyVersion <= 0) {
            throw new IllegalArgumentException("app.vault.encryption.key-version must be positive");
        }
        this.currentKeyVersion = currentKeyVersion;
        this.kekBytes = deriveKek(vaultMasterKey, projectAesKey);
    }

    public int getCurrentKeyVersion() {
        return currentKeyVersion;
    }

    public byte[] generateDek() {
        byte[] dek = new byte[VaultChunkCrypto.AES_KEY_BYTES];
        SECURE_RANDOM.nextBytes(dek);
        return dek;
    }

    public byte[] generateNoncePrefix() {
        byte[] noncePrefix = new byte[VaultChunkCrypto.NONCE_PREFIX_BYTES];
        SECURE_RANDOM.nextBytes(noncePrefix);
        return noncePrefix;
    }

    public String encodeBase64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public byte[] decodeBase64Url(String encoded) {
        if (encoded == null || encoded.isBlank()) {
            throw new IllegalArgumentException("Encoded vault key material is empty");
        }
        return Base64.getUrlDecoder().decode(encoded.trim());
    }

    public String wrapDek(byte[] dek) {
        if (dek == null || dek.length != VaultChunkCrypto.AES_KEY_BYTES) {
            throw new IllegalArgumentException("DEK must be 32 bytes");
        }
        try {
            byte[] iv = new byte[VaultChunkCrypto.GCM_IV_BYTES];
            SECURE_RANDOM.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(kekBytes, "AES"),
                    new GCMParameterSpec(VaultChunkCrypto.GCM_TAG_BITS, iv)
            );
            cipher.updateAAD(wrapAad(currentKeyVersion));
            byte[] wrapped = cipher.doFinal(dek);

            byte[] payload = new byte[iv.length + wrapped.length];
            System.arraycopy(iv, 0, payload, 0, iv.length);
            System.arraycopy(wrapped, 0, payload, iv.length, wrapped.length);
            return encodeBase64Url(payload);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Failed to wrap vault DEK", exception);
        }
    }

    public byte[] unwrapDek(String wrappedDek, Integer keyVersion) {
        if (wrappedDek == null || wrappedDek.isBlank() || keyVersion == null || keyVersion <= 0) {
            throw new IllegalArgumentException("Invalid wrapped vault DEK or key version");
        }
        try {
            byte[] payload = decodeBase64Url(wrappedDek);
            if (payload.length <= VaultChunkCrypto.GCM_IV_BYTES + VaultChunkCrypto.GCM_TAG_BYTES) {
                throw new IllegalArgumentException("Wrapped vault DEK payload is too short");
            }
            byte[] iv = Arrays.copyOfRange(payload, 0, VaultChunkCrypto.GCM_IV_BYTES);
            byte[] ciphertext = Arrays.copyOfRange(payload, VaultChunkCrypto.GCM_IV_BYTES, payload.length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    new SecretKeySpec(kekBytes, "AES"),
                    new GCMParameterSpec(VaultChunkCrypto.GCM_TAG_BITS, iv)
            );
            cipher.updateAAD(wrapAad(keyVersion));
            byte[] dek = cipher.doFinal(ciphertext);
            if (dek.length != VaultChunkCrypto.AES_KEY_BYTES) {
                throw new IllegalStateException("Unwrapped DEK length mismatch");
            }
            return dek;
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Failed to unwrap vault DEK", exception);
        }
    }

    private static byte[] wrapAad(int keyVersion) {
        return (WRAP_AAD_PREFIX + keyVersion).getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] deriveKek(String vaultMasterKey, String projectAesKey) {
        String trimmedVaultKey = vaultMasterKey == null ? "" : vaultMasterKey.trim();
        String trimmedProjectKey = projectAesKey == null ? "" : projectAesKey.trim();
        String domainPrefix;
        String keyMaterial;
        if (!trimmedVaultKey.isEmpty()) {
            domainPrefix = "fileinnout:vault:kek:v1:";
            keyMaterial = trimmedVaultKey;
        } else if (!trimmedProjectKey.isEmpty()) {
            domainPrefix = "fileinnout:vault:kek:fallback:v1:";
            keyMaterial = trimmedProjectKey;
        } else {
            throw new IllegalStateException(
                    "Vault encryption requires app.vault.encryption.master-key or project.aes.key"
            );
        }

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(domainPrefix.getBytes(StandardCharsets.UTF_8));
            digest.update(keyMaterial.getBytes(StandardCharsets.UTF_8));
            return digest.digest();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("SHA-256 unavailable for vault KEK derivation", exception);
        }
    }
}
