<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getOAuthProviders, login } from '@/api/user/index.js'
import { useAuthStore } from '@/stores/useAuthStore.js'
import { apiPath } from '@/utils/backendUrl.js'

const SAVED_EMAIL_KEY = 'FILEINNOUT_SAVED_LOGIN_EMAIL'

const providerCatalog = [
  { id: 'google', label: 'Google', mark: 'G', className: 'provider-google' },
  { id: 'kakao', label: 'Kakao', mark: 'K', className: 'provider-kakao' },
  { id: 'naver', label: 'Naver', mark: 'N', className: 'provider-naver' },
]

const createProviderState = (provider, overrides = {}) => ({
  ...provider,
  enabled: false,
  authorizationUrl: `/oauth2/authorization/${provider.id}`,
  disabledReason: '소셜 로그인 연동 준비 중',
  ...overrides,
})

const router = useRouter()
const authStore = useAuthStore()

const isLoading = ref(false)
const socialLoadingProvider = ref('')
const showPassword = ref(false)
const rememberEmail = ref(false)
const loginErrorMessage = ref('')
const oauthAdminOnly = ref(false)
const socialLoginVisible = ref(false)
const oauthStatusLoaded = ref(false)
const socialProviders = ref(
  providerCatalog.map((provider) => createProviderState(provider)),
)

const loginForm = reactive({
  email: '',
  password: '',
})

const isFormValid = computed(
  () => loginForm.email.trim().length > 0 && loginForm.password.trim().length > 0,
)

const loadSavedEmail = () => {
  try {
    const saved = window.localStorage.getItem(SAVED_EMAIL_KEY)
    if (saved && saved.trim()) {
      loginForm.email = saved.trim()
      rememberEmail.value = true
    }
  } catch {
    // ignore storage errors
  }
}

const syncSavedEmail = () => {
  try {
    if (rememberEmail.value && loginForm.email.trim()) {
      window.localStorage.setItem(SAVED_EMAIL_KEY, loginForm.email.trim())
    } else {
      window.localStorage.removeItem(SAVED_EMAIL_KEY)
    }
  } catch {
    // ignore storage errors
  }
}

const loadOAuthProviders = async () => {
  oauthStatusLoaded.value = false

  try {
    const res = await getOAuthProviders()
    const data = res.data || {}
    const providers = Array.isArray(data.providers) ? data.providers : []
    const providerById = new Map(providers.map((provider) => [provider.id, provider]))
    oauthAdminOnly.value = Boolean(data.adminOnly)
    socialLoginVisible.value = Boolean(data.socialLoginVisible)

    socialProviders.value = providerCatalog.map((provider) => {
      const status = providerById.get(provider.id)
      const enabled = Boolean(status?.enabled)
      return createProviderState(provider, {
        enabled,
        authorizationUrl: enabled
          ? (status?.authorizationUrl || `/oauth2/authorization/${provider.id}`)
          : `/oauth2/authorization/${provider.id}`,
        disabledReason: enabled
          ? ''
          : (oauthAdminOnly.value ? '관리자 전용 모드' : '현재 소셜 로그인 연동 준비 중입니다. 이메일로 로그인해 주세요.'),
      })
    })
  } catch {
    oauthAdminOnly.value = false
    socialLoginVisible.value = false
    socialProviders.value = providerCatalog.map((provider) => createProviderState(provider))
  } finally {
    oauthStatusLoaded.value = true
  }
}

const handleSocialLogin = (provider) => {
  if (socialLoadingProvider.value || isLoading.value) return
  if (!provider?.enabled) {
    loginErrorMessage.value =
      provider?.disabledReason ||
      `현재 ${provider?.label || '소셜'} 로그인 연동 준비 중입니다. 이메일로 로그인해 주세요.`
    return
  }

  loginErrorMessage.value = ''
  socialLoadingProvider.value = provider.id
  window.location.assign(apiPath(provider.authorizationUrl))
}

