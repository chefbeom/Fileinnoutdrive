import {
  CHUNK_SIZE_BYTES,
  MAX_SPEED_SAMPLES,
  MIN_PROGRESS_SAMPLE_INTERVAL_MS,
  PARTITION_SIZE_BYTES,
  SPEED_SAMPLE_WINDOW_MS,
} from "@/constants/uploadOptions.js";

const defaultUploadItemId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function formatBytesPerSecond(bytesPerSecond) {
  const normalizedBytesPerSecond = Number(bytesPerSecond || 0);
  if (!Number.isFinite(normalizedBytesPerSecond) || normalizedBytesPerSecond <= 0) {
    return "0.00 MB/s";
  }

  const megabytesPerSecond = normalizedBytesPerSecond / (1024 * 1024);
  const fractionDigits = megabytesPerSecond >= 100 ? 0 : megabytesPerSecond >= 10 ? 1 : 2;
  return `${megabytesPerSecond.toFixed(fractionDigits)} MB/s`;
}

export function extractErrorMessage(error, fallbackMessage) {
  const responseData = error?.response?.data;
  if (typeof responseData === "string" && responseData.trim()) {
    return responseData;
  }

  return (
    responseData?.message ||
    responseData?.result?.message ||
    error?.message ||
    fallbackMessage
  );
}

export function getFileFormat(file) {
  if (typeof file?.name !== "string") {
    return "";
  }

  const lastDotIndex = file.name.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex >= file.name.length - 1) {
    return "";
  }

  return file.name.slice(lastDotIndex + 1).trim().replace(/^\.+/, "").toLowerCase();
}

export function defaultStatusText(status) {
  switch (status) {
    case "preparing":
      return "업로드 정보를 준비하고 있습니다.";
    case "pending":
      return "업로드 대기 중입니다.";
    case "uploading":
      return "업로드를 진행하고 있습니다.";
    case "merging":
      return "서버에서 업로드를 마무리하고 있습니다.";
    case "completed":
      return "업로드 완료";
    case "canceling":
      return "업로드를 정리하고 있습니다.";
    case "canceled":
      return "업로드가 취소되었습니다.";
    case "failed":
      return "업로드에 실패했습니다.";
    default:
      return "업로드 상태를 확인하고 있습니다.";
  }
}

export function createUploadItem(file, idFactory = defaultUploadItemId) {
  return {
    id: idFactory(file),
    name: file?.name || "이름 없는 파일",
    fileSize: Number(file?.size || 0),
    progress: 0,
    uploadedBytes: 0,
    speedBytesPerSecond: 0,
    speedSampleAt: 0,
    speedSampleBytes: 0,
    status: "preparing",
    statusText: defaultStatusText("preparing"),
    uploadMetas: [],
  };
}

export function applyUploadItemState(item, patch) {
  if (!item || !patch) {
    return item;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    const nextStatus = patch.status;
    if (nextStatus === "uploading" && item.status !== "uploading") {
      item.speedBytesPerSecond = 0;
      item.speedSampleAt = 0;
      item.speedSampleBytes = Number(item.uploadedBytes || 0);
    } else if (nextStatus !== "uploading") {
      item.speedBytesPerSecond = 0;
      item.speedSampleAt = 0;
      item.speedSampleBytes = Number(item.uploadedBytes || 0);
    }
  }

  Object.assign(item, patch);
  return item;
}

export function formatRemainingTime(seconds) {
  if (seconds == null || Number.isNaN(seconds) || seconds <= 0) {
    return "\uACE7 \uC644\uB8CC";
  }

  if (seconds < 60) {
    return `${Math.ceil(seconds)}\uCD08`;
  }

  if (seconds < 3600) {
    return `${Math.ceil(seconds / 60)}\uBD84`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);

  if (minutes === 0) {
    return `${hours}\uC2DC\uAC04`;
  }

  return `${hours}\uC2DC\uAC04 ${minutes}\uBD84`;
}

export function formatUploadTransferSpeed(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "";
  }

  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bytesPerSecond;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

export function getUploadPanelTitle({
  activeUploadCount = 0,
  failedUploadCount = 0,
  completedUploadCount = 0,
  canceledUploadCount = 0,
} = {}) {
  if (activeUploadCount > 0) {
    return `${activeUploadCount}개 업로드 중`;
  }

  if (failedUploadCount > 0 && completedUploadCount > 0) {
    return `${completedUploadCount}개 완료, ${failedUploadCount}개 실패`;
  }

  if (failedUploadCount > 0) {
    return `${failedUploadCount}개 업로드 실패`;
  }

  if (canceledUploadCount > 0) {
    return "업로드가 취소됨";
  }

  if (completedUploadCount > 0) {
    return `${completedUploadCount}개 업로드 완료`;
  }

  return "업로드 상태";
}

