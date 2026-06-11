<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '@/api/user/index.js'
import { useAuthStore } from '@/stores/useAuthStore.js'

const ADMIN_EMAIL = 'admin@fileinnout.local'

const router = useRouter()
const authStore = useAuthStore()

const isLoading = ref(false)
const loginErrorMessage = ref('')

const loginForm = reactive({
  email: ADMIN_EMAIL,
  password: '',
})

const isFormValid = computed(() => loginForm.password.length > 0)

const handleLogin = async () => {
  if (!isFormValid.value || isLoading.value) return

  isLoading.value = true
  loginErrorMessage.value = ''

  try {
    const res = await login(loginForm)
    const authHeader = res.headers['authorization'] || res.headers['Authorization']
    const accessToken = authHeader?.replace('Bearer ', '') || res.data?.accessToken

    if (!accessToken) {
      loginErrorMessage.value = '관리자 로그인 정보를 확인해 주세요.'
      return
    }

    authStore.login(accessToken)
    router.push({ name: 'main' })
  } catch (error) {
    loginErrorMessage.value = '관리자 계정만 로그인할 수 있습니다.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 relative overflow-hidden">
    <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-100 rounded-full blur-[120px] opacity-60" />
    <div class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-50 rounded-full blur-[120px] opacity-60" />

    <div
      class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 w-full max-w-[480px] p-8 md:p-12 z-10"
    >
      <div class="text-center mb-10">
        <router-link to="/" class="inline-flex flex-col items-center cursor-pointer group">
          <div
            class="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 mb-6 group-hover:bg-indigo-700 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          </div>
          <h1 class="text-3xl font-extrabold text-gray-900 tracking-tight group-hover:text-indigo-700 transition">
            FileInNOut
          </h1>
        </router-link>
        <p class="text-gray-500 mt-2 font-medium">관리자 계정으로 로그인하세요</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-5" novalidate>
        <div class="space-y-1.5">
          <label class="flex items-center text-sm font-bold text-gray-700 ml-1">관리자 이메일</label>
          <input
            v-model="loginForm.email"
            type="email"
            readonly
            class="w-full bg-gray-100 border-2 border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-600 outline-none"
          />
        </div>

        <div class="space-y-1.5">
          <label class="flex items-center text-sm font-bold text-gray-700 ml-1">비밀번호</label>
          <input
            v-model="loginForm.password"
            type="password"
            placeholder="관리자 비밀번호"
            autocomplete="current-password"
            class="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3.5 text-sm transition-all outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20"
          />
        </div>

        <div
          v-if="loginErrorMessage"
          class="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 animate-fade-in"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-rose-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
          <p class="text-rose-600 text-xs font-bold leading-tight">{{ loginErrorMessage }}</p>
        </div>

        <button
          :disabled="!isFormValid || isLoading"
          class="w-full relative bg-indigo-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all transform hover:translate-y-[-1px] active:translate-y-[0] shadow-lg shadow-indigo-100 mt-4"
        >
          <span v-if="!isLoading">로그인</span>
          <div v-else class="flex items-center justify-center">
            <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
@keyframes fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out forwards;
}

input {
  -webkit-tap-highlight-color: transparent;
}
</style>
