import { formatRelativeTime } from "@/utils/formatRelativeTime.js";

export function buildCustomSizeRangeLabel(searchState = {}) {
  if (searchState.sizeFilter !== "custom") {
    return "";
  }

  const min = searchState.customMinSize?.trim();
  const max = searchState.customMaxSize?.trim();

  if (!min && !max) {
    return "범위를 입력하세요";
  }
  if (min && max) {
    return `${min}MB ~ ${max}MB`;
  }
  if (min) {
    return `${min}MB 이상`;
  }
  return `${max}MB 이하`;
}

export function countActiveSearchFilters(searchState = {}, canUseFileSearch = false) {
  if (!canUseFileSearch) {
    return 0;
  }

  let count = 0;
  if (String(searchState.searchQuery || "").trim()) count += 1;
  if ((searchState.extensionFilter || "all") !== "all") count += 1;
  if ((searchState.sizeFilter || "all") !== "all") count += 1;
  if ((searchState.statusFilter || "all") !== "all") count += 1;

  return count;
}

export function getSearchPlaceholder(canUseFileSearch = false) {
  return canUseFileSearch
    ? "파일명, 확장자, 공유자 이메일을 검색하세요"
    : "파일 검색은 드라이브 화면에서 사용할 수 있습니다.";
}

export function getHeaderUserName(settingsProfile, authUser) {
  return (
    settingsProfile?.displayName ||
    authUser?.userName ||
    authUser?.name ||
    "사용자"
  );
}

export function getHeaderUserEmail(settingsProfile, authUser) {
  return (
    settingsProfile?.email ||
    authUser?.email ||
    authUser?.userEmail ||
    "이메일 정보 없음"
  );
}

export const getHeaderUserLocaleLabel = (settingsProfile) => settingsProfile?.localeCode || "KO";
export const getHeaderMembershipLabel = (settingsProfile) => settingsProfile?.membershipLabel || "FREE MEMBER";
export const getHeaderProfileImage = (settingsProfile) => settingsProfile?.profileImageUrl || "";

export function canUseGamesHub(planCapabilities, settingsProfile) {
  const capability = planCapabilities || {};
  const planCode = String(capability.planCode || "").toUpperCase();
  const settingsMembershipCode = String(settingsProfile?.membershipCode || "").toUpperCase();

  return (
    Boolean(capability.adminAccount) ||
    planCode === "PREMIUM" ||
    planCode === "ADMIN" ||
    settingsMembershipCode === "PREMIUM" ||
    settingsMembershipCode === "ADMIN"
  );
}

export function getAvatarInitials(userName) {
  return (
    String(userName || "사용자")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((token) => token[0]?.toUpperCase() || "")
      .join("") || "U"
  );
}

export function getChatNotificationMessage(item = {}) {
  const text = String(item.message ?? item.contents ?? item.lastMsg ?? "").trim();
  if (text) return text;

  const normalizedMessageType = String(item.messageType ?? "").toUpperCase();
  if (normalizedMessageType === "IMAGE") return "사진";
  if (normalizedMessageType === "FILE") return "문서";

  const normalizedFileType = String(item.fileType ?? "").toLowerCase();
  if (normalizedFileType.startsWith("image/")) return "사진";
  if (normalizedFileType) return "문서";

  const fileHint = String(item.fileName ?? item.fileUrl ?? "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fileHint)) return "사진";
  if (fileHint) return "문서";

  return "";
}

export function toHeaderNotificationItem(
  item = {},
  options = {},
) {
  const relativeTimeFormatter = options.relativeTimeFormatter || formatRelativeTime;
  const idFactory = options.idFactory || Date.now;
  const rawType = item.type ?? item.notifType ?? "general";
  const isChat = rawType === "message" || rawType === "NEW_MESSAGE";
  const type = isChat ? "chat" : rawType;
  const read = Boolean(item.read);
  const actionableTypes = ["invite", "group_invite", "relationship_invite"];
  const processed = actionableTypes.includes(type) && read;
  const roomIdxForKey =
    item.roomIdx ?? item.roomId ?? item.chatRoomIdx ?? item.referenceId ?? null;
  const serverRowId = isChat
    ? (item.notificationId ?? item.notificationIdx ?? null)
    : (item.notificationId ?? item.idx ?? item.id ?? null);
  const displayId =
    serverRowId ??
    (isChat ? `local-chat-${roomIdxForKey ?? "na"}` : idFactory());

  return {
    id: displayId,
    serverRowId,
    uuid: item.uuid ?? null,
    referenceId: item.referenceId ?? null,
    roomIdx: roomIdxForKey,
    type,
    title: item.title ?? "알림",
    message: isChat ? getChatNotificationMessage(item) : (item.message ?? item.contents ?? item.lastMsg ?? ""),
    createdAt: item.createdAt ?? null,
    time: item.createdAt ? relativeTimeFormatter(item.createdAt) : "방금 전",
    read,
    unreadCount: isChat ? (item.unreadCount ?? 1) : 0,
    processed,
    processedLabel: processed ? "이미 확인하셨습니다" : "",
  };
}

export function findHeaderNotificationIndex(notifications = [], target = {}) {
  return notifications.findIndex((item) => {
    if (target.type === "chat" && item.type === "chat") {
      if (target.roomIdx != null && item.roomIdx != null) return target.roomIdx === item.roomIdx;
      return target.title === item.title;
    }
    return (
      (target.id != null && item.id === target.id) ||
      (target.uuid && item.uuid === target.uuid)
    );
  });
}

export function extractNotificationListPayload(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.result?.body)) return raw.result.body;
  if (Array.isArray(raw.result)) return raw.result;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.body)) return raw.body;
  return [];
}

export function chatNotificationDedupeKey(notification) {
  if (!notification || notification.type !== "chat") return null;
  return notification.roomIdx != null
    ? `room_${notification.roomIdx}`
    : `title_${notification.title}`;
}