const handleLogin = async () => {
  if (!isFormValid.value || isLoading.value) return

  isLoading.value = true
  loginErrorMessage.value = ''

  try {
    const payload = {
      email: loginForm.email.trim(),
      password: loginForm.password,
    }
    const res = await login(payload)
    const authHeader = res.headers['authorization'] || res.headers['Authorization']
    const accessToken = authHeader?.replace('Bearer ', '') || res.data?.accessToken

    if (!accessToken) {
      loginErrorMessage.value = '로그인 응답에 인증 토큰이 없습니다.'
      return
    }

    syncSavedEmail()
    authStore.login(accessToken)
    router.replace({ name: 'home' })
  } catch {
    loginErrorMessage.value = '이메일 또는 비밀번호가 올바르지 않습니다. 다시 확인해 주세요.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadSavedEmail()
  loadOAuthProviders()
})
</script>

<template>
  <div class="login-page">
    <section class="login-shell" aria-labelledby="login-title">
      <div class="brand-panel">
        <router-link to="/" class="brand-link" aria-label="FileInNOut 홈">
          <span class="brand-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.4"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          </span>
          <span class="brand-name">FileInNOut</span>
        </router-link>

        <div class="brand-copy">
          <span class="brand-badge">Cloud Drive &amp; Realtime Workspace</span>
          <h1 id="login-title">하나의 공간에서 파일과 협업을 이어가세요</h1>
          <p>
            안전한 클라우드 드라이브와 실시간 공동 문서 편집 워크스페이스를 지금 바로 시작하세요.
          </p>
        </div>

        <ul class="brand-features" aria-label="핵심 기능">
          <li>
            <span class="feature-dot"></span>
            <span>드라이브 파일·폴더 버전 관리 및 안전한 팀 공유</span>
          </li>
          <li>
            <span class="feature-dot"></span>
            <span>실시간 블록 에디터 기반 다자간 동시 문서 협업</span>
          </li>
          <li>
            <span class="feature-dot"></span>
            <span>워크스페이스 채팅·알림 및 세밀한 접근 권한 제어</span>
          </li>
        </ul>
      </div>

      <div class="login-card">
        <div class="login-card__header">
          <h2>로그인</h2>
          <p>계정 이메일과 비밀번호를 입력해 로그인하세요.</p>
        </div>

        <form @submit.prevent="handleLogin" class="login-form" novalidate>
          <label class="field-group">
            <span>이메일</span>
            <input
              v-model.trim="loginForm.email"
              type="email"
              placeholder="name@example.com"
              autocomplete="email"
              required
            />
          </label>

          <label class="field-group">
            <span>비밀번호</span>
            <div class="password-input-wrap">
              <input
                v-model="loginForm.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="비밀번호를 입력하세요"
                autocomplete="current-password"
                required
              />
              <button
                type="button"
                class="password-toggle"
                :aria-label="showPassword ? '비밀번호 숨기기' : '비밀번호 표시'"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? '숨김' : '보기' }}
              </button>
            </div>
          </label>

          <div class="login-options">
            <label class="remember-check">
              <input v-model="rememberEmail" type="checkbox" />
              <span>이메일 기억하기</span>
            </label>

            <router-link :to="{ name: 'FindMember' }" class="text-link">
              아이디 · 비밀번호 찾기
            </router-link>
          </div>

          <p v-if="loginErrorMessage" class="error-message" role="alert">
            {{ loginErrorMessage }}
          </p>

          <button type="submit" class="submit-button" :disabled="!isFormValid || isLoading">
            {{ isLoading ? '로그인 중...' : '로그인' }}
          </button>
        </form>

        <template v-if="socialLoginVisible">
          <div class="section-divider">
            <span>소셜 계정으로 간편 로그인</span>
          </div>

          <div class="social-section">
            <button
              v-for="provider in socialProviders"
              :key="provider.id"
              type="button"
              class="social-button"
              :class="provider.className"
              :disabled="!!socialLoadingProvider || isLoading"
              :title="provider.enabled ? `${provider.label} 로그인` : provider.disabledReason"
              @click="handleSocialLogin(provider)"
            >
              <span class="provider-mark">{{ provider.mark }}</span>
              <span>
                {{ socialLoadingProvider === provider.id ? '연결 중...' : `${provider.label}로 계속하기` }}
              </span>
            </button>
          </div>
        </template>

        <div class="signup-footer">
          <span>아직 FileInNOut 계정이 없으신가요?</span>
          <router-link :to="{ name: 'signup' }" class="signup-link">
            회원가입
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: radial-gradient(circle at 15% 15%, #e0e7ff 0%, #f8fafc 45%, #f1f5f9 100%);
  color: #0f172a;
}

