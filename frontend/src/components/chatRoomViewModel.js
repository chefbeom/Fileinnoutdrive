export const DELETED_MESSAGE_TEXT = "삭제된 메시지입니다.";
export const CHAT_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_FILE_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;

const IMAGE_FILE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg)$/;

const defaultNow = () => new Date().toISOString();
const defaultIdFactory = () => `${Date.now()}${Math.random()}`;

export function isDeletedChatMessagePayload(payload = {}) {
  return Boolean(payload.deleted) ||
    (
      String(payload.contents ?? payload.text ?? "").trim() === DELETED_MESSAGE_TEXT &&
      !payload.fileUrl &&
      !payload.fileName
    );
}

export function toChatMessage(payload = {}, options = {}) {
  const deleted = isDeletedChatMessagePayload(payload);
  const now = options.now || defaultNow;

  return {
    id: payload.idx ?? payload.id,
    sender: payload.senderNickname ?? payload.sender ?? options.fallbackSender ?? "Guest",
    text: deleted ? DELETED_MESSAGE_TEXT : (payload.contents ?? payload.text ?? ""),
    time: payload.createdAt ?? payload.time ?? now(),
    isMe: Boolean(options.isMe),
    isPending: Boolean(options.isPending),
    deleted,
    messageUnreadCount: payload.messageUnreadCount ?? 0,
    profileImageUrl: deleted ? null : (payload.profileImageUrl ?? null),
    fileUrl: deleted ? null : (payload.fileUrl ?? null),
    fileName: deleted ? null : (payload.fileName ?? null),
    fileType: deleted ? null : (payload.fileType ?? null),
    fileSize: deleted ? null : (payload.fileSize ?? null),
    messageType: deleted ? "TEXT" : (payload.messageType || "TEXT"),
  };
}

export function getChatPreviewText(message = {}) {
  const text = String(message.text ?? message.contents ?? "").trim();
  if (text) return text;

  const normalizedMessageType = String(message.messageType ?? "").toUpperCase();
  if (normalizedMessageType === "IMAGE") return "사진";
  if (normalizedMessageType === "FILE") return "문서";

  const normalizedFileType = String(message.fileType ?? "").toLowerCase();
  if (normalizedFileType.startsWith("image/")) return "사진";
  if (normalizedFileType) return "문서";

  const fileHint = String(message.fileName ?? message.fileUrl ?? "").toLowerCase();
  if (IMAGE_FILE_EXTENSION_PATTERN.test(fileHint)) return "사진";
  if (fileHint) return "문서";

  return "";
}

export function applyDeletedChatMessage(messages = [], messageId, deletedText = DELETED_MESSAGE_TEXT) {
  const target = messages.find((msg) => msg.id === messageId);
  if (!target) return null;

  target.text = deletedText || DELETED_MESSAGE_TEXT;
  target.deleted = true;
  target.isPending = false;
  target.fileUrl = null;
  target.fileName = null;
  target.fileType = null;
  target.fileSize = null;
  target.messageType = "TEXT";
  return target;
}

export function formatChatTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).format(date);
}

export function formatChatDateTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).format(date);
}

