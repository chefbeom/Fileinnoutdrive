export const PARTITION_SIZE_BYTES = 100 * 1024 * 1024
export const CHUNK_SIZE_BYTES = 80 * 1024 * 1024
export const DEFAULT_UPLOAD_CONCURRENCY = 3
export const MAX_UPLOAD_CONCURRENCY = 5
export const UPLOAD_CONCURRENCY_STORAGE_KEY = 'file-upload-concurrency'
export const uploadConcurrencyOptions = Object.freeze([1, 2, 3, 4, 5])
export const ACTIVE_UPLOAD_STATUSES = new Set([
  'preparing',
  'pending',
  'uploading',
  'merging',
  'canceling',
])
export const SPEED_SAMPLE_WINDOW_MS = 12000
export const MAX_SPEED_SAMPLES = 8
export const MIN_PROGRESS_SAMPLE_INTERVAL_MS = 400

export const normalizeUploadConcurrency = (value) => {
  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue)) {
    return DEFAULT_UPLOAD_CONCURRENCY
  }

  return Math.min(MAX_UPLOAD_CONCURRENCY, Math.max(1, parsedValue))
}
