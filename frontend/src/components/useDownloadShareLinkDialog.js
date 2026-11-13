import { computed, ref } from "vue";
import {
  createDownloadShareLink,
  fetchFileDownloadShareLinks,
  revokeDownloadShareLink,
} from "@/api/filesApi.js";
import {
  buildPublicDirectDownloadUrl,
  buildPublicSharePageUrl,
} from "@/api/publicShareLinkApi.js";

export const DURATION_PRESET_OPTIONS = [
  { key: "10", label: "10분", minutes: 10 },
  { key: "30", label: "30분", minutes: 30 },
  { key: "60", label: "1시간", minutes: 60 },
  { key: "360", label: "6시간", minutes: 360 },
  { key: "1440", label: "24시간", minutes: 1440 },
  { key: "10080", label: "7일", minutes: 10080 },
  { key: "custom_minutes", label: "직접 입력 (분)", minutes: null },
  { key: "custom_datetime", label: "만료 시각 지정", minutes: null },
];

export const DOWNLOAD_LIMIT_PRESET_OPTIONS = [
  { key: "1", label: "1회", count: 1 },
  { key: "3", label: "3회", count: 3 },
  { key: "5", label: "5회", count: 5 },
  { key: "10", label: "10회", count: 10 },
  { key: "unlimited", label: "무제한", count: null },
  { key: "custom", label: "직접 입력", count: null },
];

const toLocalDatetimeInputValue = (date) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const copyTextFallback = async (text) => {
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below handles insecure contexts or mobile permission quirks.
    }
  }
  if (typeof document === "undefined") {
    return false;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  return ok;
};

/**
 * Manages state and validation for creating, inspecting, copying, and revoking
 * time- and download-count-limited presigned download share links.
 */