export function getUploadPanelSubtitle({
  activeUploadCount = 0,
  completedUploadCount = 0,
  totalUploadCount = 0,
  failedUploadCount = 0,
  canceledUploadCount = 0,
} = {}) {
  if (activeUploadCount > 0) {
    return `${completedUploadCount}/${totalUploadCount} 완료`;
  }

  if (failedUploadCount > 0) {
    return "실패한 파일을 확인해 주세요.";
  }

  if (canceledUploadCount > 0) {
    return "중단된 업로드가 있습니다.";
  }

  if (completedUploadCount > 0) {
    return "모든 업로드가 완료되었습니다.";
  }

  return "";
}

export function getUploadPanelEtaText({
  activeUploadCount = 0,
  failedUploadCount = 0,
  canceledUploadCount = 0,
  mergingUploadCount = 0,
  overallEstimatedSeconds = null,
  overallTransferSpeedText = "",
} = {}) {
  if (activeUploadCount === 0) {
    if (failedUploadCount > 0) {
      return "업로드가 중단되었거나 일부 파일이 실패했습니다.";
    }

    if (canceledUploadCount > 0) {
      return "업로드가 취소되었습니다.";
    }

    return "모든 업로드가 완료되었습니다.";
  }

  if (mergingUploadCount > 0) {
    return "서버에서 업로드를 마무리하는 중입니다...";
  }

  if (overallEstimatedSeconds == null) {
    return overallTransferSpeedText
      ? `${overallTransferSpeedText} 전송 중`
      : "남은 시간을 계산 중입니다...";
  }

  const speedSuffix = overallTransferSpeedText
    ? ` · ${overallTransferSpeedText}`
    : "";
  return `${formatRemainingTime(overallEstimatedSeconds)} 남음${speedSuffix}`;
}
export function calculateWeightedAverageSpeed(speedSamples) {
  if (!Array.isArray(speedSamples) || speedSamples.length === 0) {
    return 0;
  }

  const weighted = speedSamples.reduce(
    (sum, sample, index) => {
      const weight = index + 1;
      return {
        speed: sum.speed + sample.speed * weight,
        weight: sum.weight + weight,
      };
    },
    { speed: 0, weight: 0 },
  );

  if (weighted.weight <= 0) {
    return 0;
  }

  return weighted.speed / weighted.weight;
}

export function buildUploadProgressPatch(item, uploadedBytes, now = Date.now()) {
  if (!item) {
    return {};
  }

  const normalizedUploadedBytes = Number(uploadedBytes || 0);
  const fileSize = Number(item.fileSize || 0);
  const safeUploadedBytes = Math.min(
    fileSize || normalizedUploadedBytes,
    Math.max(0, normalizedUploadedBytes),
  );
  const progress = fileSize
    ? Math.min(100, Math.round((safeUploadedBytes / fileSize) * 100))
    : safeUploadedBytes > 0
      ? 100
      : 0;

  const patch = {
    uploadedBytes: safeUploadedBytes,
    progress,
  };

  const currentSamples = Array.isArray(item.speedSamples) ? [...item.speedSamples] : [];
  const lastProgressAt = item.lastProgressAt || item.startedAt || now;
  const lastProgressBytes = Number(item.lastProgressBytes || 0);
  const deltaBytes = Math.max(0, safeUploadedBytes - lastProgressBytes);
  const deltaMs = Math.max(0, now - lastProgressAt);

  let speedSamples = currentSamples.filter((sample) => now - sample.at <= SPEED_SAMPLE_WINDOW_MS);

  if (deltaBytes > 0 && deltaMs >= MIN_PROGRESS_SAMPLE_INTERVAL_MS) {
    speedSamples = [
      ...speedSamples,
      {
        at: now,
        speed: (deltaBytes / deltaMs) * 1000,
      },
    ].slice(-MAX_SPEED_SAMPLES);
    patch.lastProgressAt = now;
    patch.lastProgressBytes = safeUploadedBytes;
  } else {
    patch.lastProgressAt = item.lastProgressAt || now;
    patch.lastProgressBytes = Math.max(lastProgressBytes, safeUploadedBytes);
  }

  const averageBytesPerSecond = calculateWeightedAverageSpeed(speedSamples);
  const remainingBytes = Math.max(0, fileSize - safeUploadedBytes);
  const estimatedSeconds =
    averageBytesPerSecond > 0 && remainingBytes > 0
      ? Math.max(1, Math.ceil(remainingBytes / averageBytesPerSecond))
      : null;

  patch.speedSamples = speedSamples;
  patch.averageBytesPerSecond = averageBytesPerSecond;
  patch.estimatedSeconds = estimatedSeconds;

  if (item.startedAt && safeUploadedBytes > 0 && safeUploadedBytes < fileSize) {
    const speedText = averageBytesPerSecond > 0
      ? formatUploadTransferSpeed(averageBytesPerSecond)
      : "";
    const etaText = estimatedSeconds != null
      ? `${formatRemainingTime(estimatedSeconds)} \uB0A8\uC74C`
      : "";

    patch.statusText = [progress > 0 ? `${progress}%` : "\uC5C5\uB85C\uB4DC \uC911", speedText, etaText]
      .filter(Boolean)
      .join(" \u00B7 ");
  } else if (safeUploadedBytes >= fileSize && fileSize > 0) {
    patch.statusText = "\uC5C5\uB85C\uB4DC \uC644\uB8CC, \uB9C8\uBB34\uB9AC \uC911";
    patch.averageBytesPerSecond = 0;
    patch.estimatedSeconds = 0;
  } else {
    patch.statusText = progress > 0 ? `${progress}% \uC5C5\uB85C\uB4DC \uC911` : "\uC5C5\uB85C\uB4DC \uC900\uBE44 \uC911";
  }

  return patch;
}
export function updateUploadItemProgress(item, uploadedBytes, statusText, now = Date.now()) {
  if (!item) {
    return item;
  }

  const safeUploadedBytes = Math.max(0, Math.min(Number(item.fileSize || 0), Number(uploadedBytes || 0)));
  const progress = item.fileSize > 0 ? Math.min(100, Math.round((safeUploadedBytes / item.fileSize) * 100)) : 0;

  if (!item.speedSampleAt || safeUploadedBytes < Number(item.speedSampleBytes || 0)) {
    item.speedSampleAt = now;
    item.speedSampleBytes = safeUploadedBytes;
    item.speedBytesPerSecond = 0;
  } else {
    const deltaBytes = safeUploadedBytes - Number(item.speedSampleBytes || 0);
    const deltaMs = now - Number(item.speedSampleAt || 0);

    if (deltaBytes > 0 && deltaMs >= 200) {
      const nextBytesPerSecond = (deltaBytes / deltaMs) * 1000;
      const previousBytesPerSecond = Number(item.speedBytesPerSecond || 0);
      item.speedBytesPerSecond = previousBytesPerSecond > 0
        ? (previousBytesPerSecond * 0.45) + (nextBytesPerSecond * 0.55)
        : nextBytesPerSecond;
      item.speedSampleAt = now;
      item.speedSampleBytes = safeUploadedBytes;
    }
  }

  item.uploadedBytes = safeUploadedBytes;
  item.progress = progress;
  if (statusText) {
    item.statusText = statusText;
  }

  return item;
}

