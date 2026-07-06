import { describe, expect, it } from "vitest";

import {
  buildCustomSizeRangeLabel,
  canUseGamesHub,
  chatNotificationDedupeKey,
  countActiveSearchFilters,
  extractNotificationListPayload,
  findHeaderNotificationIndex,
  getAvatarInitials,
  getChatNotificationMessage,
  getHeaderUserEmail,
  getHeaderUserName,
  getSearchPlaceholder,
  toHeaderNotificationItem,
} from "./headerViewModel.js";

describe("headerViewModel", () => {
  it("builds search labels and active filter counts", () => {
    expect(buildCustomSizeRangeLabel({ sizeFilter: "all" })).toBe("");
    expect(buildCustomSizeRangeLabel({ sizeFilter: "custom" })).toBe("범위를 입력하세요");
    expect(buildCustomSizeRangeLabel({ sizeFilter: "custom", customMinSize: "10", customMaxSize: "50" })).toBe("10MB ~ 50MB");
    expect(buildCustomSizeRangeLabel({ sizeFilter: "custom", customMinSize: "10" })).toBe("10MB 이상");
    expect(buildCustomSizeRangeLabel({ sizeFilter: "custom", customMaxSize: "50" })).toBe("50MB 이하");

    expect(countActiveSearchFilters({ searchQuery: "plan", extensionFilter: "pdf", sizeFilter: "all", statusFilter: "locked" }, true)).toBe(3);
    expect(countActiveSearchFilters({ searchQuery: "plan", extensionFilter: "pdf" }, false)).toBe(0);
    expect(getSearchPlaceholder(true)).toContain("파일명");
    expect(getSearchPlaceholder(false)).toContain("드라이브");
  });

  it("normalizes profile display values and feature access", () => {
    expect(getHeaderUserName({ displayName: "Admin" }, { userName: "Fallback" })).toBe("Admin");
    expect(getHeaderUserName(null, { name: "User" })).toBe("User");
    expect(getHeaderUserEmail(null, { userEmail: "user@example.com" })).toBe("user@example.com");
    expect(getAvatarInitials("kim dev")).toBe("KD");
    expect(getAvatarInitials("")).toBe("사");

    expect(canUseGamesHub({ planCode: "premium" }, null)).toBe(true);
    expect(canUseGamesHub({ adminAccount: true }, null)).toBe(true);
    expect(canUseGamesHub({}, { membershipCode: "ADMIN" })).toBe(true);
    expect(canUseGamesHub({ planCode: "free" }, { membershipCode: "free" })).toBe(false);
  });

  it("normalizes chat notification messages and items", () => {
    expect(getChatNotificationMessage({ message: "hello" })).toBe("hello");
    expect(getChatNotificationMessage({ messageType: "IMAGE" })).toBe("사진");
    expect(getChatNotificationMessage({ fileType: "application/pdf" })).toBe("문서");
    expect(getChatNotificationMessage({ fileName: "image.webp" })).toBe("사진");

    const item = toHeaderNotificationItem(
      { type: "NEW_MESSAGE", roomId: 7, title: "Room", fileType: "image/png", notificationId: 11, createdAt: "2026-07-05T00:00:00Z" },
      { relativeTimeFormatter: () => "방금", idFactory: () => 99 },
    );

    expect(item).toMatchObject({
      id: 11,
      serverRowId: 11,
      roomIdx: 7,
      type: "chat",
      title: "Room",
      message: "사진",
      time: "방금",
      unreadCount: 1,
    });

    expect(toHeaderNotificationItem({ type: "invite", read: true }, { idFactory: () => 99 })).toMatchObject({
      id: 99,
      processed: true,
      processedLabel: "이미 확인하셨습니다",
    });
  });

  it("finds notification indexes and extracts payload variants", () => {
    const notifications = [
      { id: 1, type: "general" },
      { type: "chat", roomIdx: 7, title: "Room" },
      { uuid: "abc", type: "invite" },
    ];

    expect(findHeaderNotificationIndex(notifications, { type: "chat", roomIdx: 7 })).toBe(1);
    expect(findHeaderNotificationIndex(notifications, { uuid: "abc" })).toBe(2);
    expect(findHeaderNotificationIndex(notifications, { id: 404 })).toBe(-1);
    expect(chatNotificationDedupeKey({ type: "chat", roomIdx: 7 })).toBe("room_7");
    expect(chatNotificationDedupeKey({ type: "chat", title: "Room" })).toBe("title_Room");
    expect(chatNotificationDedupeKey({ type: "general" })).toBeNull();

    expect(extractNotificationListPayload([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(extractNotificationListPayload({ result: { body: [{ id: 2 }] } })).toEqual([{ id: 2 }]);
    expect(extractNotificationListPayload({ result: [{ id: 3 }] })).toEqual([{ id: 3 }]);
    expect(extractNotificationListPayload({ data: [{ id: 4 }] })).toEqual([{ id: 4 }]);
    expect(extractNotificationListPayload(null)).toEqual([]);
  });
});