export function useDownloadShareLinkDialog({ onError } = {}) {
  const targetFile = ref(null);
  const durationMode = ref("30");
  const customMinutes = ref(30);
  const customExpiresAt = ref("");
  const limitMode = ref("1");
  const customMaxDownloads = ref(1);
  const password = ref("");

  const issuedLink = ref(null);
  const existingLinks = ref([]);
  const isLoadingLinks = ref(false);
  const isCreating = ref(false);
  const revokingLinkIdx = ref(null);
  const errorMessage = ref("");
  const copiedKey = ref("");
  let copiedTimer = null;

  const isOpen = computed(() => Boolean(targetFile.value));

  const resolvedDurationMinutes = computed(() => {
    if (durationMode.value === "custom_minutes") {
      const parsed = Number(customMinutes.value);
      return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
    }
    if (durationMode.value === "custom_datetime") {
      return null;
    }
    const preset = DURATION_PRESET_OPTIONS.find((opt) => opt.key === durationMode.value);
    return preset?.minutes ?? 30;
  });

  const resolvedMaxDownloads = computed(() => {
    if (limitMode.value === "unlimited") {
      return null;
    }
    if (limitMode.value === "custom") {
      const parsed = Number(customMaxDownloads.value);
      return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
    }
    const preset = DOWNLOAD_LIMIT_PRESET_OPTIONS.find((opt) => opt.key === limitMode.value);
    return preset?.count ?? 1;
  });

  const resetFormDefaults = () => {
    durationMode.value = "30";
    customMinutes.value = 30;
    const defaultCustom = new Date(Date.now() + 60 * 60 * 1000);
    customExpiresAt.value = toLocalDatetimeInputValue(defaultCustom);
    limitMode.value = "1";
    customMaxDownloads.value = 1;
    password.value = "";
    issuedLink.value = null;
    errorMessage.value = "";
    copiedKey.value = "";
  };

  const loadExistingLinks = async (fileIdx) => {
    if (!fileIdx) {
      existingLinks.value = [];
      return;
    }
    isLoadingLinks.value = true;
    try {
      const list = await fetchFileDownloadShareLinks(fileIdx);
      existingLinks.value = Array.isArray(list) ? list : [];
    } catch (error) {
      existingLinks.value = [];
      errorMessage.value =
        error?.response?.data?.message || error?.message || "기존 다운로드 링크를 불러오지 못했습니다.";
    } finally {
      isLoadingLinks.value = false;
    }
  };

  const openDialog = async (file) => {
    if (!file) return;
    if (file.nodeType === "FOLDER" || file.type === "folder") {
      onError?.("폴더는 다운로드 링크 공유 대상이 아닙니다. 개별 파일을 선택해 주세요.");
      return;
    }
    if (file.lockedFile) {
      onError?.("잠긴 파일은 잠금 해제 후 다운로드 링크를 발급할 수 있습니다.");
      return;
    }
    if (file.sharedWithMe) {
      onError?.("공유받은 파일이 아닌 내 드라이브 파일만 다운로드 링크를 발급할 수 있습니다.");
      return;
    }

    targetFile.value = file;
    resetFormDefaults();
    await loadExistingLinks(file.idx ?? file.id);
  };

  const closeDialog = () => {
    targetFile.value = null;
    issuedLink.value = null;
    existingLinks.value = [];
    errorMessage.value = "";
    password.value = "";
    copiedKey.value = "";
  };

  const buildCreatePayload = () => {
    const payload = {};

    if (durationMode.value === "custom_datetime") {
      if (!customExpiresAt.value) {
        throw new Error("만료 일시를 선택해 주세요.");
      }
      const targetDate = new Date(customExpiresAt.value);
      if (Number.isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now() + 60 * 1000) {
        throw new Error("만료 시각은 현재 시각보다 최소 1분 이후여야 합니다.");
      }
      const diffMinutes = Math.ceil((targetDate.getTime() - Date.now()) / 60000);
      if (diffMinutes > 43200) {
        throw new Error("유효 기간은 최대 30일(43,200분)까지 설정할 수 있습니다.");
      }
      payload.expiresInMinutes = diffMinutes;
    } else {
      const minutes = resolvedDurationMinutes.value;
      if (!minutes || minutes < 1 || minutes > 43200) {
        throw new Error("유효 시간은 1분에서 43,200분(30일) 사이로 입력해 주세요.");
      }
      payload.expiresInMinutes = minutes;
    }

    const maxDownloads = resolvedMaxDownloads.value;
    if (maxDownloads !== null && (maxDownloads < 1 || maxDownloads > 10000)) {
      throw new Error("다운로드 횟수 제한은 1회에서 10,000회 사이로 입력해 주세요.");
    }
    payload.maxDownloads = maxDownloads;

    const trimmedPassword = String(password.value || "").trim();
    if (trimmedPassword) {
      if (trimmedPassword.length < 4 || trimmedPassword.length > 64) {
        throw new Error("비밀번호는 4자 이상 64자 이하로 입력해 주세요.");
      }
      payload.password = trimmedPassword;
    }

    return payload;
  };

  const createLink = async () => {
    const fileIdx = targetFile.value?.idx ?? targetFile.value?.id;
    if (!fileIdx || isCreating.value) {
      return null;
    }
    errorMessage.value = "";

    let payload;
    try {
      payload = buildCreatePayload();
    } catch (validationError) {
      errorMessage.value = validationError.message;
      return null;
    }

    isCreating.value = true;
    try {
      const created = await createDownloadShareLink(fileIdx, payload);
      issuedLink.value = created;
      existingLinks.value = [created, ...existingLinks.value.filter((item) => item.idx !== created?.idx)];
      password.value = "";
      return created;
    } catch (error) {
      errorMessage.value =
        error?.response?.data?.message || error?.message || "다운로드 링크 발급에 실패했습니다.";
      return null;
    } finally {
      isCreating.value = false;
    }
  };

  const revokeLink = async (linkIdx) => {
    if (!linkIdx || revokingLinkIdx.value) {
      return;
    }
    revokingLinkIdx.value = linkIdx;
    errorMessage.value = "";
    try {
      const updated = await revokeDownloadShareLink(linkIdx);
      existingLinks.value = existingLinks.value.map((item) =>
        item.idx === linkIdx ? { ...item, ...updated } : item,
      );
      if (issuedLink.value?.idx === linkIdx) {
        issuedLink.value = { ...issuedLink.value, ...updated };
      }
    } catch (error) {
      errorMessage.value =
        error?.response?.data?.message || error?.message || "링크 중단에 실패했습니다.";
    } finally {
      revokingLinkIdx.value = null;
    }
  };

  const getSharePageUrl = (token) => buildPublicSharePageUrl(token);
  const getDirectDownloadUrl = (token) => buildPublicDirectDownloadUrl(token);

  const copyLinkUrl = async (token, type = "page", keyPrefix = "issued") => {
    const url = type === "direct" ? getDirectDownloadUrl(token) : getSharePageUrl(token);
    const copied = await copyTextFallback(url);
    if (!copied) {
      errorMessage.value = "클립보드 복사에 실패했습니다. 링크를 직접 선택해 복사해 주세요.";
      return false;
    }
    copiedKey.value = `${keyPrefix}:${type}:${token}`;
    if (copiedTimer) {
      clearTimeout(copiedTimer);
    }
    copiedTimer = setTimeout(() => {
      copiedKey.value = "";
    }, 2200);
    return true;
  };

  return {
    targetFile,
    isOpen,
    durationMode,
    customMinutes,
    customExpiresAt,
    limitMode,
    customMaxDownloads,
    password,
    issuedLink,
    existingLinks,
    isLoadingLinks,
    isCreating,
    revokingLinkIdx,
    errorMessage,
    copiedKey,
    resolvedDurationMinutes,
    resolvedMaxDownloads,
    openDialog,
    closeDialog,
    createLink,
    revokeLink,
    getSharePageUrl,
    getDirectDownloadUrl,
    copyLinkUrl,
  };
}
