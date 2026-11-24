import { API_BASE_URL } from "@/utils/backendUrl.js";

const ABSOLUTE_OR_LOCAL_URL_PREFIX_RE = /^(?:https?:\/\/|blob:|data:)/i;

/**
 * Checks whether a normalized file record is encrypted at rest (Phase 1 server
 * envelope encryption or Phase 2 client E2EE).
 */
export function isEncryptedVaultFile(file) {
  if (!file || typeof file !== "object") {
    return false;
  }
  const mode = String(file.encryptionMode || "").trim().toUpperCase();
  return Boolean(file.encrypted) || (mode !== "" && mode !== "NONE");
}

/**
 * Normalizes backend-supplied asset or stream URLs so relative `/api/...` paths
 * work identically across Vite dev proxy, internal LAN HTTP, and custom
 * `VITE_API_BASE_URL` deployments.
 */
export function normalizeApiAssetUrl(rawUrl) {
  const value = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!value) {
    return "";
  }
  if (ABSOLUTE_OR_LOCAL_URL_PREFIX_RE.test(value)) {
    return value;
  }
  const baseUrl = String(API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (value.startsWith("/api/") && baseUrl && baseUrl !== "/api") {
    return `${baseUrl}${value.slice(4)}`;
  }
  if (value === "/api" && baseUrl && baseUrl !== "/api") {
    return baseUrl;
  }
  return value;
}

/**
 * Resolves the playable/downloadable URL for a file record.
 * Phase 1 returns presigned MinIO URLs for normal files and signed HTTP Range
 * `/api/file/secret/stream/{id}?st=...` URLs for encrypted vault files.
 * Phase 2 E2EE can swap this adapter without touching viewer components.
 */
export function resolveFilePlaybackUrl(file) {
  if (typeof file === "string") {
    return normalizeApiAssetUrl(file);
  }
  if (!file || typeof file !== "object") {
    return "";
  }
  return normalizeApiAssetUrl(file.downloadUrl || file.presignedDownloadUrl || "");
}

/**
 * Resolves a direct thumbnail URL only for unencrypted files.
 * Encrypted vault files return `""` so callers load decrypted `.vthumb`
 * thumbnails through authenticated `loadFileThumbnailUrl(file)` instead of
 * falling back to full-resolution media URLs.
 */
export function resolveFileThumbnailFallbackUrl(file) {
  if (!file || typeof file !== "object" || isEncryptedVaultFile(file)) {
    return "";
  }
  return normalizeApiAssetUrl(file.thumbnailPresignedUrl || file.thumbnailUrl || "");
}

/**
 * Requests a fresh signed stream URL for an encrypted vault file when the
 * active stream token expires or the vault epoch changes.
 */
export async function refreshEncryptedStreamUrl(file) {
  const fileId = file?.idx ?? file?.id ?? null;
  if (fileId == null || !isEncryptedVaultFile(file)) {
    return "";
  }
  const { fetchVaultStreamToken } = await import("@/api/filesApi.js");
  const payload = await fetchVaultStreamToken(fileId);
  return normalizeApiAssetUrl(payload?.streamUrl || "");
}
