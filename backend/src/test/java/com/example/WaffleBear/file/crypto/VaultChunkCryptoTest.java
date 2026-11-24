package com.example.WaffleBear.file.crypto;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.SecureRandom;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VaultChunkCryptoTest {

    private static final SecureRandom RANDOM = new SecureRandom();

    @Test
    void roundTripsEmptySmallExactChunkAndMultiChunkPayloads() throws Exception {
        byte[] dek = randomBytes(VaultChunkCrypto.AES_KEY_BYTES);
        byte[] noncePrefix = randomBytes(VaultChunkCrypto.NONCE_PREFIX_BYTES);

        int customChunkSize = 1024;
        int[] sizes = {0, 13, customChunkSize, customChunkSize * 3 + 512};
        for (int size : sizes) {
            byte[] plaintext = randomBytes(size);
            byte[] ciphertext = encryptAll(plaintext, dek, noncePrefix, customChunkSize, VaultChunkCrypto.STREAM_KIND_FILE);

            assertThat(ciphertext.length)
                    .isEqualTo(VaultChunkCrypto.encryptedSize(size, customChunkSize));

            byte[] decrypted = decryptAll(ciphertext, size, dek, noncePrefix, customChunkSize, VaultChunkCrypto.STREAM_KIND_FILE);
            assertThat(decrypted).isEqualTo(plaintext);
        }

        // Default 1 MiB chunk size multi-chunk verification
        int bigSize = VaultChunkCrypto.DEFAULT_CHUNK_SIZE * 2 + 123;
        byte[] bigPlaintext = randomBytes(bigSize);
        byte[] bigCiphertext = encryptAll(
                bigPlaintext,
                dek,
                noncePrefix,
                VaultChunkCrypto.DEFAULT_CHUNK_SIZE,
                VaultChunkCrypto.STREAM_KIND_FILE
        );
        byte[] bigDecrypted = decryptAll(
                bigCiphertext,
                bigSize,
                dek,
                noncePrefix,
                VaultChunkCrypto.DEFAULT_CHUNK_SIZE,
                VaultChunkCrypto.STREAM_KIND_FILE
        );
        assertThat(bigDecrypted).isEqualTo(bigPlaintext);
    }

    @Test
    void decryptsArbitrarySingleCrossChunkAndTailRanges() throws Exception {
        byte[] dek = randomBytes(VaultChunkCrypto.AES_KEY_BYTES);
        byte[] noncePrefix = randomBytes(VaultChunkCrypto.NONCE_PREFIX_BYTES);
        int chunkSize = 1024;
        int plainSize = chunkSize * 3 + 512; // 3584 bytes across 4 chunks
        byte[] plaintext = randomBytes(plainSize);
        byte[] ciphertext = encryptAll(plaintext, dek, noncePrefix, chunkSize, VaultChunkCrypto.STREAM_KIND_FILE);

        long[][] ranges = {
                {0L, 0L},                         // first byte
                {1023L, 1023L},                   // last byte of chunk 0
                {1024L, 1024L},                   // first byte of chunk 1
                {200L, 700L},                     // within single chunk
                {500L, 2500L},                    // spanning chunks 0..2
                {2800L, plainSize - 1L},          // spanning into final partial chunk
                {plainSize - 1L, plainSize - 1L}  // final single byte
        };

        for (long[] range : ranges) {
            long start = range[0];
            long end = range[1];
            VaultChunkCrypto.EncryptedByteSlice slice = VaultChunkCrypto.computeEncryptedRange(
                    plainSize,
                    chunkSize,
                    start,
                    end
            );
            byte[] encryptedSlice = Arrays.copyOfRange(
                    ciphertext,
                    (int) slice.encStart(),
                    (int) (slice.encStart() + slice.encLength())
            );
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (ByteArrayInputStream sliceIn = new ByteArrayInputStream(encryptedSlice)) {
                VaultChunkCrypto.decryptRangeStream(
                        sliceIn,
                        out,
                        dek,
                        noncePrefix,
                        chunkSize,
                        plainSize,
                        start,
                        end,
                        VaultChunkCrypto.STREAM_KIND_FILE
                );
            }

            byte[] expected = Arrays.copyOfRange(plaintext, (int) start, (int) end + 1);
            assertThat(out.toByteArray()).isEqualTo(expected);
        }

        // Single-chunk range fetch should only need ~1 chunk of ciphertext
        VaultChunkCrypto.EncryptedByteSlice singleChunkSlice = VaultChunkCrypto.computeEncryptedRange(
                plainSize,
                chunkSize,
                200L,
                700L
        );
        assertThat(singleChunkSlice.encLength()).isEqualTo(chunkSize + VaultChunkCrypto.GCM_TAG_BYTES);
    }

    @Test
    void rejectsBitFlipWrongKeyWrongNonceSwappedChunkAndTruncation() throws Exception {
        byte[] dek = randomBytes(VaultChunkCrypto.AES_KEY_BYTES);
        byte[] wrongDek = randomBytes(VaultChunkCrypto.AES_KEY_BYTES);
        byte[] noncePrefix = randomBytes(VaultChunkCrypto.NONCE_PREFIX_BYTES);
        byte[] wrongNonce = randomBytes(VaultChunkCrypto.NONCE_PREFIX_BYTES);
        int chunkSize = 1024;
        int plainSize = chunkSize * 2;
        byte[] plaintext = randomBytes(plainSize);
        byte[] ciphertext = encryptAll(plaintext, dek, noncePrefix, chunkSize, VaultChunkCrypto.STREAM_KIND_FILE);

        // 1. 1-bit tamper in ciphertext
        byte[] bitFlipped = Arrays.copyOf(ciphertext, ciphertext.length);
        bitFlipped[42] ^= 0x01;
        assertThatThrownBy(() -> decryptAll(bitFlipped, plainSize, dek, noncePrefix, chunkSize, VaultChunkCrypto.STREAM_KIND_FILE))
                .isInstanceOf(IOException.class);

        // 2. Wrong DEK
        assertThatThrownBy(() -> decryptAll(ciphertext, plainSize, wrongDek, noncePrefix, chunkSize, VaultChunkCrypto.STREAM_KIND_FILE))
                .isInstanceOf(IOException.class);

        // 3. Wrong noncePrefix
        assertThatThrownBy(() -> decryptAll(ciphertext, plainSize, dek, wrongNonce, chunkSize, VaultChunkCrypto.STREAM_KIND_FILE))
                .isInstanceOf(IOException.class);

        // 4. Swapped chunk 0 and chunk 1 (AAD chunkIndex + finalFlag protection)
        int stride = chunkSize + VaultChunkCrypto.GCM_TAG_BYTES;
        byte[] swapped = new byte[ciphertext.length];
        System.arraycopy(ciphertext, stride, swapped, 0, stride);
        System.arraycopy(ciphertext, 0, swapped, stride, stride);
        assertThatThrownBy(() -> decryptAll(swapped, plainSize, dek, noncePrefix, chunkSize, VaultChunkCrypto.STREAM_KIND_FILE))
                .isInstanceOf(IOException.class);

        // 5. Truncated stream (missing final chunk / bytes)
        byte[] truncated = Arrays.copyOf(ciphertext, ciphertext.length - 5);
        assertThatThrownBy(() -> decryptAll(truncated, plainSize, dek, noncePrefix, chunkSize, VaultChunkCrypto.STREAM_KIND_FILE))
                .isInstanceOf(IOException.class);
    }

    @Test
    void roundTripsAndAuthenticatesEncryptedThumbnails() throws Exception {
        byte[] dek = randomBytes(VaultChunkCrypto.AES_KEY_BYTES);
        byte[] wrongDek = randomBytes(VaultChunkCrypto.AES_KEY_BYTES);
        byte[] thumbPlain = randomBytes(4096);

        byte[] encryptedThumb = VaultChunkCrypto.encryptThumbnailBlob(thumbPlain, dek);
        assertThat(VaultChunkCrypto.decryptThumbnailBlob(encryptedThumb, dek)).isEqualTo(thumbPlain);

        // Wrong DEK fails
        assertThatThrownBy(() -> VaultChunkCrypto.decryptThumbnailBlob(encryptedThumb, wrongDek))
                .isInstanceOf(IOException.class);

        // 1-bit tamper fails
        byte[] tamperedThumb = Arrays.copyOf(encryptedThumb, encryptedThumb.length);
        tamperedThumb[tamperedThumb.length - 10] ^= 0x01;
        assertThatThrownBy(() -> VaultChunkCrypto.decryptThumbnailBlob(tamperedThumb, dek))
                .isInstanceOf(IOException.class);
    }

    private static byte[] encryptAll(
            byte[] plaintext,
            byte[] dek,
            byte[] noncePrefix,
            int chunkSize,
            byte streamKind
    ) throws IOException {
        try (InputStream enc = VaultChunkCrypto.openEncryptingStream(
                new ByteArrayInputStream(plaintext),
                plaintext.length,
                dek,
                noncePrefix,
                chunkSize,
                streamKind
        );
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            enc.transferTo(out);
            return out.toByteArray();
        }
    }

    private static byte[] decryptAll(
            byte[] ciphertext,
            long plainSize,
            byte[] dek,
            byte[] noncePrefix,
            int chunkSize,
            byte streamKind
    ) throws IOException {
        try (InputStream dec = VaultChunkCrypto.openDecryptingStream(
                new ByteArrayInputStream(ciphertext),
                dek,
                noncePrefix,
                chunkSize,
                plainSize,
                streamKind
        );
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            dec.transferTo(out);
            return out.toByteArray();
        }
    }

    private static byte[] randomBytes(int length) {
        byte[] bytes = new byte[length];
        RANDOM.nextBytes(bytes);
        return bytes;
    }
}
