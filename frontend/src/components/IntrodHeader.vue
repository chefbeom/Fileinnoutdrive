<script setup>
import { onMounted, computed, ref, onBeforeUnmount } from 'vue';
import BrandLogoIcon from '@/components/BrandLogoIcon.vue';
import { useAuthStore } from '@/stores/useAuthStore.js';
import { useRouter } from 'vue-router';
const authStore = useAuthStore();
const router = useRouter();

// 로그인 여부 및 사용자 정보
const isLoggedIn = computed(() => !!authStore.token);
const userName = computed(() => {
  if (authStore.user) {
    return authStore.user.userName || authStore.user.name || authStore.user.nickname;
  }
  return '사용자';
});

// 드롭다운 상태 관리
const showProfileDropdown = ref(false);

const toggleProfileMenu = () => {
  showProfileDropdown.value = !showProfileDropdown.value;
};

const handleLogout = async () => {
  if (confirm("로그아웃 하시겠습니까?")) {
    await authStore.logout();
    router.push('/login');
  }
};

// 외부 클릭 시 드롭다운 닫기
const handleClickOutside = (event) => {
  if (!event.target.closest('#profile-container')) {
    showProfileDropdown.value = false;
  }
};

onMounted(() => {
  document.documentElement.classList.remove('dark');
  document.addEventListener('click', handleClickOutside);
  if (!authStore.checkLogin()) authStore.ensureSession().catch(() => {});
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <nav class="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-10 sm:py-5 sticky top-0 bg-white/90 backdrop-blur-md border-b border-gray-200 z-50">
    <RouterLink :to="isLoggedIn ? { name: 'home' } : { name: 'intro' }" class="flex items-center gap-2 sm:gap-3 min-w-0">
      <BrandLogoIcon class="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-[9px] shadow-md shadow-blue-200/80" />
      <div class="font-bold text-lg sm:text-2xl tracking-tight text-gray-900 truncate">FileInNOut</div>
    </RouterLink>

    <div class="flex items-center gap-3 sm:gap-8 text-xs sm:text-sm font-semibold shrink-0">
      
      
      <template v-if="!isLoggedIn">
        <RouterLink :to="{ name: 'payment' }" class="text-gray-500 hover:text-blue-600 transition whitespace-nowrap">요금제</RouterLink>
        <RouterLink
          :to="{ name: 'login' }"
          class="bg-blue-600 text-white px-4 py-2 sm:px-6 sm:py-2.5 rounded-full hover:bg-blue-700 transition shadow-md shadow-blue-100 whitespace-nowrap"
        >
          로그인
        </RouterLink>
      </template>

      <div v-else class="relative" id="profile-container">
        <div @click="toggleProfileMenu" class="flex items-center gap-3 cursor-pointer group">
          <div class="text-right hidden md:block">
            <p class="text-sm font-bold text-gray-900">{{ userName }}님</p>
            <p class="text-[10px] text-blue-600 font-bold uppercase tracking-tighter">내 계정</p>
          </div>
          <img 
            :src="`https://ui-avatars.com/api/?name=${userName}&background=2563eb&color=fff&bold=true`" 
            class="w-10 h-10 rounded-xl border-2 border-transparent group-hover:border-blue-400 transition-all"
            :alt="userName"
          >
        </div>

        <div v-if="showProfileDropdown" class="absolute top-full right-0 mt-3 w-56 bg-white border border-gray-100 rounded-2xl shadow-xl py-2 z-50">
          <div class="px-4 py-3 border-b border-gray-50">
            <p class="text-[11px] text-gray-400 font-bold uppercase">사용자 계정</p>
            <p class="text-sm font-bold text-gray-800 truncate">{{ authStore.user?.email }}</p>
          </div>
          <div class="py-1">
            <RouterLink :to="{ name: 'home' }" class="flex items-center gap-3 px-4 py-2.5 text-gray-600 hover:bg-gray-50 transition">
              <i class="fa-solid fa-gauge-high text-xs"></i>
              <span class="text-xs font-bold">대시보드 가기</span>
            </RouterLink>
          </div>
          <div class="border-t border-gray-50 pt-1">
            <button @click="handleLogout" class="w-full flex items-center gap-3 px-4 py-2.5 text-red-500 hover:bg-red-50 transition">
              <i class="fa-solid fa-right-from-bracket text-xs"></i>
              <span class="text-xs font-black">로그아웃</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
nav {
  background-color: var(--bg-main); /* theme.css의 변수 사용 */
  border-color: var(--border-color);
}
.font-bold {
  color: var(--text-main);
}
</style>
