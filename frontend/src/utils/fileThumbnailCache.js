import {
  fetchFileThumbnailBlob,
  fetchSharedFileThumbnailBlob,
} from "@/api/filesApi.js";

const MAX_CACHE_SIZE = 1000;
const MAX_CONCURRENT_THUMBNAIL_REQUESTS = 3;
const MISS_RETRY_COOLDOWN_MS = 15_000;
const PENDING_THUMBNAIL_RETRY_DELAYS_MS = [1500, 2000, 2500, 3000, 3000, 3000, 3000, 3000];
const thumbnailUrlCache = new Map();
const thumbnailRequestCache = new Map();
const thumbnailMissCache = new Map();
let activeThumbnailRequests = 0;
let thumbnailSuspendCount = 0;
const highPriorityThumbnailQueue = [];
const normalPriorityThumbnailQueue = [];

const waitWithSignal = (delayMs, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException("Aborted", "AbortError"));
    return;
  }

  let timerId = null;
  const onAbort = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    signal?.removeEventListener("abort", onAbort);
    reject(new DOMException("Aborted", "AbortError"));
  };

  signal?.addEventListener("abort", onAbort, { once: true });
  timerId = setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    resolve();
  }, delayMs);
});

const pumpThumbnailQueue = () => {
  if (thumbnailSuspendCount > 0) {
    return;
  }

  while (activeThumbnailRequests < MAX_CONCURRENT_THUMBNAIL_REQUESTS) {
    const nextEntry = highPriorityThumbnailQueue.shift() || normalPriorityThumbnailQueue.shift();
    if (!nextEntry) {
      return;
    }
    activeThumbnailRequests += 1;
    nextEntry.resolve();
  }
};

export const suspendThumbnailQueue = () => {
  thumbnailSuspendCount += 1;
};

export const resumeThumbnailQueue = () => {
  if (thumbnailSuspendCount > 0) {
    thumbnailSuspendCount -= 1;
  }
  if (thumbnailSuspendCount === 0) {
    pumpThumbnailQueue();
  }
};

const acquireThumbnailSlot = (signal, priority = "normal") => {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  if (thumbnailSuspendCount === 0 && activeThumbnailRequests < MAX_CONCURRENT_THUMBNAIL_REQUESTS) {
    activeThumbnailRequests += 1;
    return Promise.resolve();
  }

  const targetQueue = priority === "high" ? highPriorityThumbnailQueue : normalPriorityThumbnailQueue;

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
      const idx = targetQueue.indexOf(entry);
      if (idx >= 0) {
        targetQueue.splice(idx, 1);
      }
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    targetQueue.push(entry);
  });
};

const releaseThumbnailSlot = () => {
  activeThumbnailRequests = Math.max(0, activeThumbnailRequests - 1);
  pumpThumbnailQueue();
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

  const priority = options?.priority === "high" ? "high" : "normal";
  const request = (async () => {
    let slotAcquired = false;
    try {
      const fetchOnce = async () => {
        await acquireThumbnailSlot(signal, priority);
        slotAcquired = true;
        try {
          const existingCachedUrl = thumbnailUrlCache.get(cacheKey);
          if (existingCachedUrl) {
            return existingCachedUrl;
          }

          return file?.sharedWithMe
            ? await fetchSharedFileThumbnailBlob(file.id, normalizeVersion(file), { signal })
            : await fetchFileThumbnailBlob(file.id, normalizeVersion(file), { signal });
        } finally {
          if (slotAcquired) {
            slotAcquired = false;
            releaseThumbnailSlot();
          }
        }
      };

      let thumbnailResult = await fetchOnce();
      if (typeof thumbnailResult === "string") {
        return thumbnailResult;
      }

      let pendingAttempt = 0;
      while (thumbnailResult?.__pendingThumbnail && pendingAttempt < PENDING_THUMBNAIL_RETRY_DELAYS_MS.length) {
        const retryDelayMs = PENDING_THUMBNAIL_RETRY_DELAYS_MS[pendingAttempt];
        pendingAttempt += 1;
        await waitWithSignal(retryDelayMs, signal);
        thumbnailResult = await fetchOnce();
        if (typeof thumbnailResult === "string") {
          return thumbnailResult;
        }
      }

      if (thumbnailResult?.__pendingThumbnail) {
        return "";
      }

      if (!(thumbnailResult instanceof Blob) || thumbnailResult.size <= 0) {
        thumbnailMissCache.set(cacheKey, Date.now() + MISS_RETRY_COOLDOWN_MS);
        return "";
      }

      const objectUrl = window.URL.createObjectURL(thumbnailResult);
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
