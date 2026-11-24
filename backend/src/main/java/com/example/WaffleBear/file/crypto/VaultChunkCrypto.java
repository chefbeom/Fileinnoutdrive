package com.example.WaffleBear.file.crypto;

import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;

/**
 * Stateless AES-256-GCM chunked stream encryption helper.
 *
 * <p>Binary layout is intentionally simple and self-aligned so that a Phase 2
 * browser Web Crypto Service Worker can decrypt identical objects directly.
 */
public final class VaultChunkCrypto {

    public static final int DEFAULT_CHUNK_SIZE = 1024 * 1024;
    public static final int AES_KEY_BYTES = 32;
    public static final int NONCE_PREFIX_BYTES = 8;
    public static final int GCM_IV_BYTES = 12;
    public static final int GCM_TAG_BYTES = 16;
    public static final int GCM_TAG_BITS = 128;
    public static final byte STREAM_KIND_FILE = 0x01;
    public static final byte STREAM_KIND_THUMBNAIL = 0x02;

    private static final byte[] MAGIC_BYTES = "FINOV1".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] THUMB_HEADER_MAGIC = "FINTV1".getBytes(StandardCharsets.US_ASCII);
    private static final int THUMB_HEADER_BYTES = THUMB_HEADER_MAGIC.length + NONCE_PREFIX_BYTES + 4 + 8;
    private static final int MAX_THUMB_PLAIN_BYTES = 32 * 1024 * 1024;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private VaultChunkCrypto() {
    }

    public record EncryptedByteSlice(
            int firstChunk,
            int lastChunk,
            long encStart,
            long encLength,
            int firstChunkSkipBytes,
            int lastChunkMaxBytes
    ) {
    }

    public static int chunkCount(long plaintextSize, int chunkSize) {
        validatePlaintextSizeAndChunkSize(plaintextSize, chunkSize);
        if (plaintextSize == 0L) {
            return 1;
        }
        long count = (plaintextSize + chunkSize - 1L) / chunkSize;
        if (count > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("Chunk count exceeds integer range: " + count);
        }
        return (int) count;
    }

    public static long encryptedSize(long plaintextSize, int chunkSize) {
        int chunks = chunkCount(plaintextSize, chunkSize);
        return plaintextSize + (long) chunks * GCM_TAG_BYTES;
    }

    public static EncryptedByteSlice computeEncryptedRange(
            long plaintextSize,
            int chunkSize,
            long plainStart,
            long plainEnd
    ) {
        validatePlaintextSizeAndChunkSize(plaintextSize, chunkSize);
        if (plaintextSize == 0L) {
            throw new IllegalArgumentException("Cannot compute byte range for empty object");
        }
        if (plainStart < 0L || plainEnd < plainStart || plainEnd >= plaintextSize) {
            throw new IllegalArgumentException(
                    "Invalid plaintext byte range [" + plainStart + ", " + plainEnd + "] for size " + plaintextSize
            );
        }

        int firstChunk = (int) (plainStart / chunkSize);
        int lastChunk = (int) (plainEnd / chunkSize);
        long cipherChunkStride = (long) chunkSize + GCM_TAG_BYTES;
        long encStart = (long) firstChunk * cipherChunkStride;

        long lastChunkPlainStart = (long) lastChunk * chunkSize;
        int lastChunkPlainLen = (int) Math.min(chunkSize, plaintextSize - lastChunkPlainStart);
        long lastChunkEncEnd = (long) lastChunk * cipherChunkStride + lastChunkPlainLen + GCM_TAG_BYTES;
        long encLength = lastChunkEncEnd - encStart;

        int firstChunkSkipBytes = (int) (plainStart - (long) firstChunk * chunkSize);
        int lastChunkMaxBytes = (int) (plainEnd - lastChunkPlainStart + 1L);

        return new EncryptedByteSlice(
                firstChunk,
                lastChunk,
                encStart,
                encLength,
                firstChunkSkipBytes,
                lastChunkMaxBytes
        );
    }

    public static byte[] buildChunkIv(byte[] noncePrefix, int chunkIndex) {
        if (noncePrefix == null || noncePrefix.length != NONCE_PREFIX_BYTES) {
            throw new IllegalArgumentException("noncePrefix must be 8 bytes");
        }
        if (chunkIndex < 0) {
            throw new IllegalArgumentException("chunkIndex must be non-negative");
        }
        ByteBuffer buffer = ByteBuffer.allocate(GCM_IV_BYTES);
        buffer.put(noncePrefix);
        buffer.putInt(chunkIndex);
        return buffer.array();
    }

    public static byte[] buildChunkAad(byte streamKind, int chunkIndex, boolean finalChunk, int chunkSize) {
        ByteBuffer buffer = ByteBuffer.allocate(MAGIC_BYTES.length + 1 + 4 + 1 + 4 + 1);
        buffer.put(MAGIC_BYTES);
        buffer.put(streamKind);
        buffer.putInt(chunkIndex);
        buffer.put(finalChunk ? (byte) 0x01 : (byte) 0x00);
        buffer.putInt(chunkSize);
        buffer.put((byte) 0x01);
        return buffer.array();
    }

    public static InputStream openEncryptingStream(
            InputStream plainIn,
            long plaintextSize,
            byte[] dek,
            byte[] noncePrefix,
            int chunkSize,
            byte streamKind
    ) {
        validateKeyAndNonce(dek, noncePrefix);
        validatePlaintextSizeAndChunkSize(plaintextSize, chunkSize);
        return new EncryptingChunkInputStream(plainIn, plaintextSize, dek, noncePrefix, chunkSize, streamKind);
    }

    public static InputStream openDecryptingStream(
            InputStream cipherIn,
            byte[] dek,
            byte[] noncePrefix,
            int chunkSize,
            long plaintextSize,
            byte streamKind
    ) {
        validateKeyAndNonce(dek, noncePrefix);
        validatePlaintextSizeAndChunkSize(plaintextSize, chunkSize);
        return new DecryptingChunkInputStream(cipherIn, dek, noncePrefix, chunkSize, plaintextSize, streamKind);
    }

    public static void decryptRangeStream(
            InputStream cipherSliceIn,
            OutputStream plainOut,
            byte[] dek,
            byte[] noncePrefix,
            int chunkSize,
            long plaintextSize,
            long plainStart,
            long plainEnd,
            byte streamKind
    ) throws IOException {
        validateKeyAndNonce(dek, noncePrefix);
        EncryptedByteSlice slice = computeEncryptedRange(plaintextSize, chunkSize, plainStart, plainEnd);
        int totalChunks = chunkCount(plaintextSize, chunkSize);
        SecretKeySpec keySpec = new SecretKeySpec(dek, "AES");

        for (int chunkIndex = slice.firstChunk(); chunkIndex <= slice.lastChunk(); chunkIndex++) {
            long chunkPlainStart = (long) chunkIndex * chunkSize;
            int expectedPlainLen = (int) Math.min(chunkSize, plaintextSize - chunkPlainStart);
            int expectedCipherLen = expectedPlainLen + GCM_TAG_BYTES;
            byte[] cipherChunk = readExactly(cipherSliceIn, expectedCipherLen);
            if (cipherChunk.length != expectedCipherLen) {
                throw new IOException("Truncated encrypted vault chunk at index " + chunkIndex);
            }

            boolean isFinal = (chunkIndex == totalChunks - 1);
            byte[] plainChunk = decryptSingleChunk(
                    keySpec,
                    noncePrefix,
                    chunkIndex,
                    isFinal,
                    chunkSize,
                    streamKind,
                    cipherChunk
            );
            if (plainChunk.length != expectedPlainLen) {
                throw new IOException("Decrypted vault chunk size mismatch at index " + chunkIndex);
            }

            int copyStart = (chunkIndex == slice.firstChunk()) ? slice.firstChunkSkipBytes() : 0;
            int copyEnd = (chunkIndex == slice.lastChunk()) ? slice.lastChunkMaxBytes() : plainChunk.length;
            if (copyEnd > copyStart) {
                plainOut.write(plainChunk, copyStart, copyEnd - copyStart);
            }
        }
    }

    public static byte[] encryptThumbnailBlob(byte[] plainThumb, byte[] dek) throws IOException {
        if (plainThumb == null) {
            throw new IllegalArgumentException("Thumbnail bytes must not be null");
        }
        if (plainThumb.length > MAX_THUMB_PLAIN_BYTES) {
            throw new IllegalArgumentException("Thumbnail exceeds max allowed size");
        }
        validateKey(dek);

        byte[] noncePrefix = new byte[NONCE_PREFIX_BYTES];
        SECURE_RANDOM.nextBytes(noncePrefix);

        ByteArrayOutputStream out = new ByteArrayOutputStream(
                THUMB_HEADER_BYTES + (int) encryptedSize(plainThumb.length, DEFAULT_CHUNK_SIZE)
        );
        ByteBuffer header = ByteBuffer.allocate(THUMB_HEADER_BYTES);
        header.put(THUMB_HEADER_MAGIC);
        header.put(noncePrefix);
        header.putInt(DEFAULT_CHUNK_SIZE);
        header.putLong(plainThumb.length);
        out.write(header.array());

        try (InputStream encStream = openEncryptingStream(
                new ByteArrayInputStream(plainThumb),
                plainThumb.length,
                dek,
                noncePrefix,
                DEFAULT_CHUNK_SIZE,
                STREAM_KIND_THUMBNAIL
        )) {
            encStream.transferTo(out);
        }
        return out.toByteArray();
    }

    public static byte[] decryptThumbnailBlob(byte[] encryptedBlob, byte[] dek) throws IOException {
        validateKey(dek);
        if (encryptedBlob == null || encryptedBlob.length < THUMB_HEADER_BYTES + GCM_TAG_BYTES) {
            throw new IOException("Encrypted thumbnail payload is too short");
        }

        ByteBuffer header = ByteBuffer.wrap(encryptedBlob, 0, THUMB_HEADER_BYTES);
        byte[] magic = new byte[THUMB_HEADER_MAGIC.length];
        header.get(magic);
        if (!Arrays.equals(magic, THUMB_HEADER_MAGIC)) {
            throw new IOException("Invalid encrypted thumbnail magic header");
        }

        byte[] noncePrefix = new byte[NONCE_PREFIX_BYTES];
        header.get(noncePrefix);
        int chunkSize = header.getInt();
        long plainSize = header.getLong();
        if (chunkSize <= 0 || chunkSize > 16 * 1024 * 1024) {
            throw new IOException("Invalid thumbnail chunk size: " + chunkSize);
        }
        if (plainSize < 0 || plainSize > MAX_THUMB_PLAIN_BYTES) {
            throw new IOException("Invalid thumbnail plaintext size: " + plainSize);
        }

        long expectedCipherBytes = encryptedSize(plainSize, chunkSize);
        int actualCipherBytes = encryptedBlob.length - THUMB_HEADER_BYTES;
        if (actualCipherBytes != expectedCipherBytes) {
            throw new IOException("Encrypted thumbnail length mismatch");
        }

        try (InputStream plainIn = openDecryptingStream(
                new ByteArrayInputStream(encryptedBlob, THUMB_HEADER_BYTES, actualCipherBytes),
                dek,
                noncePrefix,
                chunkSize,
                plainSize,
                STREAM_KIND_THUMBNAIL
        );
             ByteArrayOutputStream plainOut = new ByteArrayOutputStream((int) plainSize)) {
            plainIn.transferTo(plainOut);
            return plainOut.toByteArray();
        }
    }

    private static byte[] encryptSingleChunk(
            SecretKeySpec keySpec,
            byte[] noncePrefix,
            int chunkIndex,
            boolean finalChunk,
            int chunkSize,
            byte streamKind,
            byte[] plainBytes,
            int plainLength
    ) throws IOException {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            byte[] iv = buildChunkIv(noncePrefix, chunkIndex);
            byte[] aad = buildChunkAad(streamKind, chunkIndex, finalChunk, chunkSize);
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(GCM_TAG_BITS, iv));
            cipher.updateAAD(aad);
            return cipher.doFinal(plainBytes, 0, plainLength);
        } catch (GeneralSecurityException exception) {
            throw new IOException("Failed to encrypt vault chunk " + chunkIndex, exception);
        }
    }

    private static byte[] decryptSingleChunk(
            SecretKeySpec keySpec,
            byte[] noncePrefix,
            int chunkIndex,
            boolean finalChunk,
            int chunkSize,
            byte streamKind,
            byte[] cipherBytes
    ) throws IOException {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            byte[] iv = buildChunkIv(noncePrefix, chunkIndex);
            byte[] aad = buildChunkAad(streamKind, chunkIndex, finalChunk, chunkSize);
            cipher.init(Cipher.DECRYPT_MODE, keySpec, new GCMParameterSpec(GCM_TAG_BITS, iv));
            cipher.updateAAD(aad);
            return cipher.doFinal(cipherBytes);
        } catch (AEADBadTagException exception) {
            throw new IOException("Vault ciphertext authentication failed at chunk " + chunkIndex, exception);
        } catch (GeneralSecurityException exception) {
            throw new IOException("Failed to decrypt vault chunk " + chunkIndex, exception);
        }
    }

    private static byte[] readExactly(InputStream in, int length) throws IOException {
        byte[] buffer = new byte[length];
        int offset = 0;
        while (offset < length) {
            int read = in.read(buffer, offset, length - offset);
            if (read == -1) {
                break;
            }
            offset += read;
        }
        return offset == length ? buffer : Arrays.copyOf(buffer, offset);
    }

    private static void validatePlaintextSizeAndChunkSize(long plaintextSize, int chunkSize) {
        if (plaintextSize < 0L) {
            throw new IllegalArgumentException("plaintextSize must be non-negative");
        }
        if (chunkSize <= 0) {
            throw new IllegalArgumentException("chunkSize must be positive");
        }
    }

    private static void validateKey(byte[] dek) {
        if (dek == null || dek.length != AES_KEY_BYTES) {
            throw new IllegalArgumentException("DEK must be 32 bytes");
        }
    }

    private static void validateKeyAndNonce(byte[] dek, byte[] noncePrefix) {
        validateKey(dek);
        if (noncePrefix == null || noncePrefix.length != NONCE_PREFIX_BYTES) {
            throw new IllegalArgumentException("noncePrefix must be 8 bytes");
        }
    }

    private static final class EncryptingChunkInputStream extends FilterInputStream {
        private final long plaintextSize;
        private final SecretKeySpec keySpec;
        private final byte[] noncePrefix;
        private final int chunkSize;
        private final int totalChunks;
        private final byte streamKind;
        private final byte[] readBuffer;
        private int chunkIndex = 0;
        private long totalPlainRead = 0L;
        private byte[] currentCipherChunk = new byte[0];
        private int currentCipherPos = 0;
        private boolean finished = false;

        private EncryptingChunkInputStream(
                InputStream in,
                long plaintextSize,
                byte[] dek,
                byte[] noncePrefix,
                int chunkSize,
                byte streamKind
        ) {
            super(in);
            this.plaintextSize = plaintextSize;
            this.keySpec = new SecretKeySpec(dek, "AES");
            this.noncePrefix = Arrays.copyOf(noncePrefix, noncePrefix.length);
            this.chunkSize = chunkSize;
            this.totalChunks = chunkCount(plaintextSize, chunkSize);
            this.streamKind = streamKind;
            this.readBuffer = new byte[chunkSize];
        }

        @Override
        public int read() throws IOException {
            byte[] single = new byte[1];
            int n = read(single, 0, 1);
            return n == -1 ? -1 : (single[0] & 0xFF);
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (len == 0) {
                return 0;
            }
            if (!ensureChunkAvailable()) {
                return -1;
            }
            int available = currentCipherChunk.length - currentCipherPos;
            int toCopy = Math.min(len, available);
            System.arraycopy(currentCipherChunk, currentCipherPos, b, off, toCopy);
            currentCipherPos += toCopy;
            return toCopy;
        }

        private boolean ensureChunkAvailable() throws IOException {
            while (currentCipherPos >= currentCipherChunk.length) {
                if (finished || chunkIndex >= totalChunks) {
                    finished = true;
                    return false;
                }
                if (plaintextSize == 0L) {
                    if (in.read() != -1) {
                        throw new IOException("Plaintext stream longer than declared empty size");
                    }
                    currentCipherChunk = encryptSingleChunk(
                            keySpec, noncePrefix, 0, true, chunkSize, streamKind, readBuffer, 0
                    );
                    currentCipherPos = 0;
                    chunkIndex = 1;
                    finished = true;
                    return true;
                }

                int expectedPlainLen = (int) Math.min(chunkSize, plaintextSize - totalPlainRead);
                int readOffset = 0;
                while (readOffset < expectedPlainLen) {
                    int n = in.read(readBuffer, readOffset, expectedPlainLen - readOffset);
                    if (n == -1) {
                        throw new IOException("Unexpected EOF while reading plaintext for vault encryption");
                    }
                    readOffset += n;
                }
                totalPlainRead += readOffset;
                boolean isFinal = (chunkIndex == totalChunks - 1);
                if (isFinal && in.read() != -1) {
                    throw new IOException("Plaintext stream longer than declared size " + plaintextSize);
                }

                currentCipherChunk = encryptSingleChunk(
                        keySpec, noncePrefix, chunkIndex, isFinal, chunkSize, streamKind, readBuffer, readOffset
                );
                currentCipherPos = 0;
                chunkIndex++;
                if (isFinal) {
                    finished = true;
                }
                return true;
            }
            return true;
        }
    }

    private static final class DecryptingChunkInputStream extends FilterInputStream {
        private final SecretKeySpec keySpec;
        private final byte[] noncePrefix;
        private final int chunkSize;
        private final long plaintextSize;
        private final int totalChunks;
        private final byte streamKind;
        private int chunkIndex = 0;
        private long totalPlainEmitted = 0L;
        private byte[] currentPlainChunk = new byte[0];
        private int currentPlainPos = 0;
        private boolean finished = false;

        private DecryptingChunkInputStream(
                InputStream in,
                byte[] dek,
                byte[] noncePrefix,
                int chunkSize,
                long plaintextSize,
                byte streamKind
        ) {
            super(in);
            this.keySpec = new SecretKeySpec(dek, "AES");
            this.noncePrefix = Arrays.copyOf(noncePrefix, noncePrefix.length);
            this.chunkSize = chunkSize;
            this.plaintextSize = plaintextSize;
            this.totalChunks = chunkCount(plaintextSize, chunkSize);
            this.streamKind = streamKind;
        }

        @Override
        public int read() throws IOException {
            byte[] single = new byte[1];
            int n = read(single, 0, 1);
            return n == -1 ? -1 : (single[0] & 0xFF);
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (len == 0) {
                return 0;
            }
            if (!ensurePlainChunkAvailable()) {
                return -1;
            }
            int available = currentPlainChunk.length - currentPlainPos;
            int toCopy = Math.min(len, available);
            System.arraycopy(currentPlainChunk, currentPlainPos, b, off, toCopy);
            currentPlainPos += toCopy;
            return toCopy;
        }

        private boolean ensurePlainChunkAvailable() throws IOException {
            while (currentPlainPos >= currentPlainChunk.length) {
                if (finished || chunkIndex >= totalChunks) {
                    finished = true;
                    return false;
                }

                int expectedPlainLen = (int) Math.min(chunkSize, plaintextSize - totalPlainEmitted);
                int expectedCipherLen = expectedPlainLen + GCM_TAG_BYTES;
                byte[] cipherChunk = readExactly(in, expectedCipherLen);
                if (cipherChunk.length != expectedCipherLen) {
                    throw new IOException("Truncated encrypted vault stream at chunk " + chunkIndex);
                }

                boolean isFinal = (chunkIndex == totalChunks - 1);
                byte[] plainChunk = decryptSingleChunk(
                        keySpec, noncePrefix, chunkIndex, isFinal, chunkSize, streamKind, cipherChunk
                );
                if (plainChunk.length != expectedPlainLen) {
                    throw new IOException("Decrypted vault chunk size mismatch at chunk " + chunkIndex);
                }
                if (isFinal && in.read() != -1) {
                    throw new IOException("Unexpected trailing ciphertext after final vault chunk");
                }

                totalPlainEmitted += plainChunk.length;
                chunkIndex++;
                if (isFinal) {
                    finished = true;
                }
                currentPlainChunk = plainChunk;
                currentPlainPos = 0;
                if (plainChunk.length > 0) {
                    return true;
                }
            }
            return true;
        }
    }
}
