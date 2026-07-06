<script setup>
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { updateSettingsProfile, uploadSettingsProfileImage } from "@/api/featerApi.js";
import { STORAGE_ADDON_PRODUCTS, formatKrw } from "@/constants/billingProducts.js";
import { useAuthStore } from "@/stores/useAuthStore.js";
import { useFileStore } from "@/stores/useFileStore.js";
import { formatBytes } from "@/utils/formatBytes.js";
import GroupManagerPanel from "@/components/group/GroupManagerPanel.vue";
import {
  GROUP_SECTIONS as groupSections,
  LOCALE_OPTIONS as localeOptions,
  PROFILE_TABS as tabs,
  REGION_OPTIONS as regionOptions,
  buildProfileImageFeedback,
  buildProfileUpdatePayload,
  buildSavedAuthUser,
  createDefaultProfileForm,
  formatProfileDate as formatDate,
  getProfileErrorMessage,
  getProfileInitials,
  getProfileMembershipProduct,
  getStorageUsageWidth,
  toProfileForm,
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

const emit = defineEmits(["close", "saved"]);
const authStore = useAuthStore();
const fileStore = useFileStore();

const activeTab = ref("profile");
const groupFocusSection = ref("manage");
const isSaving = ref(false);
const isUploadingImage = ref(false);
const saveError = ref("");
const imageFeedback = ref("");
const profileImageInput = ref(null);


const profileForm = ref(createDefaultProfileForm());

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
    if (!isOpen) return;
    saveError.value = "";
    imageFeedback.value = "";
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
    const savedProfile = await updateSettingsProfile(buildProfileUpdatePayload(profileForm.value));

    applySavedProfile(savedProfile);
    emit("saved", savedProfile);
    emit("close");
  } catch (error) {
    saveError.value = getProfileErrorMessage(error, "설정을 저장하지 못했습니다.");
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="settings-overlay" :class="{ active: isOpen }" @click="emit('close')">
    <div class="settings-modal" @click.stop>
      <header class="settings-modal__header">
        <div>
          <p class="settings-modal__eyebrow">Account Center</p>
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
            </section>

            <section v-else-if="activeTab === 'group'" class="settings-pane">
              <GroupManagerPanel :active="activeTab === 'group'" :focus-section="groupFocusSection" />
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
                  <p class="settings-modal__eyebrow">Current Plan</p>
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
    </div>
  </div>
</template>

<style scoped src="./ProfileModal.css"></style>
