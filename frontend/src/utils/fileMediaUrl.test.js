import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isEncryptedVaultFile,
  normalizeApiAssetUrl,
  refreshEncryptedStreamUrl,
  resolveFilePlaybackUrl,
  resolveFileThumbnailFallbackUrl,
} from "./fileMediaUrl.js";

const mockFetchVaultStreamToken = vi.fn();

vi.mock("@/api/filesApi.js", () => ({
  fetchVaultStreamToken: (...args) => mockFetchVaultStreamToken(...args),
}));

describe("fileMediaUrl", () => {
  beforeEach(() => {
    mockFetchVaultStreamToken.mockReset();
    vi.unstubAllEnvs();
  });

  it("detects encrypted vault files from encrypted flag or encryptionMode", () => {
    expect(isEncryptedVaultFile(null)).toBe(false);
    expect(isEncryptedVaultFile({})).toBe(false);
    expect(isEncryptedVaultFile({ encrypted: false, encryptionMode: "NONE" })).toBe(false);
    expect(isEncryptedVaultFile({ encrypted: true })).toBe(true);
    expect(isEncryptedVaultFile({ encrypted: false, encryptionMode: "SERVER_ENVELOPE_V1" })).toBe(true);
    expect(isEncryptedVaultFile({ encryptionMode: "CLIENT_E2EE_V1" })).toBe(true);
  });

  it("preserves absolute/blob/data URLs and rewrites relative /api paths when VITE_API_BASE_URL is custom", async () => {
    expect(normalizeApiAssetUrl("")).toBe("");
    expect(normalizeApiAssetUrl("https://cdn.example/video.mp4")).toBe("https://cdn.example/video.mp4");
    expect(normalizeApiAssetUrl("http://192.168.35.30/api/file/secret/stream/1?st=abc"))
      .toBe("http://192.168.35.30/api/file/secret/stream/1?st=abc");
    expect(normalizeApiAssetUrl("blob:http://localhost/1234")).toBe("blob:http://localhost/1234");
    expect(normalizeApiAssetUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(normalizeApiAssetUrl("/api/file/secret/stream/7?st=tok")).toBe("/api/file/secret/stream/7?st=tok");

    vi.stubEnv("VITE_API_BASE_URL", "http://192.168.35.30:8080/api");
    vi.resetModules();
    const customModule = await import("./fileMediaUrl.js");
    expect(customModule.normalizeApiAssetUrl("/api/file/secret/stream/7?st=tok"))
      .toBe("http://192.168.35.30:8080/api/file/secret/stream/7?st=tok");
  });

  it("resolves playback URLs and blocks fallback direct thumbnail URLs on encrypted files", () => {
    const plainFile = {
      id: 1,
      encrypted: false,
      encryptionMode: "NONE",
      downloadUrl: "https://minio.local/1.mp4",
      thumbnailPresignedUrl: "https://minio.local/1.jpg",
    };
    const encryptedFile = {
      id: 2,
      encrypted: true,
      encryptionMode: "SERVER_ENVELOPE_V1",
      downloadUrl: "/api/file/secret/stream/2?st=tok2",
      thumbnailPresignedUrl: "https://should-never-be-returned",
      thumbnailUrl: "https://should-also-never-be-returned",
    };

    expect(resolveFilePlaybackUrl("https://minio.local/direct")).toBe("https://minio.local/direct");
    expect(resolveFilePlaybackUrl(plainFile)).toBe("https://minio.local/1.mp4");
    expect(resolveFilePlaybackUrl(encryptedFile)).toBe("/api/file/secret/stream/2?st=tok2");

    expect(resolveFileThumbnailFallbackUrl(plainFile)).toBe("https://minio.local/1.jpg");
    expect(resolveFileThumbnailFallbackUrl(encryptedFile)).toBe("");
    expect(resolveFileThumbnailFallbackUrl({ encryptionMode: "CLIENT_E2EE_V1", thumbnailUrl: "/x" })).toBe("");
  });

  it("refreshes stream URLs only for encrypted vault files", async () => {
    expect(await refreshEncryptedStreamUrl({ id: 1, encrypted: false })).toBe("");
    expect(mockFetchVaultStreamToken).not.toHaveBeenCalled();

    mockFetchVaultStreamToken.mockResolvedValue({
      streamUrl: "/api/file/secret/stream/42?st=fresh-token",
    });

    const refreshed = await refreshEncryptedStreamUrl({
      idx: 42,
      encrypted: true,
      encryptionMode: "SERVER_ENVELOPE_V1",
    });

    expect(mockFetchVaultStreamToken).toHaveBeenCalledWith(42);
    expect(refreshed).toBe("/api/file/secret/stream/42?st=fresh-token");
  });
});
