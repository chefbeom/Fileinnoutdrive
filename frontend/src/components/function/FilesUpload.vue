<template>
  <div class="relative">
    <FilesUploadMenu
      :open="isDropdownOpen"
      :active-upload-count="activeUploadCountComputed"
      :upload-concurrency="uploadConcurrency"
      :upload-concurrency-options="uploadConcurrencyOptions"
      :is-uploading="isUploading"
      :max-upload-count="maxUploadCount"
      :max-upload-file-bytes="maxUploadFileBytes"
      @toggle="toggleDropdown"
      @create-folder="createNewFolder"
      @file-change="handleFileChange"
      @folder-change="handleFolderChange"
      @update-upload-concurrency="uploadConcurrency = $event"
    />

    <p v-if="uploadError" class="mt-2 text-xs text-rose-500">
      {{ uploadError }}
    </p>
    <FilesUploadProgressPanel
      :visible="uploadPanelVisible"
      :collapsed="uploadPanelCollapsed"
      :title="uploadPanelTitle"
      :subtitle="uploadPanelSubtitle"
      :eta-text="uploadPanelEtaText"
      :can-cancel="canCancelUploads"
      :items="uploadItems"
      @show="uploadPanelVisible = true"
      @toggle-collapsed="uploadPanelCollapsed = !uploadPanelCollapsed"
      @dismiss="dismissUploadPanel"
      @cancel="cancelActiveUploads"
    />
    <div
      v-if="isDropdownOpen"
      @click="closeDropdown"
      class="fixed inset-0 z-40"
    ></div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import axios from "axios"
import { abortUpload, completeUpload, fetchUploadSessions, initUploadFiles, parseUploadResponse } from "@/api/filesApi.js"
import {
  ACTIVE_UPLOAD_STATUSES,
  CHUNK_SIZE_BYTES,
  DEFAULT_UPLOAD_CONCURRENCY,
  UPLOAD_CONCURRENCY_STORAGE_KEY,
  normalizeUploadConcurrency,
  uploadConcurrencyOptions,
} from "@/constants/uploadOptions.js"
import { useFileStore } from "@/stores/useFileStore.js"
import { formatBytes as formatUploadLimitBytes } from "@/utils/formatBytes.js"
import {
  buildAbortPayload,
  buildUploadJobs,
  buildUploadProgressPatch,
  formatUploadTransferSpeed,
  getUploadPanelEtaText,
  getUploadPanelSubtitle,
  getUploadPanelTitle,
  getFileFormat,
} from "./uploadState.js"
import FilesUploadMenu from "./FilesUploadMenu.vue"
import FilesUploadProgressPanel from "./FilesUploadProgressPanel.vue"

const isDropdownOpen = ref(false)
const uploadedFiles = ref([])
const isUploading = ref(false)
const uploadError = ref("")
const uploadItems = ref([])
const uploadPanelVisible = ref(false)
const uploadPanelCollapsed = ref(false)
const totalUploadCount = ref(0)
const completedUploadCount = ref(0)
const mergingUploadCount = ref(0)
const nowTick = ref(Date.now())
const isCancelRequested = ref(false)
const fileStore = useFileStore()
const planCapabilities = computed(() => fileStore.planCapabilities)
const maxUploadCount = computed(() => Number(planCapabilities.value?.maxUploadCount || 30))
const maxUploadFileBytes = computed(() => Number(planCapabilities.value?.maxUploadFileBytes || 5 * 1024 * 1024 * 1024))

const emit = defineEmits(["upload-complete", "upload-fail"])
const activeUploadControllers = new Map()

let tickTimerId = null

const readStoredUploadConcurrency = () => {
  if (typeof window === "undefined") {
    return DEFAULT_UPLOAD_CONCURRENCY
  }

  return normalizeUploadConcurrency(
    window.localStorage.getItem(UPLOAD_CONCURRENCY_STORAGE_KEY),
  )
}

const uploadConcurrency = ref(readStoredUploadConcurrency())

watch(uploadConcurrency, (value) => {
  const normalizedValue = normalizeUploadConcurrency(value)

  if (normalizedValue !== value) {
    uploadConcurrency.value = normalizedValue
    return
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      UPLOAD_CONCURRENCY_STORAGE_KEY,
      String(normalizedValue),
    )
  }
})

const hasUploadItems = computed(() => uploadItems.value.length > 0)

const activeUploadCountComputed = computed(() =>
  uploadItems.value.filter((item) => ACTIVE_UPLOAD_STATUSES.has(item.status)).length,
)

const failedUploadCount = computed(() =>
  uploadItems.value.filter((item) => item.status === "failed").length,
)

