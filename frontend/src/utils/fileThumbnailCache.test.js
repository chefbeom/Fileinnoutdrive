import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchFileThumbnailBlob = vi.fn();
const mockFetchSharedFileThumbnailBlob = vi.fn();

vi.mock("@/api/filesApi.js", () => ({
  fetchFileThumbnailBlob: (...args) => mockFetchFileThumbnailBlob(...args),
  fetchSharedFileThumbnailBlob: (...args) => mockFetchSharedFileThumbnailBlob(...args),
}));

import {
  clearVaultThumbnails,
  getCachedFileThumbnailUrl,
  loadFileThumbnailUrl,
  resumeThumbnailQueue,
  suspendThumbnailQueue,
} from "./fileThumbnailCache.js";

describe("fileThumbnailCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn((blob) => `blob:${blob?.size ?? 0}-${Math.random()}`);
    window.URL.revokeObjectURL = vi.fn();
  });

  it("executes high priority requests ahead of queued normal priority requests", async () => {
    const resolvers = [];
    const callOrder = [];

    mockFetchFileThumbnailBlob.mockImplementation((fileId) => {
      callOrder.push(fileId);
      return new Promise((resolve) => {
        resolvers.push(() => resolve(new Blob(["ok"], { type: "image/jpeg" })));
      });
    });

    const activePromises = [];
    let normalQueued;
    let highQueued;
    try {
      // Occupy all 3 concurrent thumbnail slots first
      for (let id = 1; id <= 3; id += 1) {
        activePromises.push(
          loadFileThumbnailUrl({ id, fileSavePath: `1/f-${id}.jpg`, spaceType: "DRIVE" }),
        );
      }

      // Queue a normal-priority request followed by a high-priority request
      normalQueued = loadFileThumbnailUrl(
        { id: 100, fileSavePath: "1/normal.jpg", spaceType: "DRIVE" },
        { priority: "normal" },
      );
      highQueued = loadFileThumbnailUrl(
        { id: 200, fileSavePath: "1/high.jpg", spaceType: "DRIVE" },
        { priority: "high" },
      );

      // Flush microtask queue so acquired slots start mockFetchFileThumbnailBlob
      await Promise.resolve();
      await Promise.resolve();
      expect(callOrder).toEqual([1, 2, 3]);
    } finally {
      // Drain all active + newly woken slots cleanly
      for (let round = 0; round < 5 && resolvers.length > 0; round += 1) {
        const batch = resolvers.splice(0, resolvers.length);
        batch.forEach((resolveFn) => resolveFn());
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }
    }

    await Promise.all([...activePromises, normalQueued, highQueued]);

    const highIdx = callOrder.indexOf(200);
    const normalIdx = callOrder.indexOf(100);
    expect(highIdx).toBeGreaterThan(-1);
    expect(normalIdx).toBeGreaterThan(-1);
    expect(highIdx).toBeLessThan(normalIdx);
  });

  it("clearVaultThumbnails revokes vault blobs while preserving normal drive thumbnails", async () => {
    mockFetchFileThumbnailBlob.mockImplementation(async (fileId) => (
      new Blob([`thumb-${fileId}`], { type: "image/jpeg" })
    ));

    const vaultFile = {
      id: 301,
      fileSavePath: "1/vault/secret.enc",
      spaceType: "VAULT",
      isVaultSpace: true,
      updatedAt: "2026-11-26T10:00:00Z",
    };
    const normalFile = {
      id: 302,
      fileSavePath: "1/drive.jpg",
      spaceType: "DRIVE",
      isVaultSpace: false,
      updatedAt: "2026-11-26T10:00:00Z",
    };

    const vaultUrl = await loadFileThumbnailUrl(vaultFile);
    const normalUrl = await loadFileThumbnailUrl(normalFile);

    expect(vaultUrl).toBeTruthy();
    expect(normalUrl).toBeTruthy();

    clearVaultThumbnails();

    expect(getCachedFileThumbnailUrl(vaultFile)).toBe("");
    expect(getCachedFileThumbnailUrl(normalFile)).toBe(normalUrl);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith(vaultUrl);
    expect(window.URL.revokeObjectURL).not.toHaveBeenCalledWith(normalUrl);
  });

  it("pauses queued thumbnail fetches while suspended and retries 202 pending responses", async () => {
    vi.useFakeTimers();
    try {
      const fetchCalls = [];
      mockFetchFileThumbnailBlob
        .mockImplementationOnce(async (fileId) => {
          fetchCalls.push(fileId);
          return { __pendingThumbnail: true };
        })
        .mockImplementationOnce(async (fileId) => {
          fetchCalls.push(fileId);
          return new Blob(["ready-thumb"], { type: "image/jpeg" });
        });

      suspendThumbnailQueue();
      const pendingPromise = loadFileThumbnailUrl({
        id: 405,
        fileSavePath: "1/pending.mp4",
        spaceType: "DRIVE",
        updatedAt: "2026-11-26T10:00:00Z",
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(fetchCalls).toEqual([]);

      resumeThumbnailQueue();
      await Promise.resolve();
      await Promise.resolve();
      expect(fetchCalls).toEqual([405]);

      await vi.advanceTimersByTimeAsync(2300);
      const resolvedUrl = await pendingPromise;
      expect(fetchCalls).toEqual([405, 405]);
      expect(resolvedUrl).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
