import { describe, expect, it } from "vitest";

import {
  CHAT_IMAGE_UPLOAD_MAX_BYTES,
  DELETED_MESSAGE_TEXT,
  applyChatParticipantReadState,
  applyDeletedChatMessage,
  buildChatFileMessagePayload,
  buildChatReadPeopleTitle,
  buildPendingChatFileMessage,
  buildPendingChatTextMessage,
  formatChatReadPeople,
  getChatMessageUnreadCount,
  getChatPreviewText,
  getChatReadersForMessage,
  getLatestChatMessageId,
  isDeletedChatMessagePayload,
  normalizeChatParticipant,
  participantInitial,
  participantReadLabel,
  shouldShowChatDateDivider,
  sortChatMessages,
  toChatMessage,
  validateChatUploadFile,
} from "./chatRoomViewModel.js";

describe("chatRoomViewModel", () => {
  it("normalizes messages and preview labels", () => {
    const deletedPayload = { idx: 7, contents: DELETED_MESSAGE_TEXT };

    expect(isDeletedChatMessagePayload(deletedPayload)).toBe(true);
    expect(toChatMessage(deletedPayload, {
      fallbackSender: "관리자",
      isMe: true,
      now: () => "2026-07-05T09:00:00",
    })).toMatchObject({
      id: 7,
      sender: "관리자",
      text: DELETED_MESSAGE_TEXT,
      deleted: true,
      fileUrl: null,
      messageType: "TEXT",
    });

    expect(getChatPreviewText({ text: " 안녕하세요 " })).toBe("안녕하세요");
    expect(getChatPreviewText({ messageType: "IMAGE" })).toBe("사진");
    expect(getChatPreviewText({ fileName: "report.pdf" })).toBe("문서");
    expect(getChatPreviewText({ fileUrl: "/files/sample.webp" })).toBe("사진");
  });

  it("sorts messages, builds date dividers, and applies deletion state", () => {
    const messages = [
      { id: 2, time: "2026-07-05T10:01:00", text: "b", fileUrl: "/b" },
      { id: 1, time: "2026-07-05T10:00:00", text: "a" },
      { id: 3, time: "2026-07-06T09:00:00", text: "c" },
    ];
    const sorted = sortChatMessages(messages);

    expect(sorted.map((message) => message.id)).toEqual([1, 2, 3]);
    expect(shouldShowChatDateDivider(sorted, 0)).toBe(true);
    expect(shouldShowChatDateDivider(sorted, 1)).toBe(false);
    expect(shouldShowChatDateDivider(sorted, 2)).toBe(true);
    expect(getLatestChatMessageId(sorted)).toBe(3);

    const deleted = applyDeletedChatMessage(sorted, 2);
    expect(deleted).toMatchObject({
      id: 2,
      text: DELETED_MESSAGE_TEXT,
      deleted: true,
      fileUrl: null,
      messageType: "TEXT",
    });
  });

  it("normalizes participants and calculates read status", () => {
    const participants = [
      normalizeChatParticipant({ id: 1, userIdx: 10, nickname: "나", lastReadMessageId: 0 }, 10),
      normalizeChatParticipant({ id: 2, userIdx: 20, email: "reader@example.com", lastReadMessageId: 12 }, 10),
      normalizeChatParticipant({ id: 3, userIdx: 30, nickname: "지연", lastReadMessageId: 5 }, 10),
    ];

    expect(participants[0].isMe).toBe(true);
    expect(participants[1].nickname).toBe("reader@example.com");
    expect(participantInitial(participants[2])).toBe("지");

    expect(applyChatParticipantReadState(participants, 30, 11)).toBe(true);
    expect(participants[2].lastReadMessageId).toBe(11);

    const readers = getChatReadersForMessage({ id: 11, isMe: true }, participants);
    expect(readers.map((reader) => reader.userIdx)).toEqual([20, 30]);
    expect(formatChatReadPeople(readers)).toBe("reader@example.com, 지연 읽음");
    expect(buildChatReadPeopleTitle(readers)).toBe("reader@example.com, 지연");
    expect(getChatMessageUnreadCount({ id: 12, isMe: true }, participants)).toBe(1);
    expect(getChatMessageUnreadCount({ id: "temp", isMe: true, messageUnreadCount: 4 }, participants)).toBe(4);
    expect(participantReadLabel(participants[2])).toBe("#11까지 읽음");
  });

  it("builds pending messages and validates upload payloads", () => {
    const now = () => "2026-07-05T12:00:00";
    const idFactory = () => "fixed";
    const image = { name: "photo.png", type: "image/png", size: 1024 };

    expect(buildPendingChatTextMessage({ text: "메시지", sender: "나", now, idFactory })).toMatchObject({
      id: "temp-fixed",
      sender: "나",
      text: "메시지",
      time: "2026-07-05T12:00:00",
      isMe: true,
      isPending: true,
    });

    expect(validateChatUploadFile({ ...image, size: CHAT_IMAGE_UPLOAD_MAX_BYTES + 1 })).toMatchObject({
      valid: false,
      message: "이미지는 5MB 이하만 업로드 가능합니다.",
    });
    expect(validateChatUploadFile(image)).toMatchObject({
      valid: true,
      meta: { messageType: "IMAGE" },
    });

    expect(buildPendingChatFileMessage({
      file: image,
      fileUrl: "/chat/photo.png",
      sender: "나",
      profileImageUrl: "/profile.png",
      now,
      idFactory,
    })).toMatchObject({
      id: "temp-fixed",
      fileUrl: "/chat/photo.png",
      fileName: "photo.png",
      messageType: "IMAGE",
      contents: "",
    });

    expect(buildChatFileMessagePayload({ file: image, fileUrl: "/chat/photo.png" })).toEqual({
      contents: "",
      fileUrl: "/chat/photo.png",
      fileName: "photo.png",
      fileType: "image/png",
      fileSize: 1024,
      messageType: "IMAGE",
    });
  });
});
