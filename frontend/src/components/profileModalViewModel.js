import { findMembershipProduct } from "@/constants/billingProducts.js";

export const PROFILE_TABS = [
  { id: "group", label: "그룹", icon: "fa-solid fa-user-group" },
  { id: "profile", label: "프로필", icon: "fa-solid fa-circle-user" },
  { id: "security", label: "보안", icon: "fa-solid fa-shield-halved" },
  { id: "notification", label: "알림", icon: "fa-solid fa-bell" },
  { id: "language", label: "언어", icon: "fa-solid fa-globe" },
  { id: "billing", label: "결제", icon: "fa-solid fa-wallet" },
];

export const GROUP_SECTIONS = [
  { id: "requests", label: "요청 현황" },
  { id: "invite", label: "새 연결 초대" },
  { id: "create", label: "새 그룹 만들기" },
  { id: "manage", label: "그룹 관리" },
];

export const LOCALE_OPTIONS = [
  { code: "KO", label: "한국어" },
  { code: "EN", label: "English" },
  { code: "JA", label: "日本語" },
];

export const REGION_OPTIONS = [
  { code: "KR", label: "대한민국" },
  { code: "US", label: "United States" },
  { code: "JP", label: "Japan" },
];

export const ACCEPTED_PROFILE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg"];

export function resolveMembershipLabel(membershipCode) {
  switch (String(membershipCode || "FREE").toUpperCase()) {
    case "PLUS":
      return "플러스 멤버십";
    case "PREMIUM":
      return "프리미엄 멤버십";
    default:
      return "기본 멤버십";
  }
}

export function createDefaultProfileForm() {
  return {
    displayName: "",
    email: "",
    role: "ROLE_USER",
    localeCode: "KO",
    regionCode: "KR",
    marketingOptIn: true,
    privateProfile: false,
    emailNotification: true,
    securityNotification: true,
    profileImageUrl: "",
    membershipCode: "FREE",
    membershipLabel: "기본 멤버십",
    storagePlanLabel: "기본 20GB",
    storageQuotaBytes: 0,
    storageBaseQuotaBytes: 0,
    storageAddonBytes: 0,
    joinedAt: null,
    updatedAt: null,
    emailVerified: false,
  };
}

export function toProfileForm(profile = {}, authUser = {}) {
  if (!profile) return createDefaultProfileForm();

  const membershipCode = profile.membershipCode || "FREE";
  const membershipProduct = findMembershipProduct(membershipCode);

  return {
    ...createDefaultProfileForm(),
    displayName: profile.displayName || authUser?.name || "사용자",
    email: profile.email || authUser?.email || "",
    role: profile.role || authUser?.role || "ROLE_USER",
    localeCode: profile.localeCode || "KO",
    regionCode: profile.regionCode || "KR",
    marketingOptIn: Boolean(profile.marketingOptIn),
    privateProfile: Boolean(profile.privateProfile),
    emailNotification: Boolean(profile.emailNotification),
    securityNotification: Boolean(profile.securityNotification),
    profileImageUrl: profile.profileImageUrl || "",
    membershipCode,
    membershipLabel: profile.membershipLabel || resolveMembershipLabel(membershipCode),
    storagePlanLabel: profile.storagePlanLabel || membershipProduct.label,
    storageQuotaBytes: Number(profile.storageQuotaBytes || 0),
    storageBaseQuotaBytes: Number(profile.storageBaseQuotaBytes || 0),
    storageAddonBytes: Number(profile.storageAddonBytes || 0),
    joinedAt: profile.joinedAt || null,
    updatedAt: profile.updatedAt || null,
    emailVerified: Boolean(profile.emailVerified),
  };
}

export function getProfileInitials(profileForm = {}, authUser = {}) {
  const source = profileForm.displayName || authUser?.name || "User";
  return (
    String(source)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((token) => token[0]?.toUpperCase() || "")
      .join("") || "U"
  );
}

export function getStorageUsageWidth(storageSummary = {}) {
  const usagePercent = Math.min(100, Math.max(0, Number(storageSummary?.usagePercent || 0)));
  return `${usagePercent}%`;
}

export function getProfileMembershipProduct(profileForm = {}) {
  return findMembershipProduct(profileForm.membershipCode);
}

export function formatProfileDate(value) {
  if (!value) return "정보 없음";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildSavedAuthUser(currentUser = {}, savedProfile = {}) {
  return {
    ...currentUser,
    name: savedProfile.displayName || currentUser.name,
    userName: savedProfile.displayName || currentUser.userName,
    email: savedProfile.email || currentUser.email,
    role: savedProfile.role || currentUser.role,
  };
}

export function buildProfileUpdatePayload(profileForm = {}) {
  return {
    displayName: profileForm.displayName,
    localeCode: profileForm.localeCode,
    regionCode: profileForm.regionCode,
    marketingOptIn: profileForm.marketingOptIn,
    privateProfile: profileForm.privateProfile,
    emailNotification: profileForm.emailNotification,
    securityNotification: profileForm.securityNotification,
  };
}

export function validateProfileImageFile(file = null) {
  if (!file) {
    return { valid: false, message: "" };
  }

  if (!ACCEPTED_PROFILE_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, message: "PNG 또는 JPG 이미지만 업로드할 수 있습니다." };
  }

  return { valid: true, message: "" };
}

export function buildProfileImageFeedback(preparedFile, originalFile) {
  return preparedFile === originalFile
    ? "프로필 이미지를 적용했습니다."
    : "프로필 이미지를 축소해 적용했습니다.";
}

export function getProfileErrorMessage(error, fallbackMessage) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    fallbackMessage
  );
}
