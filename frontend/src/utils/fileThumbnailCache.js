import {
  fetchFileThumbnailBlob,
  fetchSharedFileThumbnailBlob,
} from "@/api/filesApi.js";

const MAX_CACHE_SIZE = 400;
const MAX_CONCURRENT_THUMBNAIL_REQUESTS = 4;
const MISS_RETRY_COOLDOWN_MS = 15_000;
const thumbnailUrlCache = new Map();
const thumbnailRequestCache = new Map();
const thumbnailMissCache = new Map();
let activeThumbnailRequests = 0;
const pendingThumbnailQueue = [];

const acquireThumbnailSlot = (signal) => {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  if (activeThumbnailRequests < MAX_CONCURRENT_THUMBNAIL_REQUESTS) {
    activeThumbnailRequests += 1;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const entry = {
      resolve: () => {
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
        resolve();
      },
      reject,
    };

    const onAbort = () => {
      const idx = pendingThumbnailQueue.indexOf(entry);
      if (idx >= 0) {
        pendingThumbnailQueue.splice(idx, 1);
      }
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    pendingThumbnailQueue.push(entry);
  });
};

const releaseThumbnailSlot = () => {
  while (pendingThumbnailQueue.length > 0) {
    const next = pendingThumbnailQueue.shift();
    if (next) {
      next.resolve();
      return;
    }
  }
  activeThumbnailRequests = Math.max(0, activeThumbnailRequests - 1);
};

const isAbortError = (error) => (
  error?.name === "AbortError" ||
  error?.name === "CanceledError" ||
  error?.code === "ERR_CANCELED"
);

const normalizeVersion = (file) => (
  file?.updatedAt ||
  file?.lastModified ||
  file?.uploadDate ||
  ""
);

export const getFileThumbnailCacheKey = (file) => {
  const fileId = file?.id ?? file?.idx ?? null;
  if (fileId == null) {
    return "";
  }

  const isVault = Boolean(
    file?.isVaultSpace ||
    String(file?.spaceType || "").toUpperCase() === "VAULT",
  );
  const scopePrefix = file?.sharedWithMe ? "shared" : isVault ? "vault" : "owned";

  return [
    scopePrefix,
    String(fileId),
    String(file?.fileSavePath || ""),
    String(normalizeVersion(file)),
  ].join(":");
};

export const clearVaultThumbnails = () => {
  for (const [key, url] of thumbnailUrlCache.entries()) {
    if (!String(key).startsWith("vault:")) continue;
    if (url && typeof window !== "undefined" && window.URL?.revokeObjectURL) {
      window.URL.revokeObjectURL(url);
    }
    thumbnailUrlCache.delete(key);
  }
  for (const key of thumbnailMissCache.keys()) {
    if (String(key).startsWith("vault:")) {
      thumbnailMissCache.delete(key);
    }
  }
  for (const key of thumbnailRequestCache.keys()) {
    if (String(key).startsWith("vault:")) {
      thumbnailRequestCache.delete(key);
    }
  }
};

export const getCachedFileThumbnailUrl = (file) => {
  const cacheKey = getFileThumbnailCacheKey(file);
  return cacheKey ? (thumbnailUrlCache.get(cacheKey) || "") : "";
};

export const loadFileThumbnailUrl = async (file, options = {}) => {
  const cacheKey = getFileThumbnailCacheKey(file);
  if (!cacheKey) {
    return "";
  }

  const cachedUrl = thumbnailUrlCache.get(cacheKey);
  if (cachedUrl) {
    return cachedUrl;
  }

  const missUntil = thumbnailMissCache.get(cacheKey);
  if (missUntil && Date.now() < missUntil) {
    return "";
  }
  if (missUntil) {
    thumbnailMissCache.delete(cacheKey);
  }

  const signal = options?.signal;
  if (signal?.aborted) {
    return "";
  }

  if (!signal) {
    const pendingRequest = thumbnailRequestCache.get(cacheKey);
    if (pendingRequest) {
      return pendingRequest;
    }
  }

  const request = (async () => {
    let slotAcquired = false;
    try {
      await acquireThumbnailSlot(signal);
      slotAcquired = true;

      const existingCachedUrl = thumbnailUrlCache.get(cacheKey);
      if (existingCachedUrl) {
        return existingCachedUrl;
      }

      const thumbnailBlob = file?.sharedWithMe
        ? await fetchSharedFileThumbnailBlob(file.id, normalizeVersion(file), { signal })
        : await fetchFileThumbnailBlob(file.id, normalizeVersion(file), { signal });

      if (!(thumbnailBlob instanceof Blob) || thumbnailBlob.size <= 0) {
        thumbnailMissCache.set(cacheKey, Date.now() + MISS_RETRY_COOLDOWN_MS);
        return "";
      }

      const objectUrl = window.URL.createObjectURL(thumbnailBlob);
      thumbnailMissCache.delete(cacheKey);
      setCachedThumbnailUrl(cacheKey, objectUrl);
      return objectUrl;
    } catch (error) {
      if (!isAbortError(error) && !signal?.aborted) {
        thumbnailMissCache.set(cacheKey, Date.now() + MISS_RETRY_COOLDOWN_MS);
      }
      return "";
    } finally {
      if (slotAcquired) {
        releaseThumbnailSlot();
      }
      thumbnailRequestCache.delete(cacheKey);
    }
  })();

  if (!signal) {
    thumbnailRequestCache.set(cacheKey, request);
  }
  return request;
};

const setCachedThumbnailUrl = (cacheKey, objectUrl) => {
  if (!cacheKey || !objectUrl) {
    return;
  }

  if (thumbnailUrlCache.has(cacheKey)) {
    thumbnailUrlCache.delete(cacheKey);
  }

  thumbnailUrlCache.set(cacheKey, objectUrl);
  trimCache();
};

const trimCache = () => {
  while (thumbnailUrlCache.size > MAX_CACHE_SIZE) {
    const oldestKey = thumbnailUrlCache.keys().next().value;
    if (!oldestKey) {
      return;
    }

    const oldestUrl = thumbnailUrlCache.get(oldestKey);
    if (oldestUrl) {
      window.URL.revokeObjectURL(oldestUrl);
    }

    thumbnailUrlCache.delete(oldestKey);
    thumbnailMissCache.delete(oldestKey);
    thumbnailRequestCache.delete(oldestKey);
  }
};
