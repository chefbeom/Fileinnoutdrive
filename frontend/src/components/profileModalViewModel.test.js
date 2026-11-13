import { describe, expect, it } from "vitest";

import {
  ACCEPTED_PROFILE_IMAGE_TYPES,
  GROUP_SECTIONS,
  LOCALE_OPTIONS,
  PROFILE_TABS,
  REGION_OPTIONS,
  WITHDRAW_CONFIRMATION_PHRASE,
  buildAccountWithdrawalPayload,
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
  resolveSocialProviderLabel,
  toProfileForm,
  validateAccountWithdrawalInput,
  validateProfileImageFile,
} from "./profileModalViewModel.js";

describe("profileModalViewModel", () => {
  it("exports modal options and default form values", () => {
    expect(PROFILE_TABS.map((tab) => tab.id)).toEqual(["group", "profile", "layout", "mediaPhotos", "security", "notification", "language", "billing"]);
    expect(GROUP_SECTIONS.map((section) => section.id)).toContain("manage");
    expect(LOCALE_OPTIONS.map((option) => option.code)).toEqual(["KO", "EN", "JA"]);
    expect(REGION_OPTIONS.map((option) => option.code)).toEqual(["KR", "US", "JP"]);
    expect(createDefaultProfileForm()).toMatchObject({
      role: "ROLE_USER",
      localeCode: "KO",
      membershipCode: "FREE",
      storagePlanLabel: "기본 20GB",
      socialAccount: false,
      withdrawAllowed: true,
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
      socialAccount: true,
      socialProvider: "google",
      withdrawAllowed: false,
      withdrawBlockedReason: "관리자 계정은 회원 탈퇴할 수 없습니다.",
    }, {
      name: "기본 사용자",
      email: "fallback@example.com",
      role: "ROLE_ADMIN",
    });

    expect(resolveMembershipLabel("PREMIUM")).toBe("프리미엄 멤버십");
    expect(resolveSocialProviderLabel("google")).toBe("Google");
    expect(form).toMatchObject({
      displayName: "기본 사용자",
      email: "fallback@example.com",
      role: "ROLE_ADMIN",
      membershipCode: "PLUS",
      membershipLabel: "플러스 멤버십",
      marketingOptIn: false,
      securityNotification: true,
      storageQuotaBytes: 1024,
      socialAccount: true,
      socialProvider: "google",
      withdrawAllowed: false,
      withdrawBlockedReason: "관리자 계정은 회원 탈퇴할 수 없습니다.",
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

  it("validates account withdrawal inputs for local and social accounts", () => {
    const localForm = { email: "user@example.com", socialAccount: false, withdrawAllowed: true };
    expect(validateAccountWithdrawalInput(localForm, { password: "secret", agreed: false })).toEqual({
      valid: false,
      message: "안내 사항 확인 및 데이터 영구 삭제 동의에 체크해 주세요.",
    });
    expect(validateAccountWithdrawalInput(localForm, { password: "", agreed: true })).toEqual({
      valid: false,
      message: "본인 확인을 위해 현재 비밀번호를 입력해 주세요.",
    });
    expect(validateAccountWithdrawalInput(localForm, { password: "secret", agreed: true })).toEqual({
      valid: true,
      message: "",
    });
    expect(buildAccountWithdrawalPayload(localForm, { password: "secret" })).toEqual({
      password: "secret",
      confirmationText: null,
    });

    const socialForm = { email: "social@example.com", socialAccount: true, withdrawAllowed: true };
    expect(validateAccountWithdrawalInput(socialForm, { confirmationText: "틀린문구", agreed: true })).toEqual({
      valid: false,
      message: `'${WITHDRAW_CONFIRMATION_PHRASE}' 또는 계정 이메일을 정확히 입력해 주세요.`,
    });
    expect(validateAccountWithdrawalInput(socialForm, { confirmationText: "회원탈퇴", agreed: true })).toEqual({
      valid: true,
      message: "",
    });
    expect(validateAccountWithdrawalInput(socialForm, { confirmationText: "SOCIAL@example.com", agreed: true })).toEqual({
      valid: true,
      message: "",
    });
    expect(buildAccountWithdrawalPayload(socialForm, { confirmationText: " 회원탈퇴 " })).toEqual({
      password: null,
      confirmationText: "회원탈퇴",
    });
  });
});