export function buildAbortPayload(uploadMetas) {
  const metaList = Array.isArray(uploadMetas) ? uploadMetas : [];
  const firstMeta = metaList[0];
  const finalObjectKey = firstMeta?.finalObjectKey || firstMeta?.objectKey || null;
  const chunkObjectKeys = firstMeta?.partitioned === true
    ? metaList.map((meta) => meta?.objectKey).filter(Boolean)
    : [];

  return {
    finalObjectKey,
    chunkObjectKeys,
  };
}

export function getExpectedUploadCount(file, firstMeta) {
  const partitionCount = Number(firstMeta?.partitionCount || 0);
  if (firstMeta?.partitioned === true && Number.isInteger(partitionCount) && partitionCount > 0) {
    return partitionCount;
  }

  if (!file?.size || Number(file.size) <= PARTITION_SIZE_BYTES) {
    return 1;
  }

  return Math.ceil(Number(file.size) / CHUNK_SIZE_BYTES);
}

export function buildUploadJobs(selectedFiles, uploadMetas, uploadItems) {
  const files = Array.isArray(selectedFiles) ? selectedFiles : [];
  const metas = Array.isArray(uploadMetas) ? uploadMetas : [];
  const items = Array.isArray(uploadItems) ? uploadItems : [];
  const jobs = [];
  let responseIndex = 0;

  for (const [fileIndex, file] of files.entries()) {
    const firstMeta = metas[responseIndex];
    const item = items[fileIndex];

    if (!firstMeta || !item) {
      throw new Error(`"${file?.name || "파일"}" 업로드 정보를 찾을 수 없습니다.`);
    }

    const expectedCount = getExpectedUploadCount(file, firstMeta);
    const group = metas.slice(responseIndex, responseIndex + expectedCount);

    if (group.length !== expectedCount) {
      throw new Error(`"${file.name}" 업로드 메타 개수가 올바르지 않습니다.`);
    }

    applyUploadItemState(item, {
      status: "pending",
      statusText: defaultStatusText("pending"),
      uploadMetas: group,
    });

    jobs.push({
      file,
      metas: group,
      itemId: item.id,
      partitioned: firstMeta?.partitioned === true,
    });

    responseIndex += expectedCount;
  }

  if (responseIndex !== metas.length) {
    throw new Error("업로드 메타 개수와 선택한 파일 수가 일치하지 않습니다.");
  }

  return jobs;
}
