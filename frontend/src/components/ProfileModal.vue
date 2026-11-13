<script setup>
import { computed, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import {
  updateSettingsProfile,
  uploadSettingsProfileImage,
  withdrawSettingsAccount,
} from "@/api/featerApi.js";
import { STORAGE_ADDON_PRODUCTS, formatKrw } from "@/constants/billingProducts.js";
import { useAuthStore } from "@/stores/useAuthStore.js";
import { useFileStore } from "@/stores/useFileStore.js";
import { useMediaPhotoStore } from "@/stores/useMediaPhotoStore.js";
import { useUiLayoutStore } from "@/stores/useUiLayoutStore.js";
import { formatBytes } from "@/utils/formatBytes.js";
import GroupManagerPanel from "@/components/group/GroupManagerPanel.vue";
import LayoutCustomizerPanel from "@/components/settings/LayoutCustomizerPanel.vue";
import {
  GROUP_SECTIONS as groupSections,
  LOCALE_OPTIONS as localeOptions,
  PROFILE_TABS as tabs,
  REGION_OPTIONS as regionOptions,
  WITHDRAW_CONFIRMATION_PHRASE,
  buildAccountWithdrawalPayload,
  buildProfileImageFeedback,
  buildProfileUpdatePayload,
  buildSavedAuthUser,
  createDefaultProfileForm,
  formatProfileDate as formatDate,
  getProfileErrorMessage,
  getProfileInitials,
  getProfileMembershipProduct,
  getStorageUsageWidth,
  resolveSocialProviderLabel,
  toProfileForm,
  validateAccountWithdrawalInput,
  validateProfileImageFile,
} from "./profileModalViewModel.js";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  initialTab: {
    type: String,
    default: "profile",
  },
  settingsProfile: {
    type: Object,
    default: null,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "saved", "withdrawn"]);
const router = useRouter();
const authStore = useAuthStore();
const fileStore = useFileStore();
const mediaPhotoStore = useMediaPhotoStore();
const uiLayoutStore = useUiLayoutStore();

const activeTab = ref("profile");
const groupFocusSection = ref("manage");
const isSaving = ref(false);
const isUploadingImage = ref(false);
const saveError = ref("");
const imageFeedback = ref("");
const profileImageInput = ref(null);

const isWithdrawModalOpen = ref(false);
const isWithdrawing = ref(false);
const withdrawPassword = ref("");
const withdrawConfirmationText = ref("");
const withdrawAgreed = ref(false);
const withdrawError = ref("");

const profileForm = ref(createDefaultProfileForm());

const resetWithdrawForm = () => {
  isWithdrawModalOpen.value = false;
  isWithdrawing.value = false;
  withdrawPassword.value = "";
  withdrawConfirmationText.value = "";
  withdrawAgreed.value = false;
  withdrawError.value = "";
};

const syncForm = (profile) => {
  if (!profile) return;
  profileForm.value = toProfileForm(profile, authStore.user);
};

watch(
  () => props.initialTab,
  (value) => {
    activeTab.value = value || "profile";
  },
  { immediate: true },
);

watch(
  () => props.settingsProfile,
  (profile) => {
    if (!profile) return;
    syncForm(profile);
  },
  { immediate: true },
);

watch(
  () => props.isOpen,
  (isOpen) => {
    if (!isOpen) {
      resetWithdrawForm();
      if (uiLayoutStore.hasPendingSave) {
        uiLayoutStore.flushServerSave().catch(() => {});
      }
      return;
    }
    saveError.value = "";
    imageFeedback.value = "";
    resetWithdrawForm();
    activeTab.value = props.initialTab || "profile";
    if (!fileStore.storageSummary && !fileStore.storageLoading) {
      fileStore.fetchStorageSummary().catch(() => {});
    }
  },
);

