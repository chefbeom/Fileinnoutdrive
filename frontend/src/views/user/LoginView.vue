<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getOAuthProviders, login } from '@/api/user/index.js'
import { useAuthStore } from '@/stores/useAuthStore.js'
import { apiPath } from '@/utils/backendUrl.js'

const ADMIN_EMAIL = 'admin@fileinnout.local'

const router = useRouter()
const authStore = useAuthStore()

const isLoading = ref(false)
const socialLoadingProvider = ref('')
const loginErrorMessage = ref('')
const socialProviders = ref([])

const loginForm = reactive({
  email: ADMIN_EMAIL,
  password: '',
})

const providerCatalog = [
  { id: 'google', label: 'Google', mark: 'G', className: 'provider-google' },
  { id: 'kakao', label: 'Kakao', mark: 'K', className: 'provider-kakao' },
  { id: 'naver', label: 'Naver', mark: 'N', className: 'provider-naver' },
]

const isFormValid = computed(() => loginForm.password.trim().length > 0)
const hasSocialProviders = computed(() => socialProviders.value.length > 0)

const loadOAuthProviders = async () => {
  try {
    const res = await getOAuthProviders()
    const providers = Array.isArray(res.data?.providers) ? res.data.providers : []
    const providerById = new Map(providers.map((provider) => [provider.id, provider]))

    socialProviders.value = providerCatalog
      .map((provider) => {
        const status = providerById.get(provider.id)
        return {
          ...provider,
          enabled: Boolean(status?.enabled),
          authorizationUrl: status?.authorizationUrl || `/oauth2/authorization/${provider.id}`,
        }
      })
      .filter((provider) => provider.enabled)
  } catch (error) {
    socialProviders.value = []
  }
}

const handleSocialLogin = (provider) => {
  if (socialLoadingProvider.value || !provider?.enabled) return
  socialLoadingProvider.value = provider.id
  window.location.assign(apiPath(provider.authorizationUrl))
}

const handleLogin = async () => {
  if (!isFormValid.value || isLoading.value) return

  isLoading.value = true
  loginErrorMessage.value = ''

  try {
    const res = await login(loginForm)
    const authHeader = res.headers['authorization'] || res.headers['Authorization']
    const accessToken = authHeader?.replace('Bearer ', '') || res.data?.accessToken

    if (!accessToken) {
      loginErrorMessage.value = 'The login response did not include a token.'
      return
    }

    authStore.login(accessToken)
    router.push({ name: 'main' })
  } catch (error) {
    loginErrorMessage.value = 'Check the administrator account credentials.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadOAuthProviders()
})
</script>

<template>
  <div class="login-page">
    <section class="login-shell" aria-labelledby="login-title">
      <div class="brand-panel">
        <router-link to="/" class="brand-link" aria-label="FileInNOut home">
          <span class="brand-icon">F</span>
          <span class="brand-name">FileInNOut</span>
        </router-link>
        <div>
          <h1 id="login-title">Login</h1>
          <p>Continue managing your files and workspaces.</p>
        </div>
      </div>

      <div class="login-card">
        <div v-if="hasSocialProviders" class="social-section">
          <button
            v-for="provider in socialProviders"
            :key="provider.id"
            type="button"
            class="social-button"
            :class="provider.className"
            :disabled="!!socialLoadingProvider"
            @click="handleSocialLogin(provider)"
          >
            <span class="provider-mark">{{ provider.mark }}</span>
            <span>
              {{ socialLoadingProvider === provider.id ? 'Connecting...' : `Continue with ${provider.label}` }}
            </span>
          </button>
        </div>

        <div v-if="hasSocialProviders" class="section-divider">
          <span>Admin login</span>
        </div>

        <form @submit.prevent="handleLogin" class="admin-form" novalidate>
          <label>
            <span>Admin email</span>
            <input v-model="loginForm.email" type="email" readonly />
          </label>

          <label>
            <span>Password</span>
            <input
              v-model="loginForm.password"
              type="password"
              placeholder="Administrator password"
              autocomplete="current-password"
            />
          </label>

          <p v-if="loginErrorMessage" class="error-message">{{ loginErrorMessage }}</p>

          <button type="submit" class="admin-button" :disabled="!isFormValid || isLoading">
            {{ isLoading ? 'Signing in...' : 'Sign in' }}
          </button>
        </form>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px 20px;
  background: #f6f7f9;
  color: #111827;
}

.login-shell {
  width: min(920px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(320px, 420px);
  gap: 32px;
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
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-weight: 800;
}

.brand-name {
  font-size: 18px;
  font-weight: 800;
}

h1 {
  margin: 0;
  font-size: 44px;
  line-height: 1.1;
  font-weight: 900;
  letter-spacing: 0;
}

p {
  margin: 12px 0 0;
  color: #5b6472;
  font-size: 16px;
}

.login-card {
  display: grid;
  gap: 24px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 28px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(17, 24, 39, 0.08);
}

.social-section,
.admin-form {
  display: grid;
  gap: 12px;
}

.social-button,
.admin-button {
  min-height: 48px;
  border: 1px solid #d7dce3;
  border-radius: 8px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-weight: 800;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.social-button:hover:not(:disabled),
.admin-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(17, 24, 39, 0.1);
}

.social-button:disabled,
.admin-button:disabled {
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
  background: #fff;
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
  color: #fff;
}

.provider-naver .provider-mark {
  background: rgba(255, 255, 255, 0.2);
}

.section-divider {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: center;
  color: #7b8494;
  font-size: 13px;
  font-weight: 800;
}

.section-divider::before,
.section-divider::after {
  content: '';
  height: 1px;
  background: #e5e7eb;
}

label {
  display: grid;
  gap: 6px;
  color: #374151;
  font-size: 13px;
  font-weight: 800;
}

input {
  width: 100%;
  min-height: 46px;
  border: 1px solid #d7dce3;
  border-radius: 8px;
  padding: 0 14px;
  background: #fff;
  color: #111827;
  outline: none;
}

input:read-only {
  background: #f3f4f6;
  color: #5b6472;
}

input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
}

.error-message {
  margin: 0;
  border-radius: 8px;
  padding: 12px;
  background: #fff1f2;
  color: #be123c;
  font-size: 13px;
  font-weight: 700;
}

.admin-button {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

@media (max-width: 760px) {
  .login-shell {
    grid-template-columns: 1fr;
  }

  h1 {
    font-size: 34px;
  }

  .brand-panel {
    gap: 18px;
  }
}
</style>
