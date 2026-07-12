package com.example.WaffleBear.utils;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

@Component
public class Aes256 {

    private static final int AES_256_KEY_BYTES = 32;
    private static final int GCM_NONCE_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;
    private static byte[] secretKey;

    @Value("${project.aes.key}")
    public void setSecretKey(String key) {
        byte[] keyBytes = key == null ? new byte[0] : key.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length != AES_256_KEY_BYTES) {
            throw new IllegalArgumentException("project.aes.key must be exactly 32 UTF-8 bytes for AES-256.");
        }
        secretKey = Arrays.copyOf(keyBytes, keyBytes.length);
    }

    public static String encrypt(byte[] data) {
        try {
            byte[] nonce = new byte[GCM_NONCE_BYTES];
            new SecureRandom().nextBytes(nonce);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, keySpec(), new GCMParameterSpec(GCM_TAG_BITS, nonce));
            byte[] ciphertext = cipher.doFinal(data);

            byte[] nonceAndCiphertext = new byte[nonce.length + ciphertext.length];
            System.arraycopy(nonce, 0, nonceAndCiphertext, 0, nonce.length);
            System.arraycopy(ciphertext, 0, nonceAndCiphertext, nonce.length, ciphertext.length);

            return Base64.getUrlEncoder().withoutPadding().encodeToString(nonceAndCiphertext);
        } catch (Exception exception) {
            throw new RuntimeException("Encryption error", exception);
        }
    }

    public static byte[] decrypt(byte[] encryptedData) {
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(encryptedData);
            if (decoded.length <= GCM_NONCE_BYTES) {
                throw new IllegalArgumentException("Encrypted payload is too short.");
            }

            byte[] nonce = Arrays.copyOfRange(decoded, 0, GCM_NONCE_BYTES);
            byte[] ciphertext = Arrays.copyOfRange(decoded, GCM_NONCE_BYTES, decoded.length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, keySpec(), new GCMParameterSpec(GCM_TAG_BITS, nonce));
            return cipher.doFinal(ciphertext);
        } catch (Exception exception) {
            throw new RuntimeException("Decryption error", exception);
        }
    }

    private static SecretKeySpec keySpec() {
        if (secretKey == null) {
            throw new IllegalStateException("project.aes.key is not configured.");
        }
        return new SecretKeySpec(secretKey, "AES");
    }
}
