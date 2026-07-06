<script setup>
import {
  formatChatDateTime as formatDateTime,
  participantInitial,
  participantReadLabel,
} from './chatRoomViewModel.js'

defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  participants: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['close', 'retry'])
</script>

<template>
  <div
    v-if="isOpen"
    class="absolute inset-0 z-[70] bg-black/10 md:hidden"
    @click="emit('close')"
  ></div>

  <aside
    v-if="isOpen"
    class="absolute inset-y-0 right-0 z-[80] flex w-full max-w-[320px] flex-col border-l border-gray-100 bg-white shadow-2xl"
  >
    <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
      <div>
        <p class="text-sm font-bold text-[var(--text-main)]">참여자</p>
        <p class="text-[10px] text-[var(--text-muted)]">{{ participants.length }}명</p>
      </div>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          @click="emit('retry')"
        >
          <i class="fa-solid fa-rotate-right text-[11px]"></i>
        </button>
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          @click="emit('close')"
        >
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="loading" class="flex justify-center py-10 text-xs text-gray-400">
        <i class="fa-solid fa-circle-notch fa-spin mr-2"></i> 불러오는 중...
      </div>

      <div v-else-if="error" class="rounded-lg bg-red-50 p-3 text-xs text-red-500">
        <p>{{ error }}</p>
        <button type="button" class="mt-2 font-bold" @click="emit('retry')">다시 시도</button>
      </div>

      <div v-else-if="!participants.length" class="py-10 text-center text-xs text-gray-400">
        참여자가 없습니다.
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="participant in participants"
          :key="participant.id || participant.userIdx"
          class="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2"
        >
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
            {{ participantInitial(participant) }}
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center gap-1.5">
              <p class="truncate text-xs font-bold text-[var(--text-main)]">{{ participant.nickname }}</p>
              <span
                v-if="participant.isMe"
                class="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-[#4169E1]"
              >
                나
              </span>
            </div>
            <p v-if="participant.email" class="truncate text-[10px] text-[var(--text-muted)]">
              {{ participant.email }}
            </p>
            <p class="text-[9px] text-gray-400">
              {{ formatDateTime(participant.joinedAt) }} 참여
            </p>
          </div>

          <span class="shrink-0 text-[9px] font-semibold text-gray-400">
            {{ participantReadLabel(participant) }}
          </span>
        </div>
      </div>
    </div>
  </aside>
</template>
