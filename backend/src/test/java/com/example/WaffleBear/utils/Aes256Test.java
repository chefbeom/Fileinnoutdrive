package com.example.WaffleBear.utils;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class Aes256Test {

    @BeforeEach
    void setUp() {
        new Aes256().setSecretKey("aessecretkey01234567891011121314");
    }

    @Test
    void encryptsAndDecryptsPayload() {
        String encrypted = Aes256.encrypt("oauth-state".getBytes(StandardCharsets.UTF_8));

        assertThat(Aes256.decrypt(encrypted.getBytes(StandardCharsets.UTF_8)))
                .isEqualTo("oauth-state".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void rejectsTamperedCiphertext() {
        String encrypted = Aes256.encrypt("oauth-state".getBytes(StandardCharsets.UTF_8));
        byte[] payload = Base64.getUrlDecoder().decode(encrypted);
        payload[payload.length - 1] ^= 1;
        String tampered = Base64.getUrlEncoder().withoutPadding().encodeToString(payload);

        assertThatThrownBy(() -> Aes256.decrypt(tampered.getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Decryption error");
    }
}