export function getChatMessageDateKey(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function formatChatMessageDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function shouldShowChatDateDivider(messages = [], index = 0) {
  const currentMessage = messages[index];
  if (!currentMessage) return false;
  if (index === 0) return true;

  const previousMessage = messages[index - 1];
  return getChatMessageDateKey(currentMessage.time) !== getChatMessageDateKey(previousMessage?.time);
}

export function normalizeChatParticipant(participant = {}, currentUserIdx = null) {
  const userIdx = participant.userIdx;

  return {
    id: participant.id,
    userIdx,
    nickname: participant.nickname || participant.email || "사용자",
    email: participant.email || "",
    customRoomName: participant.customRoomName || "",
    joinedAt: participant.joinedAt || null,
    lastReadMessageId: Number(participant.lastReadMessageId || 0),
    isFavorite: Boolean(participant.isFavorite ?? participant.favorite),
    isMe: Boolean(participant.isMe ?? participant.me ?? Number(userIdx) === Number(currentUserIdx)),
  };
}

export const participantInitial = (participant = {}) =>
  String(participant.nickname || participant.email || "?").charAt(0).toUpperCase();

export function getLatestChatMessageId(messages = []) {
  return messages.reduce((latest, message) => {
    const messageId = Number(message.id);
    return Number.isFinite(messageId) ? Math.max(latest, messageId) : latest;
  }, 0);
}

export function applyChatParticipantReadState(participants = [], userIdx, lastReadMessageId = null) {
  const normalizedUserIdx = Number(userIdx);
  const nextReadId = Number(lastReadMessageId);

  if (!Number.isFinite(normalizedUserIdx) || !Number.isFinite(nextReadId) || nextReadId <= 0) return false;

  const participant = participants.find((item) => Number(item.userIdx) === normalizedUserIdx);
  if (!participant) return false;

  participant.lastReadMessageId = Math.max(Number(participant.lastReadMessageId || 0), nextReadId);
  return true;
}

export function getChatReadersForMessage(message = {}, participants = []) {
  const messageId = Number(message.id);
  if (!message.isMe || !Number.isFinite(messageId)) return [];

  return participants.filter((participant) => (
    !participant.isMe && Number(participant.lastReadMessageId || 0) >= messageId
  ));
}

export function formatChatReadPeople(readers = []) {
  if (!readers.length) return "";
  if (readers.length <= 2) return `${readers.map((reader) => reader.nickname).join(", ")} 읽음`;
  return `${readers[0].nickname} 외 ${readers.length - 1}명 읽음`;
}

export const buildChatReadPeopleTitle = (readers = []) =>
  readers.map((reader) => reader.nickname).join(", ");

export function getChatMessageUnreadCount(message = {}, participants = []) {
  if (!message.isMe) return 0;

  const messageId = Number(message.id);
  if (!Number.isFinite(messageId) || !participants.length) {
    return Number(message.messageUnreadCount || 0);
  }

  return participants.filter((participant) => (
    !participant.isMe && Number(participant.lastReadMessageId || 0) < messageId
  )).length;
}

export function participantReadLabel(participant = {}) {
  const lastReadMessageId = Number(participant.lastReadMessageId || 0);
  return lastReadMessageId > 0 ? `#${lastReadMessageId}까지 읽음` : "읽음 없음";
}

export function sortChatMessages(messages = []) {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left.time).getTime();
    const rightTime = new Date(right.time).getTime();
    if (leftTime !== rightTime) return leftTime - rightTime;
    return (left.id > right.id) ? 1 : -1;
  });
}

export function buildPendingChatTextMessage({ text = "", sender = "Guest", profileImageUrl = null, now = defaultNow, idFactory = defaultIdFactory } = {}) {
  return {
    id: `temp-${idFactory()}`,
    sender,
    text,
    time: now(),
    isMe: true,
    isPending: true,
    messageUnreadCount: 0,
    profileImageUrl,
  };
}

export function isChatUploadImage(file = {}) {
  return String(file.type || "").startsWith("image/");
}

export function getChatUploadMeta(file = {}) {
  const isImage = isChatUploadImage(file);
  return {
    isImage,
    maxSize: isImage ? CHAT_IMAGE_UPLOAD_MAX_BYTES : CHAT_FILE_UPLOAD_MAX_BYTES,
    messageType: isImage ? "IMAGE" : "FILE",
    oversizeMessage: isImage ? "이미지는 5MB 이하만 업로드 가능합니다." : "파일은 30MB 이하만 업로드 가능합니다.",
  };
}

export function validateChatUploadFile(file = null) {
  if (!file) {
    return { valid: false, message: "" };
  }

  const meta = getChatUploadMeta(file);
  if (Number(file.size || 0) > meta.maxSize) {
    return { valid: false, message: meta.oversizeMessage, meta };
  }

  return { valid: true, message: "", meta };
}

export function buildChatFileMessagePayload({ file = {}, fileUrl = "", messageType = getChatUploadMeta(file).messageType } = {}) {
  return {
    contents: "",
    fileUrl,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    messageType,
  };
}

export function buildPendingChatFileMessage({ file = {}, fileUrl = "", sender = "Guest", profileImageUrl = null, now = defaultNow, idFactory = defaultIdFactory } = {}) {
  return {
    ...buildPendingChatTextMessage({ text: "", sender, profileImageUrl, now, idFactory }),
    fileUrl,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    messageType: getChatUploadMeta(file).messageType,
    contents: "",
  };
}