const profileInitials = computed(() => getProfileInitials(profileForm.value, authStore.user));
const storageSummary = computed(() => fileStore.storageSummary);
const storageUsageWidth = computed(() => getStorageUsageWidth(storageSummary.value));
const currentMembershipProduct = computed(() => getProfileMembershipProduct(profileForm.value));
const socialProviderLabel = computed(() => resolveSocialProviderLabel(profileForm.value.socialProvider));

const applySavedProfile = (savedProfile) => {
  syncForm(savedProfile);
  authStore.setUser(buildSavedAuthUser(authStore.user || {}, savedProfile));
};

const handleTabSelect = (tabId) => {
  activeTab.value = tabId;

  if (tabId === "group" && !groupFocusSection.value) {
    groupFocusSection.value = "manage";
  }
};

const openProfileImagePicker = () => {
  profileImageInput.value?.click();
};

const downscaleProfileImage = async (file) => {
  if (!file || !file.type?.startsWith("image/")) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const target = new Image();
      target.onload = () => resolve(target);
      target.onerror = () => reject(new Error("이미지를 불러올 수 없습니다."));
      target.src = objectUrl;
    });

    const maxDimension = 1600;
    const width = image.width || 1;
    const height = image.height || 1;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    if (scale === 1) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/png", 0.92);
    });

    if (!blob) {
      return file;
    }

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.png`, {
      type: "image/png",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const handleProfileImageChange = async (event) => {
  const file = event?.target?.files?.[0];
  if (event?.target) {
    event.target.value = "";
  }

  if (!file) return;

  const validation = validateProfileImageFile(file);
  if (!validation.valid) {
    if (validation.message) imageFeedback.value = validation.message;
    return;
  }

  imageFeedback.value = "";
  isUploadingImage.value = true;

  try {
    const preparedFile = await downscaleProfileImage(file);
    const savedProfile = await uploadSettingsProfileImage(preparedFile);
    applySavedProfile(savedProfile);
    emit("saved", savedProfile);
    imageFeedback.value = buildProfileImageFeedback(preparedFile, file);
  } catch (error) {
    imageFeedback.value = getProfileErrorMessage(error, "프로필 이미지를 업로드하지 못했습니다.");
  } finally {
    isUploadingImage.value = false;
  }
};

const handleSave = async () => {
  saveError.value = "";
  isSaving.value = true;

  try {
    let savedProfile = props.settingsProfile;

    if (activeTab.value === "layout") {
      await uiLayoutStore.flushServerSave({ throwOnError: true });
      if (profileForm.value.displayName?.trim()) {
        savedProfile = await updateSettingsProfile(buildProfileUpdatePayload(profileForm.value));
        applySavedProfile(savedProfile);
      }
    } else {
      savedProfile = await updateSettingsProfile(buildProfileUpdatePayload(profileForm.value));
      applySavedProfile(savedProfile);
      if (uiLayoutStore.hasPendingSave || uiLayoutStore.syncError) {
        await uiLayoutStore.flushServerSave({ throwOnError: true });
      }
    }

    if (savedProfile) {
      emit("saved", savedProfile);
    }
    emit("close");
  } catch (error) {
    saveError.value = getProfileErrorMessage(error, "설정을 저장하지 못했습니다.");
  } finally {
    isSaving.value = false;
  }
};

const openWithdrawModal = () => {
  if (!profileForm.value.withdrawAllowed) return;
  withdrawPassword.value = "";
  withdrawConfirmationText.value = "";
  withdrawAgreed.value = false;
  withdrawError.value = "";
  isWithdrawModalOpen.value = true;
};

const closeWithdrawModal = () => {
  if (isWithdrawing.value) return;
  resetWithdrawForm();
};

const handleConfirmWithdraw = async () => {
  withdrawError.value = "";

  const validation = validateAccountWithdrawalInput(profileForm.value, {
    password: withdrawPassword.value,
    confirmationText: withdrawConfirmationText.value,
    agreed: withdrawAgreed.value,
  });

  if (!validation.valid) {
    withdrawError.value = validation.message;
    return;
  }

  const confirmed = window.confirm(
    "정말로 회원 탈퇴를 진행하시겠습니까?\n업로드한 모든 파일, 폴더, 개인 페이지 및 계정 정보가 즉시 영구 삭제되며 복구할 수 없습니다.",
  );
  if (!confirmed) {
    return;
  }

  isWithdrawing.value = true;
  try {
    const payload = buildAccountWithdrawalPayload(profileForm.value, {
      password: withdrawPassword.value,
      confirmationText: withdrawConfirmationText.value,
    });
    await withdrawSettingsAccount(payload);
    await authStore.logout({ remote: false, unsubscribe: false });
    resetWithdrawForm();
    emit("withdrawn");
    emit("close");
    alert("회원 탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.");
    router.replace("/login");
  } catch (error) {
    withdrawError.value = getProfileErrorMessage(error, "회원 탈퇴 처리 중 오류가 발생했습니다.");
  } finally {
    isWithdrawing.value = false;
  }
};
</script>

<template>
  <div class="settings-overlay" :class="{ active: isOpen }" @click="emit('close')">
    <div class="settings-modal" @click.stop>
      <header class="settings-modal__header">
        <div>
          <p class="settings-modal__eyebrow">계정 관리</p>
          <h2 class="settings-modal__title">설정</h2>
        </div>
        <button type="button" class="settings-close" @click="emit('close')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>

      <div class="settings-modal__body">
        <aside class="settings-sidebar">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="settings-sidebar__item"
            :class="{ 'is-active': activeTab === tab.id }"
            @click="handleTabSelect(tab.id)"
          >
            <i :class="tab.icon"></i>
            <span>{{ tab.label }}</span>
          </button>
        </aside>

        <section class="settings-content">
          <div v-if="isLoading && !settingsProfile" class="settings-empty">설정 정보를 불러오는 중입니다.</div>

          <template v-else>
            <section v-if="activeTab === 'profile'" class="settings-pane">
              <div class="profile-hero">
                <div class="profile-avatar">
                  <img
                    v-if="profileForm.profileImageUrl"
                    :src="profileForm.profileImageUrl"
                    :alt="profileForm.displayName"
                    class="profile-avatar__image"
                  />
                  <span v-else>{{ profileInitials }}</span>
                </div>
                <div class="profile-hero__copy">
                  <span class="settings-pill settings-pill--blue">{{ profileForm.membershipLabel }}</span>
                  <h3>{{ profileForm.displayName }}</h3>
                  <p>{{ profileForm.email }}</p>
                  <div class="profile-hero__actions">
                    <button type="button" class="settings-ghost-button" :disabled="isUploadingImage" @click="openProfileImagePicker">
                      {{ isUploadingImage ? "이미지 적용 중..." : "프로필 이미지 변경" }}
                    </button>
                    <input ref="profileImageInput" type="file" accept="image/png,image/jpeg" hidden @change="handleProfileImageChange" />
                    <span class="settings-meta">가입일 : {{ formatDate(profileForm.joinedAt) }}</span>
                  </div>
                  <p v-if="imageFeedback" class="settings-feedback">{{ imageFeedback }}</p>
                </div>
              </div>

              <div class="settings-grid settings-grid--two">
                <label class="settings-field">
                  <span class="settings-field__label">표시 이름</span>
                  <input v-model="profileForm.displayName" class="settings-input" maxlength="100" />
                </label>
                <label class="settings-field">
                  <span class="settings-field__label">이메일</span>
                  <input :value="profileForm.email" class="settings-input" disabled />
                </label>
              </div>

              <div class="settings-danger-card">
                <div class="settings-danger-card__copy">
                  <span class="settings-danger-card__badge">계정 삭제</span>
                  <h3 class="settings-danger-card__title">회원 탈퇴</h3>
                  <p class="settings-help">
                    탈퇴 시 업로드한 모든 파일·폴더, 개인 페이지, 그룹·공유 연결 및 설정 정보가 즉시 영구 삭제되며 복구할 수 없습니다.
                  </p>
                  <p v-if="!profileForm.withdrawAllowed && profileForm.withdrawBlockedReason" class="settings-danger-card__notice">
                    <i class="fa-solid fa-circle-info"></i>
                    <span>{{ profileForm.withdrawBlockedReason }}</span>
                  </p>
                </div>
                <button
                  type="button"
                  class="settings-danger-button"
                  :disabled="!profileForm.withdrawAllowed"
                  @click="openWithdrawModal"
                >
                  <i class="fa-solid fa-user-slash"></i>
                  <span>회원 탈퇴...</span>
                </button>
              </div>
            </section>

            <section v-else-if="activeTab === 'group'" class="settings-pane">
              <GroupManagerPanel :active="activeTab === 'group'" :focus-section="groupFocusSection" />
            </section>

            <section v-else-if="activeTab === 'layout'" class="settings-pane">
              <LayoutCustomizerPanel />
            </section>

            <section v-else-if="activeTab === 'mediaPhotos'" class="settings-pane">
              <div class="settings-card">
                <h3 class="settings-section__title">미디어 (동영상 스트리밍) 설정</h3>
                <p class="settings-help">
                  파일 저장소에 있는 동영상을 미디어 화면에 어떻게 표시할지 설정합니다.
                </p>

                <div class="settings-grid settings-grid--two" style="margin-top: 12px;">
                  <label class="settings-field">
                    <span class="settings-field__label">미디어 파일 표시 범위</span>
                    <select
                      :value="mediaPhotoStore.preferences.mediaSourceMode"
                      class="settings-input"
                      @change="mediaPhotoStore.updatePreferences({ mediaSourceMode: $event.target.value })"
                    >
                      <option value="manual">내가 지정한 동영상·폴더만 표시 (기본)</option>
                      <option value="all">저장소의 모든 동영상 자동 표시</option>
                    </select>
                  </label>

                  <label class="settings-field">
                    <span class="settings-field__label">기본 재생 속도</span>
                    <select
                      :value="mediaPhotoStore.preferences.defaultPlaybackRate"
                      class="settings-input"
                      @change="mediaPhotoStore.updatePreferences({ defaultPlaybackRate: Number($event.target.value) })"
                    >
                      <option :value="0.75">0.75x</option>
                      <option :value="1.0">1.0x (기본)</option>
                      <option :value="1.25">1.25x</option>
                      <option :value="1.5">1.5x</option>
                      <option :value="2.0">2.0x</option>
                    </select>
                  </label>
                </div>

                <label class="settings-check" style="margin-top: 8px;">
                  <input
                    type="checkbox"
                    :checked="mediaPhotoStore.preferences.enableContinueWatching"
                    @change="mediaPhotoStore.updatePreferences({ enableContinueWatching: $event.target.checked })"
                  />
                  <span>이어보기 위치 및 시청 기록 자동 저장</span>
                </label>

                <label class="settings-check">
                  <input
                    type="checkbox"
                    :checked="mediaPhotoStore.preferences.autoPlayNext"
                    @change="mediaPhotoStore.updatePreferences({ autoPlayNext: $event.target.checked })"
                  />
                  <span>컬렉션·재생목록 다음 동영상 자동 연속 재생</span>
                </label>

                <label class="settings-check">
                  <input
                    type="checkbox"
                    :checked="mediaPhotoStore.preferences.autoLoadSubtitles"
                    @change="mediaPhotoStore.updatePreferences({ autoLoadSubtitles: $event.target.checked })"
                  />
                  <span>같은 폴더 내 동일 이름 자막(.srt / .vtt) 자동 불러오기</span>
                </label>
              </div>

              <div class="settings-card">
                <h3 class="settings-section__title">사진첩 설정</h3>
                <p class="settings-help">
                  파일 저장소에 있는 사진을 사진첩 화면에 어떻게 표시할지 설정합니다.
                </p>

                <div class="settings-grid settings-grid--two" style="margin-top: 12px;">
                  <label class="settings-field">
                    <span class="settings-field__label">사진첩 파일 표시 범위</span>
                    <select
                      :value="mediaPhotoStore.preferences.photoSourceMode"
                      class="settings-input"
                      @change="mediaPhotoStore.updatePreferences({ photoSourceMode: $event.target.value })"
                    >
                      <option value="manual">내가 지정한 사진·폴더만 표시 (기본)</option>
                      <option value="all">저장소의 모든 사진 자동 표시</option>
                    </select>
                  </label>

                  <label class="settings-field">
                    <span class="settings-field__label">사진 타임라인 날짜 기준</span>
                    <select
                      :value="mediaPhotoStore.preferences.photoDateBasis"
                      class="settings-input"
                      @change="mediaPhotoStore.updatePreferences({ photoDateBasis: $event.target.value })"
                    >
                      <option value="capture">촬영 날짜 우선 (파일명·EXIF)</option>
                      <option value="upload">업로드 날짜 기준</option>
                    </select>
                  </label>
                </div>

                <label class="settings-check" style="margin-top: 8px;">
                  <input
                    type="checkbox"
                    :checked="mediaPhotoStore.preferences.hideSensitiveExifOnShare"
                    @change="mediaPhotoStore.updatePreferences({ hideSensitiveExifOnShare: $event.target.checked })"
                  />
                  <span>사진 공유 시 민감 위치정보(EXIF) 보호</span>
                </label>
              </div>
            </section>

            <section v-else-if="activeTab === 'security'" class="settings-pane">
              <div class="settings-card">
                <h3 class="settings-section__title">보안 상태</h3>
                <div class="settings-grid settings-grid--two">
                  <div class="settings-info-box">
                    <span class="settings-info-box__label">이메일 인증</span>
                    <strong>{{ profileForm.emailVerified ? "완료" : "대기" }}</strong>
                  </div>
                  <div class="settings-info-box">
                    <span class="settings-info-box__label">보안 알림</span>
                    <strong>{{ profileForm.securityNotification ? "켜짐" : "꺼짐" }}</strong>
                  </div>
                </div>
                <p class="settings-help">
                  비밀번호 변경은 기존 로그인 화면에서 진행해 주세요. 여기에서는 프로필 공개 범위와
                  보안 알림 수신 여부를 관리할 수 있습니다.
                </p>
              </div>

              <label class="settings-check">
                <input v-model="profileForm.privateProfile" type="checkbox" />
                <span>프로필을 비공개로 유지</span>
              </label>
              <label class="settings-check">
                <input v-model="profileForm.securityNotification" type="checkbox" />
                <span>보안 알림 메일 받기</span>
              </label>

              <div class="settings-danger-card">
                <div class="settings-danger-card__copy">
                  <span class="settings-danger-card__badge">위험 구역</span>
                  <h3 class="settings-danger-card__title">회원 탈퇴</h3>
                  <p class="settings-help">
                    계정을 탈퇴하면 저장소에 업로드한 파일과 폴더, 워크스페이스 문서, 공유 및 그룹 정보가 모두 즉시 삭제됩니다.
                    삭제된 이후에는 동일 이메일로 재가입하더라도 이전 데이터를 복구할 수 없습니다.
                  </p>
                  <p v-if="!profileForm.withdrawAllowed && profileForm.withdrawBlockedReason" class="settings-danger-card__notice">
                    <i class="fa-solid fa-circle-info"></i>
                    <span>{{ profileForm.withdrawBlockedReason }}</span>
                  </p>
                </div>
                <button
                  type="button"
                  class="settings-danger-button"
                  :disabled="!profileForm.withdrawAllowed"
                  @click="openWithdrawModal"
                >
                  <i class="fa-solid fa-user-slash"></i>
                  <span>회원 탈퇴...</span>
                </button>
              </div>
            </section>

            <section v-else-if="activeTab === 'notification'" class="settings-pane">
              <label class="settings-check">
                <input v-model="profileForm.emailNotification" type="checkbox" />
                <span>파일 및 공유 알림 메일 받기</span>
              </label>
              <label class="settings-check">
                <input v-model="profileForm.marketingOptIn" type="checkbox" />
                <span>새 기능 및 혜택 안내 받기</span>
              </label>
            </section>

            <section v-else-if="activeTab === 'language'" class="settings-pane">
              <div class="settings-grid settings-grid--two">
                <label class="settings-field">
                  <span class="settings-field__label">언어</span>
                  <select v-model="profileForm.localeCode" class="settings-input">
                    <option v-for="option in localeOptions" :key="option.code" :value="option.code">{{ option.label }}</option>
                  </select>
                </label>
                <label class="settings-field">
                  <span class="settings-field__label">지역</span>
                  <select v-model="profileForm.regionCode" class="settings-input">
                    <option v-for="option in regionOptions" :key="option.code" :value="option.code">{{ option.label }}</option>
                  </select>
                </label>
              </div>
            </section>

            <section v-else-if="activeTab === 'billing'" class="settings-pane">
              <div class="billing-summary">
                <div>
                  <p class="settings-modal__eyebrow">현재 플랜</p>
                  <h3 class="settings-section__title">{{ profileForm.storagePlanLabel }}</h3>
                  <p class="settings-help">{{ currentMembershipProduct.description }}</p>
                </div>
                <RouterLink
                  :to="{ name: 'payment', query: { category: 'membership', product: 'PLUS' } }"
                  class="settings-primary-link"
                  @click="emit('close')"
                >
                  멤버십 변경
                </RouterLink>
              </div>

              <div class="settings-card">
                <h3 class="settings-section__title">현재 멤버십 기능</h3>
                <p class="settings-help">멤버십 플랜은 기본 저장 공간과 사용할 수 있는 파일 기능을 함께 결정합니다.</p>
                <ul class="plan-feature-list">
                  <li v-for="feature in currentMembershipProduct.features" :key="feature">{{ feature }}</li>
                </ul>
              </div>

              <div v-if="storageSummary" class="storage-panel">
                <div class="storage-panel__head">
                  <span>저장 공간 사용량</span>
                  <strong>{{ storageSummary.usagePercent }}%</strong>
                </div>
                <div class="storage-panel__bar">
                  <div :style="{ width: storageUsageWidth }"></div>
                </div>
                <p class="settings-help">{{ formatBytes(storageSummary.usedBytes) }} / {{ formatBytes(storageSummary.quotaBytes) }} 사용 중</p>

                <div class="settings-grid settings-grid--three">
                  <div class="settings-info-box">
                    <span class="settings-info-box__label">기본 용량</span>
                    <strong>{{ formatBytes(storageSummary.addonQuotaBytes || profileForm.storageAddonBytes) }}</strong>
                  </div>
                  <div class="settings-info-box">
                    <span class="settings-info-box__label">추가 용량</span>
                    <strong>{{ formatBytes(storageSummary.baseQuotaBytes || profileForm.storageBaseQuotaBytes) }}</strong>
                  </div>
                  <div class="settings-info-box">
                    <span class="settings-info-box__label">활성 파일</span>
                    <strong>{{ storageSummary.activeFileCount }}개</strong>
                  </div>
                </div>
              </div>

              <div class="settings-card">
                <h3 class="settings-section__title">추가 저장용량</h3>
                <p class="settings-help">추가 저장용량은 멤버십 기능을 바꾸지 않고 순수 저장 공간만 더합니다.</p>
              </div>

              <div class="addon-grid">
                <article v-for="product in STORAGE_ADDON_PRODUCTS" :key="product.code" class="addon-card">
                  <div>
                    <span class="settings-pill settings-pill--amber">{{ product.badge }}</span>
                    <h4>{{ product.label }}</h4>
                    <p>{{ product.description }}</p>
                  </div>
                  <div class="addon-card__footer">
                    <strong>{{ formatKrw(product.price) }}/ KRW</strong>
                    <RouterLink
                      :to="{ name: 'payment', query: { category: 'storage', product: product.code } }"
                      class="settings-ghost-button"
                      @click="emit('close')"
                    >
                      용량만 구입
                    </RouterLink>
                  </div>
                </article>
              </div>
            </section>
          </template>
        </section>
      </div>

      <footer class="settings-modal__footer">
        <p v-if="saveError" class="settings-error">{{ saveError }}</p>
        <div class="settings-modal__actions">
          <button type="button" class="settings-secondary-button" @click="emit('close')">닫기</button>
          <button type="button" class="settings-primary-button" :disabled="isSaving || isLoading || isUploadingImage" @click="handleSave">
            {{ isSaving ? "저장 중..." : "설정 저장" }}
          </button>
        </div>
      </footer>

      <div v-if="isWithdrawModalOpen" class="settings-withdraw-backdrop" @click="closeWithdrawModal">
        <div class="settings-withdraw-dialog" @click.stop>
          <div class="settings-withdraw-dialog__header">
            <div class="settings-withdraw-dialog__icon">
              <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div>
              <p class="settings-withdraw-dialog__eyebrow">영구 삭제 확인</p>
              <h3 class="settings-withdraw-dialog__title">회원 탈퇴를 진행하시겠습니까?</h3>
            </div>
          </div>

          <div class="settings-withdraw-dialog__body">
            <div class="settings-withdraw-warning">
              <p class="settings-withdraw-warning__lead">
                <strong>{{ profileForm.email }}</strong> 계정과 연결된 아래 데이터가 즉시 영구 삭제되며 복구할 수 없습니다.
              </p>
              <ul class="settings-withdraw-warning__list">
                <li>업로드한 모든 드라이브 파일, 폴더, 파일 버전 및 스토리지(MinIO) 객체</li>
                <li>단독 관리 중인 개인·협업 워크스페이스 문서, 이미지·첨부 에셋 및 댓글</li>
                <li>파일 공유 내역, 친구·그룹 연결, 채팅 참여 정보 및 계정 설정</li>
              </ul>
            </div>

            <label v-if="profileForm.socialAccount" class="settings-field">
              <span class="settings-field__label">
                {{ socialProviderLabel }} 소셜 계정 확인 문구 입력
              </span>
              <input
                v-model="withdrawConfirmationText"
                type="text"
                class="settings-input"
                :placeholder="`'${WITHDRAW_CONFIRMATION_PHRASE}' 또는 ${profileForm.email} 입력`"
                :disabled="isWithdrawing"
                @keyup.enter="handleConfirmWithdraw"
              />
              <span class="settings-meta">
                본인 확인을 위해 <strong>{{ WITHDRAW_CONFIRMATION_PHRASE }}</strong> 또는 계정 이메일을 정확히 입력해 주세요.
              </span>
            </label>

            <label v-else class="settings-field">
              <span class="settings-field__label">현재 비밀번호 확인</span>
              <input
                v-model="withdrawPassword"
                type="password"
                class="settings-input"
                placeholder="현재 계정 비밀번호를 입력해 주세요"
                autocomplete="current-password"
                :disabled="isWithdrawing"
                @keyup.enter="handleConfirmWithdraw"
              />
            </label>

            <label class="settings-check settings-check--danger">
              <input v-model="withdrawAgreed" type="checkbox" :disabled="isWithdrawing" />
              <span>위 안내 사항을 모두 확인했으며, 모든 데이터 영구 삭제 및 회원 탈퇴에 동의합니다.</span>
            </label>

            <p v-if="withdrawError" class="settings-error">{{ withdrawError }}</p>
          </div>

          <div class="settings-withdraw-dialog__footer">
            <button
              type="button"
              class="settings-secondary-button"
              :disabled="isWithdrawing"
              @click="closeWithdrawModal"
            >
              취소
            </button>
            <button
              type="button"
              class="settings-danger-solid-button"
              :disabled="isWithdrawing"
              @click="handleConfirmWithdraw"
            >
              {{ isWithdrawing ? "탈퇴 처리 중..." : "영구 탈퇴하기" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./ProfileModal.css"></style>