const canceledUploadCount = computed(() =>
  uploadItems.value.filter((item) => item.status === "canceled").length,
)

const abortableSessionIds = computed(() =>
  Array.from(
    new Set(
      uploadItems.value
        .filter((item) =>
          item?.sessionId &&
          !["completed", "failed", "canceled"].includes(item.status),
        )
        .map((item) => item.sessionId),
    ),
  ),
)

const overallTransferSpeedBytes = computed(() =>
  uploadItems.value.reduce((sum, item) => {
    if (!ACTIVE_UPLOAD_STATUSES.has(item.status) || item.status === "merging") {
      return sum
    }

    return sum + Math.max(0, item.averageBytesPerSecond || 0)
  }, 0),
)

const overallTransferSpeedText = computed(() => {
  if (overallTransferSpeedBytes.value <= 0) {
    return ""
  }

  return formatUploadTransferSpeed(overallTransferSpeedBytes.value)
})

const overallEstimatedSeconds = computed(() => {
  if (activeUploadCountComputed.value === 0 || mergingUploadCount.value > 0) {
    return null
  }

  const remainingBytes = uploadItems.value.reduce((sum, item) => {
    if (item.status === "completed") {
      return sum
    }

    return sum + Math.max(0, (item.fileSize || 0) - (item.uploadedBytes || 0))
  }, 0)

  if (remainingBytes <= 0 || overallTransferSpeedBytes.value <= 0) {
    return null
  }

  return Math.max(1, Math.ceil(remainingBytes / overallTransferSpeedBytes.value))
})

const uploadPanelTitle = computed(() => getUploadPanelTitle({
  activeUploadCount: activeUploadCountComputed.value,
  failedUploadCount: failedUploadCount.value,
  completedUploadCount: completedUploadCount.value,
  canceledUploadCount: canceledUploadCount.value,
}))

const uploadPanelSubtitle = computed(() => getUploadPanelSubtitle({
  activeUploadCount: activeUploadCountComputed.value,
  completedUploadCount: completedUploadCount.value,
  totalUploadCount: totalUploadCount.value,
  failedUploadCount: failedUploadCount.value,
  canceledUploadCount: canceledUploadCount.value,
}))

const uploadPanelEtaText = computed(() => getUploadPanelEtaText({
  activeUploadCount: activeUploadCountComputed.value,
  failedUploadCount: failedUploadCount.value,
  canceledUploadCount: canceledUploadCount.value,
  mergingUploadCount: mergingUploadCount.value,
  overallEstimatedSeconds: overallEstimatedSeconds.value,
  overallTransferSpeedText: overallTransferSpeedText.value,
}))
const canCancelUploads = computed(() =>
  abortableSessionIds.value.length > 0,
)

const applyUploadPanelSafeArea = () => {
  if (typeof document === "undefined") {
    return
  }

  const rootStyle = document.documentElement.style
  let safeSpace = "0px"

  if (hasUploadItems.value) {
    if (uploadPanelVisible.value && !uploadPanelCollapsed.value) {
      safeSpace = window.innerWidth < 768 ? "220px" : "260px"
    } else {
      safeSpace = "72px"
    }
  }

  rootStyle.setProperty("--upload-panel-safe-space", safeSpace)
}

const handleViewportResize = () => {
  applyUploadPanelSafeArea()
}

watch(
  [hasUploadItems, uploadPanelVisible, uploadPanelCollapsed],
  () => {
    applyUploadPanelSafeArea()
  },
  { immediate: true },
)

const createUploadItem = (file, index) => ({
  id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  name: file.name,
  fileSize: file.size || 0,
  uploadedBytes: 0,
  progress: 0,
  status: "pending",
  statusText: "업로드 대기 중",
  errorMessage: "",
  startedAt: null,
  lastProgressAt: null,
  lastProgressBytes: 0,
  speedSamples: [],
  averageBytesPerSecond: 0,
  estimatedSeconds: null,
})

const getUploadItem = (itemId) =>
  uploadItems.value.find((item) => item.id === itemId)

const setUploadItemState = (itemId, patch) => {
  const item = getUploadItem(itemId)
  if (!item) return
  Object.assign(item, patch)
}

const updateUploadItemProgress = (itemId, uploadedBytes) => {
  const item = getUploadItem(itemId)
  if (!item) return

  setUploadItemState(itemId, buildUploadProgressPatch(item, uploadedBytes))
}

const isAbortError = (error) =>
  error?.code === "ERR_CANCELED" ||
  error?.name === "CanceledError" ||
  error?.name === "AbortError"

