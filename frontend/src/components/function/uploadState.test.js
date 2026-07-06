import { describe, expect, it } from "vitest";

import {
  applyUploadItemState,
  buildAbortPayload,
  buildUploadJobs,
  buildUploadProgressPatch,
  calculateWeightedAverageSpeed,
  createUploadItem,
  defaultStatusText,
  extractErrorMessage,
  formatBytesPerSecond,
  formatRemainingTime,
  formatUploadTransferSpeed,
  getExpectedUploadCount,
  getFileFormat,
  getUploadPanelEtaText,
  getUploadPanelSubtitle,
  getUploadPanelTitle,
  updateUploadItemProgress,
} from "./uploadState.js";
import { CHUNK_SIZE_BYTES, PARTITION_SIZE_BYTES } from "@/constants/uploadOptions.js";

describe("uploadState", () => {
  it("formats upload speeds and file extensions", () => {
    expect(formatBytesPerSecond(0)).toBe("0.00 MB/s");
    expect(formatBytesPerSecond(12 * 1024 * 1024)).toBe("12.0 MB/s");
    expect(formatBytesPerSecond(120 * 1024 * 1024)).toBe("120 MB/s");

    expect(getFileFormat({ name: "Report.PDF" })).toBe("pdf");
    expect(getFileFormat({ name: ".env" })).toBe("");
    expect(getFileFormat({ name: "no-extension" })).toBe("");
    expect(getFileFormat(null)).toBe("");
  });

  it("normalizes backend errors without losing string responses", () => {
    expect(extractErrorMessage({ response: { data: "quota exceeded" } }, "fallback")).toBe("quota exceeded");
    expect(extractErrorMessage({ response: { data: { result: { message: "nested" } } } }, "fallback")).toBe("nested");
    expect(extractErrorMessage({ message: "plain" }, "fallback")).toBe("plain");
    expect(extractErrorMessage(null, "fallback")).toBe("fallback");
  });

  it("creates upload items and resets speed samples on status changes", () => {
    const item = createUploadItem({ name: "alpha.txt", size: 200 }, () => "fixed-id");
    expect(item).toMatchObject({
      id: "fixed-id",
      name: "alpha.txt",
      fileSize: 200,
      status: "preparing",
      statusText: defaultStatusText("preparing"),
    });

    item.uploadedBytes = 50;
    item.speedBytesPerSecond = 100;
    applyUploadItemState(item, { status: "uploading" });
    expect(item.speedBytesPerSecond).toBe(0);
    expect(item.speedSampleBytes).toBe(50);
  });

  it("updates progress, clamps bytes, and calculates smoothed speed", () => {
    const item = createUploadItem({ name: "alpha.txt", size: 100 }, () => "id");

    updateUploadItemProgress(item, 20, "20%", 1000);
    expect(item).toMatchObject({ uploadedBytes: 20, progress: 20, speedBytesPerSecond: 0, statusText: "20%" });

    updateUploadItemProgress(item, 70, "70%", 1400);
    expect(item.progress).toBe(70);
    expect(item.speedBytesPerSecond).toBeCloseTo(125, 5);

    updateUploadItemProgress(item, 500, "done", 2000);
    expect(item.uploadedBytes).toBe(100);
    expect(item.progress).toBe(100);
  });

  it("builds abort payloads for single and partitioned uploads", () => {
    expect(buildAbortPayload(null)).toEqual({ finalObjectKey: null, chunkObjectKeys: [] });
    expect(buildAbortPayload([{ objectKey: "final" }])).toEqual({ finalObjectKey: "final", chunkObjectKeys: [] });
    expect(buildAbortPayload([
      { finalObjectKey: "merged", objectKey: "chunk-a", partitioned: true },
      { objectKey: "chunk-b" },
      { objectKey: "" },
    ])).toEqual({ finalObjectKey: "merged", chunkObjectKeys: ["chunk-a", "chunk-b"] });
  });

  it("groups presigned upload metadata into upload jobs", () => {
    const files = [
      { name: "small.txt", size: 10 },
      { name: "large.bin", size: PARTITION_SIZE_BYTES + 1 },
    ];
    const items = files.map((file, index) => createUploadItem(file, () => `item-${index}`));
    const metas = [
      { objectKey: "small", partitioned: false },
      { objectKey: "large-1", finalObjectKey: "large-final", partitioned: true, partitionCount: 2 },
      { objectKey: "large-2" },
    ];

    const jobs = buildUploadJobs(files, metas, items);

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ itemId: "item-0", partitioned: false, metas: [metas[0]] });
    expect(jobs[1]).toMatchObject({ itemId: "item-1", partitioned: true, metas: [metas[1], metas[2]] });
    expect(items.map((item) => item.status)).toEqual(["pending", "pending"]);
    expect(items[1].uploadMetas).toEqual([metas[1], metas[2]]);
  });

  it("detects missing or extra upload metadata", () => {
    const file = { name: "large.bin", size: PARTITION_SIZE_BYTES + CHUNK_SIZE_BYTES };
    expect(getExpectedUploadCount(file, { partitioned: true, partitionCount: 3 })).toBe(3);
    expect(getExpectedUploadCount(file, {})).toBe(3);

    const item = createUploadItem(file, () => "item");
    expect(() => buildUploadJobs([file], [{ objectKey: "only-one" }], [item]))
      .toThrow("업로드 메타 개수가 올바르지 않습니다");
    expect(() => buildUploadJobs([], [{ objectKey: "extra" }], []))
      .toThrow("업로드 메타 개수와 선택한 파일 수가 일치하지 않습니다");
  });
  it("formats upload progress time and transfer speed", () => {
    expect(formatRemainingTime(0)).toBe("\uACE7 \uC644\uB8CC");
    expect(formatRemainingTime(30)).toBe("30\uCD08");
    expect(formatRemainingTime(90)).toBe("2\uBD84");
    expect(formatRemainingTime(3660)).toBe("1\uC2DC\uAC04 1\uBD84");
    expect(formatUploadTransferSpeed(0)).toBe("");
    expect(formatUploadTransferSpeed(1536)).toBe("1.50 KB/s");
    expect(calculateWeightedAverageSpeed([{ speed: 10 }, { speed: 20 }])).toBeCloseTo(16.666, 2);
  });

  it("builds upload progress patches with smoothed speed and ETA", () => {
    const item = {
      fileSize: 1000,
      uploadedBytes: 100,
      progress: 10,
      startedAt: 1000,
      lastProgressAt: 1000,
      lastProgressBytes: 100,
      speedSamples: [],
      averageBytesPerSecond: 0,
      estimatedSeconds: null,
    };

    const patch = buildUploadProgressPatch(item, 300, 1400);

    expect(patch).toMatchObject({
      uploadedBytes: 300,
      progress: 30,
      lastProgressAt: 1400,
      lastProgressBytes: 300,
      estimatedSeconds: 2,
    });
    expect(patch.averageBytesPerSecond).toBeCloseTo(500, 5);
    expect(patch.statusText).toContain("30%");
  });
  it("builds upload panel title, subtitle, and ETA text", () => {
    expect(getUploadPanelTitle({ activeUploadCount: 2 })).toBe("2개 업로드 중");
    expect(getUploadPanelTitle({ completedUploadCount: 3, failedUploadCount: 1 })).toBe("3개 완료, 1개 실패");
    expect(getUploadPanelTitle({ canceledUploadCount: 1 })).toBe("업로드가 취소됨");

    expect(getUploadPanelSubtitle({ activeUploadCount: 1, completedUploadCount: 2, totalUploadCount: 5 })).toBe("2/5 완료");
    expect(getUploadPanelSubtitle({ failedUploadCount: 1 })).toBe("실패한 파일을 확인해 주세요.");
    expect(getUploadPanelSubtitle({ completedUploadCount: 2 })).toBe("모든 업로드가 완료되었습니다.");

    expect(getUploadPanelEtaText({ activeUploadCount: 0, failedUploadCount: 1 })).toBe("업로드가 중단되었거나 일부 파일이 실패했습니다.");
    expect(getUploadPanelEtaText({ activeUploadCount: 1, mergingUploadCount: 1 })).toBe("서버에서 업로드를 마무리하는 중입니다...");
    expect(getUploadPanelEtaText({ activeUploadCount: 1, overallTransferSpeedText: "2.00 MB/s" })).toBe("2.00 MB/s 전송 중");
    expect(getUploadPanelEtaText({ activeUploadCount: 1, overallEstimatedSeconds: 90, overallTransferSpeedText: "1.50 MB/s" })).toBe("2분 남음 · 1.50 MB/s");
  });
});
