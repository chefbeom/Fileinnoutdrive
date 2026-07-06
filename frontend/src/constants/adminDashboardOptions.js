export const DISPLAY_UNITS = Object.freeze([
  { label: "B", value: "B", bytes: 1 },
  { label: "KB", value: "KB", bytes: 1024 },
  { label: "MB", value: "MB", bytes: 1024 ** 2 },
  { label: "GB", value: "GB", bytes: 1024 ** 3 },
  { label: "TB", value: "TB", bytes: 1024 ** 4 },
  { label: "PB", value: "PB", bytes: 1024 ** 5 },
]);

export const VISUAL_COLORS = Object.freeze([
  "#2563eb",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
]);

export const STORAGE_RANGE_OPTIONS = Object.freeze([
  { label: "1시간", value: "1H" },
  { label: "12시간", value: "12H" },
  { label: "24시간", value: "24H" },
  { label: "1일", value: "1D" },
  { label: "3일", value: "3D" },
  { label: "7일", value: "7D" },
  { label: "4주", value: "4W" },
]);

export const ADMIN_SECTIONS = Object.freeze([
  { value: "users", label: "사용자 관리" },
  { value: "storage", label: "스토리지 통계 및 분석" },
  { value: "plans", label: "플랜 / 결제 비중 통계 분석" },
  { value: "shareAudit", label: "공유 감사 로그" },
  { value: "sessions", label: "\uC138\uC158 \uAD00\uB9AC" },
]);