const toggleDropdown = () => {
  if (isUploading.value) return
  isDropdownOpen.value = !isDropdownOpen.value
}

const closeDropdown = () => {
  isDropdownOpen.value = false
}

const dismissUploadPanel = () => {
  uploadPanelVisible.value = false
}

const createNewFolder = () => {
  const folderName = prompt("폴더 이름을 입력해 주세요")
  if (folderName) {
    fileStore.createFolder(folderName).catch((error) => {
      uploadError.value =
        error?.response?.data?.message ||
        error?.message ||
        "폴더를 생성하지 못했습니다."
    })
  }
  closeDropdown()
}

const uploadToPresignedUrl = async (
  payload,
  uploadMeta,
  fileName,
  contentType = "application/octet-stream",
  options = {},
) => {
  const { signal, onProgress } = options
  const presignedUploadUrl = uploadMeta?.presignedUploadUrl

  if (!presignedUploadUrl) {
    throw new Error("업로드 URL이 없습니다.")
  }

  const presignedFormData = uploadMeta?.presignedFormData
  if (presignedFormData && typeof presignedFormData === "object") {
    const formData = new FormData()

    Object.entries(presignedFormData).forEach(([key, value]) => {
      formData.append(key, value)
    })
    if (!presignedFormData.key && uploadMeta?.objectKey) {
      formData.append("key", uploadMeta.objectKey)
    }
    formData.append("file", payload, fileName || "upload.bin")

    await axios.post(presignedUploadUrl, formData, {
      signal,
      onUploadProgress: (event) => {
        onProgress?.(event?.loaded ?? 0)
      },
    })
    return
  }

  await axios.put(presignedUploadUrl, payload, {
    signal,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
    },
    onUploadProgress: (event) => {
      onProgress?.(event?.loaded ?? 0)
    },
  })
}

const abortUploadedFile = async (uploadMetas) => {
  const payload = buildAbortPayload(uploadMetas)

  if (!payload.finalObjectKey) {
    return
  }

  try {
    await abortUpload(payload)
  } catch {
  }
}

const uploadFileByChunks = async (file, uploadMetas, uploadItemId) => {
  const uploadChunkCount = Array.isArray(uploadMetas) ? uploadMetas.length : 0

  if (uploadChunkCount === 0) {
    throw new Error(`${file?.name || "unknown-file"} 업로드 정보가 올바르지 않습니다.`)
  }

  setUploadItemState(uploadItemId, {
    status: "uploading",
    startedAt: Date.now(),
    statusText: "업로드 시작 중",
  })

  let completedBytes = 0

  for (let chunkIndex = 0; chunkIndex < uploadChunkCount; chunkIndex++) {
    if (isCancelRequested.value) {
      throw new DOMException("Upload canceled", "AbortError")
    }

    const start = chunkIndex * CHUNK_SIZE_BYTES
    const end =
      chunkIndex === uploadChunkCount - 1
        ? file.size
        : Math.min(start + CHUNK_SIZE_BYTES, file.size)
    const chunkBlob = file.slice(
      start,
      end,
      file.type || "application/octet-stream",
    )
    const chunkSize = chunkBlob.size || 0
    const controller = new AbortController()

    activeUploadControllers.set(uploadItemId, controller)

    try {
      await uploadToPresignedUrl(
        chunkBlob,
        uploadMetas[chunkIndex],
        uploadChunkCount === 1
          ? file.name
          : `${file.name}.part${String(chunkIndex + 1).padStart(5, "0")}`,
        file.type,
        {
          signal: controller.signal,
          onProgress: (loadedBytes) => {
            updateUploadItemProgress(
              uploadItemId,
              completedBytes + Math.min(chunkSize, loadedBytes),
            )
          },
        },
      )
    } finally {
      activeUploadControllers.delete(uploadItemId)
    }

    completedBytes += chunkSize
    updateUploadItemProgress(uploadItemId, completedBytes)
  }
}

