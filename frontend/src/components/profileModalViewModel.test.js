import { describe, expect, it } from "vitest";

import {
  ACCEPTED_PROFILE_IMAGE_TYPES,
  GROUP_SECTIONS,
  LOCALE_OPTIONS,
  PROFILE_TABS,
  REGION_OPTIONS,
  buildProfileImageFeedback,
  buildProfileUpdatePayload,
  buildSavedAuthUser,
  createDefaultProfileForm,
  formatProfileDate,
  getProfileErrorMessage,
  getProfileInitials,
  getProfileMembershipProduct,
  getStorageUsageWidth,
  resolveMembershipLabel,
  toProfileForm,
  validateProfileImageFile,
} from "./profileModalViewModel.js";

describe("profileModalViewModel", () => {
  it("exports modal options and default form values", () => {
    expect(PROFILE_TABS.map((tab) => tab.id)).toEqual(["group", "profile", "security", "notification", "language", "billing"]);
    expect(GROUP_SECTIONS.map((section) => section.id)).toContain("manage");
    expect(LOCALE_OPTIONS.map((option) => option.code)).toEqual(["KO", "EN", "JA"]);
    expect(REGION_OPTIONS.map((option) => option.code)).toEqual(["KR", "US", "JP"]);
    expect(createDefaultProfileForm()).toMatchObject({
      role: "ROLE_USER",
      localeCode: "KO",
      membershipCode: "FREE",
      storagePlanLabel: "기본 20GB",
    });
  });

  it("normalizes profile data and display labels", () => {
    const form = toProfileForm({
      displayName: "",
      email: "",
      membershipCode: "PLUS",
      marketingOptIn: 0,
      securityNotification: 1,
      storageQuotaBytes: "1024",
      joinedAt: "2026-07-05T00:00:00",
    }, {
      name: "기본 사용자",
      email: "fallback@example.com",
      role: "ROLE_ADMIN",
    });

    expect(resolveMembershipLabel("PREMIUM")).toBe("프리미엄 멤버십");
    expect(form).toMatchObject({
      displayName: "기본 사용자",
      email: "fallback@example.com",
      role: "ROLE_ADMIN",
      membershipCode: "PLUS",
      membershipLabel: "플러스 멤버십",
      marketingOptIn: false,
      securityNotification: true,
      storageQuotaBytes: 1024,
    });
    expect(getProfileMembershipProduct(form).code).toBe("PLUS");
    expect(getProfileInitials({ displayName: "Kim Seo" })).toBe("KS");
    expect(getProfileInitials({}, { name: "사용자" })).toBe("사");
    expect(getStorageUsageWidth({ usagePercent: 132 })).toBe("100%");
    expect(getStorageUsageWidth({ usagePercent: -10 })).toBe("0%");
    expect(formatProfileDate("bad-date")).toBe("bad-date");
  });

  it("builds update payloads and saved auth users", () => {
    const form = {
      displayName: "새 이름",
      localeCode: "KO",
      regionCode: "KR",
      marketingOptIn: true,
      privateProfile: false,
      emailNotification: true,
      securityNotification: false,
      ignored: "value",
    };

    expect(buildProfileUpdatePayload(form)).toEqual({
      displayName: "새 이름",
      localeCode: "KO",
      regionCode: "KR",
      marketingOptIn: true,
      privateProfile: false,
      emailNotification: true,
      securityNotification: false,
    });
    expect(buildSavedAuthUser({ name: "이전", email: "old@example.com" }, {
      displayName: "새 이름",
      email: "new@example.com",
      role: "ROLE_USER",
    })).toMatchObject({
      name: "새 이름",
      userName: "새 이름",
      email: "new@example.com",
      role: "ROLE_USER",
    });
  });

  it("validates profile images and error messages", () => {
    expect(ACCEPTED_PROFILE_IMAGE_TYPES).toContain("image/png");
    expect(validateProfileImageFile(null)).toEqual({ valid: false, message: "" });
    expect(validateProfileImageFile({ type: "image/gif" })).toEqual({
      valid: false,
      message: "PNG 또는 JPG 이미지만 업로드할 수 있습니다.",
    });
    expect(validateProfileImageFile({ type: "image/jpeg" })).toEqual({ valid: true, message: "" });
    expect(buildProfileImageFeedback("same", "same")).toBe("프로필 이미지를 적용했습니다.");
    expect(buildProfileImageFeedback("prepared", "original")).toBe("프로필 이미지를 축소해 적용했습니다.");
    expect(getProfileErrorMessage({ response: { data: { message: "서버 오류" } } }, "fallback")).toBe("서버 오류");
    expect(getProfileErrorMessage({}, "fallback")).toBe("fallback");
  });
});