.login-shell {
  width: min(980px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(340px, 440px);
  gap: 48px;
  align-items: center;
}

.brand-panel {
  display: grid;
  gap: 28px;
}

.brand-link {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 12px;
  color: inherit;
  text-decoration: none;
}

.brand-icon {
  width: 44px;
  height: 44px;
  display: inline-grid;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #4f46e5);
  color: #fff;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.25);
}

.brand-icon svg {
  width: 24px;
  height: 24px;
}

.brand-name {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.brand-copy {
  display: grid;
  gap: 14px;
}

.brand-badge {
  width: fit-content;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(30px, 3.6vw, 42px);
  line-height: 1.2;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: #0f172a;
}

.brand-copy p {
  margin: 0;
  color: #475569;
  font-size: 16px;
  line-height: 1.65;
}

.brand-features {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
  color: #334155;
  font-size: 14px;
  font-weight: 600;
}

.brand-features li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.feature-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.14);
  flex-shrink: 0;
}

.login-card {
  display: grid;
  gap: 22px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 34px 30px;
  background: #ffffff;
  box-shadow: 0 24px 56px rgba(15, 23, 42, 0.08);
}

.login-card__header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
}

.login-card__header p {
  margin: 6px 0 0;
  font-size: 14px;
  color: #64748b;
}

.login-form,
.social-section {
  display: grid;
  gap: 14px;
}

.field-group {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.field-group input {
  width: 100%;
  min-height: 46px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 0 14px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}

.field-group input:focus {
  background: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}

.password-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.password-input-wrap input {
  padding-right: 60px;
}

.password-toggle {
  position: absolute;
  right: 10px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.password-toggle:hover {
  color: #2563eb;
  background: #f1f5f9;
}

.login-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.remember-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #475569;
  font-weight: 600;
  cursor: pointer;
}

.remember-check input {
  width: 16px;
  height: 16px;
  accent-color: #2563eb;
}

.text-link {
  color: #2563eb;
  font-weight: 700;
  text-decoration: none;
}

.text-link:hover {
  text-decoration: underline;
}

.submit-button,
.social-button {
  min-height: 48px;
  border: 1px solid #d7dce3;
  border-radius: 10px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.submit-button {
  border-color: #2563eb;
  background: linear-gradient(135deg, #2563eb, #4f46e5);
  color: #ffffff;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);
}

.submit-button:hover:not(:disabled),
.social-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
}

.submit-button:disabled,
.social-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.provider-mark {
  width: 26px;
  height: 26px;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 900;
}

.provider-google {
  background: #ffffff;
  color: #1f2937;
}

.provider-google .provider-mark {
  background: #eef2ff;
  color: #2563eb;
}

.provider-kakao {
  border-color: #f4d000;
  background: #fee500;
  color: #191600;
}

.provider-kakao .provider-mark {
  background: rgba(25, 22, 0, 0.12);
}

.provider-naver {
  border-color: #03c75a;
  background: #03c75a;
  color: #ffffff;
}

.provider-naver .provider-mark {
  background: rgba(255, 255, 255, 0.2);
}

.section-divider {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: center;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.section-divider::before,
.section-divider::after {
  content: '';
  height: 1px;
  background: #e2e8f0;
}

.error-message {
  margin: 0;
  border-radius: 10px;
  padding: 12px 14px;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #be123c;
  font-size: 13px;
  font-weight: 700;
}

.signup-footer {
  padding-top: 14px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
}

.signup-link {
  color: #2563eb;
  font-weight: 800;
  text-decoration: none;
}

.signup-link:hover {
  text-decoration: underline;
}

@media (max-width: 820px) {
  .login-shell {
    grid-template-columns: 1fr;
    gap: 28px;
  }

  .brand-panel {
    gap: 18px;
  }
}

@media (max-width: 480px) {
  .login-page {
    padding: 16px 12px;
  }

  .login-shell {
    gap: 20px;
  }
}
</style>