const completeUploadedFile = async (file, uploadMetas, partitioned, uploadItemId, parentId) => {
  const firstMeta = uploadMetas?.[0]
  const finalObjectKey = firstMeta?.finalObjectKey || firstMeta?.objectKey
  const chunkObjectKeys = partitioned
    ? uploadMetas.map((meta) => meta?.objectKey).filter(Boolean)
    : []

  if (!finalObjectKey) {
    throw new Error(`${file.name} 업로드 완료 정보를 확인할 수 없습니다.`)
  }

  if (partitioned && chunkObjectKeys.length !== uploadMetas.length) {
    throw new Error(`${file.name} 청크 정보가 올바르지 않습니다.`)
  }

  setUploadItemState(uploadItemId, {
    status: partitioned ? "merging" : "uploading",
    statusText: partitioned ? "서버에서 파일을 병합하는 중..." : "업로드 완료를 확인하는 중...",
    progress: 100,
    uploadedBytes: file.size || 0,
  })

  try {
    await completeUpload({
      fileOriginName: file.name,
      fileFormat: getFileFormat(file),
      fileSize: file.size,
      finalObjectKey,
      chunkObjectKeys,
      parentId,
    })
  } catch (error) {
    await abortUploadedFile(uploadMetas)
    throw error
  }

  setUploadItemState(uploadItemId, {
    status: "completed",
    statusText: "업로드 완료",
    progress: 100,
    uploadedBytes: file.size || 0,
  })
}
const runUploadJobs = async (uploadJobs, concurrency, parentId) => {
  const successList = new Array(uploadJobs.length)
  const workerCount = Math.min(concurrency, uploadJobs.length)
  let nextJobIndex = 0
  let firstError = null

  const worker = async () => {
    while (true) {
      if (firstError || isCancelRequested.value) {
        return
      }

      const currentJobIndex = nextJobIndex
      nextJobIndex += 1

      if (currentJobIndex >= uploadJobs.length) {
        return
      }

      const currentJob = uploadJobs[currentJobIndex]

      try {
        await uploadFileByChunks(
          currentJob.file,
          currentJob.uploadMetas,
          currentJob.uploadItemId,
        )

        if (currentJob.partitioned) {
          mergingUploadCount.value += 1

          try {
            await completeUploadedFile(
              currentJob.file,
              currentJob.uploadMetas,
              true,
              currentJob.uploadItemId,
              parentId,
            )
          } finally {
            mergingUploadCount.value = Math.max(0, mergingUploadCount.value - 1)
          }
        } else {
          await completeUploadedFile(
            currentJob.file,
            currentJob.uploadMetas,
            false,
            currentJob.uploadItemId,
            parentId,
          )
        }

        completedUploadCount.value += 1
        successList[currentJobIndex] = currentJob.file.name
      } catch (error) {
        await abortUploadedFile(currentJob.uploadMetas)
        if (isAbortError(error)) {
          setUploadItemState(currentJob.uploadItemId, {
            status: "canceled",
            statusText: "업로드 취소됨",
          })
        } else {
          setUploadItemState(currentJob.uploadItemId, {
            status: "failed",
            statusText: error?.message || "업로드 실패",
            errorMessage: error?.message || "업로드 실패",
          })
          firstError = error
        }
      } finally {
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker))

  if (firstError) {
    throw firstError
  }

  return successList.filter(Boolean)
}

const cancelActiveUploads = () => {
  if (!canCancelUploads.value) return

  isCancelRequested.value = true

  uploadItems.value.forEach((item) => {
    if (item.status === "pending" || item.status === "preparing") {
      item.status = "canceled"
      item.statusText = "업로드 취소됨"
      return
    }

    if (item.status === "uploading" || item.status === "merging") {
      item.status = "canceling"
      item.statusText = "취소 중..."
    }
  })

  activeUploadControllers.forEach((controller) => {
    controller.abort()
  })
}

const markUnfinishedUploadsStopped = (reasonText) => {
  uploadItems.value.forEach((item) => {
    if (item.status === "pending" || item.status === "preparing") {
      item.status = "failed"
      item.statusText = reasonText
    }
  })
}

const toNormalizedError = (error) => {
  if (!error) return "업로드 중 오류가 발생했습니다."
  if (typeof error === "string") return error

  if (isAbortError(error)) {
    return "업로드가 취소되었습니다."
  }

  if (error.code === "ECONNABORTED") {
    return "업로드 시간이 초과되었습니다. 서버 상태를 확인해 주세요."
  }

  if (error.response) {
    if (typeof error.response.data === "string") return error.response.data
    if (error.response.data?.message) return error.response.data.message
    if (error.response.data?.result?.message) {
      return error.response.data.result.message
    }
    return `업로드 중 오류가 발생했습니다. 상태 코드: ${error.response.status}`
  }

  if (error.message) return error.message
  return "업로드에 실패했습니다."
}

const handleUpload = async (event, uploadTypeLabel) => {
  const selectedFiles = Array.from(event?.target?.files || [])
  if (!selectedFiles.length) return

  if (!fileStore.storageSummary && !fileStore.storageLoading) {
    await fileStore.fetchStorageSummary().catch(() => {})
  }

  if (selectedFiles.length > maxUploadCount.value) {
    const message = `\uD55C \uBC88\uC5D0 \uCD5C\uB300 ${maxUploadCount.value}\uAC1C\uAE4C\uC9C0 \uC5C5\uB85C\uB4DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`
    uploadError.value = message
    emit("upload-fail", message)

    if (event?.target) {
      event.target.value = ""
    }

    return
  }

  const oversizedFile = selectedFiles.find((file) => Number(file?.size || 0) > maxUploadFileBytes.value)
  if (oversizedFile) {
    const message = `\"${oversizedFile.name}\" \uD30C\uC77C\uC740 \uD604\uC7AC \uBA64\uBC84\uC2ED \uD55C\uB3C4(${formatUploadLimitBytes(maxUploadFileBytes.value)})\uB97C \uCD08\uACFC\uD574 \uC5C5\uB85C\uB4DC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`
    uploadError.value = message
    emit("upload-fail", message)

    if (event?.target) {
      event.target.value = ""
    }

    return
  }

  const uploadParentId = fileStore.currentFolderId

  uploadError.value = ""
  uploadedFiles.value = []
  uploadPanelVisible.value = true
  uploadPanelCollapsed.value = false
  isUploading.value = true
  isCancelRequested.value = false
  totalUploadCount.value = selectedFiles.length
  completedUploadCount.value = 0
  mergingUploadCount.value = 0
  uploadItems.value = selectedFiles.map((file, index) => createUploadItem(file, index))

  try {

    const invalidName = selectedFiles.find(
      (file) => !file?.name || typeof file.name !== "string",
    )
    if (invalidName) {
      throw new Error("이름이 올바르지 않은 파일이 포함되어 있습니다.")
    }

    const invalidFormat = selectedFiles.find((file) => {
      const idx = file.name.lastIndexOf(".")
      return idx <= 0 || idx === file.name.length - 1
    })
    if (invalidFormat) {
      throw new Error(`"${invalidFormat.name}" 파일은 확장자가 없습니다.`)
    }

    uploadItems.value.forEach((item) => {
      item.status = "preparing"
      item.statusText = "업로드 정보 준비 중"
    })

    const response = await uploadFiles(selectedFiles, uploadParentId)
    const presignedResponses = parseUploadResponse(response?.data)

    if (!Array.isArray(presignedResponses) || presignedResponses.length === 0) {
      throw new Error("업로드 응답이 비어 있습니다.")
    }

    uploadItems.value.forEach((item) => {
      item.status = "pending"
      item.statusText = "업로드 대기 중"
    })

    const uploadJobs = buildUploadJobs(
      selectedFiles,
      presignedResponses,
      uploadItems.value,
    ).map((job) => ({
      file: job.file,
      uploadMetas: job.metas,
      partitioned: job.partitioned,
      uploadItemId: job.itemId,
    }))

    const successList = await runUploadJobs(
      uploadJobs,
      normalizeUploadConcurrency(uploadConcurrency.value),
      uploadParentId,
    )

    if (isCancelRequested.value) {
      return
    }

    uploadedFiles.value = successList
    if (fileStore.driveHasLoaded && !fileStore.hasLoaded) {
      await fileStore.refreshDrivePage().catch(() => {})
    } else {
      await fileStore.fetchFiles().catch(() => {})
    }
    emit("upload-complete", uploadedFiles.value)
    if (import.meta.env.DEV) console.debug(`[${uploadTypeLabel}] 업로드 완료:`, uploadedFiles.value);
  } catch (error) {
    const message = toNormalizedError(error)

    if (!isAbortError(error)) {
      markUnfinishedUploadsStopped("업로드 중단됨")
    }

    uploadError.value = message
    emit("upload-fail", message)
    console.error(`[${uploadTypeLabel}] 업로드 실패:`, error)
  } finally {
    isUploading.value = false
      mergingUploadCount.value = 0
    activeUploadControllers.clear()
    closeDropdown()

    if (event?.target) {
      event.target.value = ""
    }
  }
}

const handleFileChange = async (event) => {
  await handleUpload(event, "파일")
}

const handleFolderChange = async (event) => {
  await handleUpload(event, "폴더")
}

const handleKeydown = (event) => {
  if (event.key === "Escape" && isDropdownOpen.value) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleKeydown)
  window.addEventListener("resize", handleViewportResize)
  applyUploadPanelSafeArea()
  tickTimerId = window.setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeydown)
  window.removeEventListener("resize", handleViewportResize)

  if (tickTimerId) {
    window.clearInterval(tickTimerId)
  }

  activeUploadControllers.forEach((controller) => {
    controller.abort()
  })
  activeUploadControllers.clear()
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--upload-panel-safe-space", "0px")
  }
})
</script>
