<script setup>
import { formatDocumentTime, roleLabel } from '../services/workspacePresentation.js'

const props = defineProps({
  documentQuery: { type: String, default: '' },
  sectionNameDraft: { type: String, default: '' },
  sectionEditingId: { type: String, default: '' },
  sectionEditDraft: { type: String, default: '' },
  documentsLoading: { type: Boolean, default: false },
  currentWorkspaceKey: { type: String, default: '' },
  favoriteDocuments: { type: Array, default: () => [] },
  recentDocuments: { type: Array, default: () => [] },
  documentSections: { type: Array, default: () => [] },
  visibleSectionViews: { type: Array, default: () => [] },
  sectionedDocumentCount: { type: Number, default: 0 },
  personalDocuments: { type: Array, default: () => [] },
  sharedDocuments: { type: Array, default: () => [] },
  canModifyPage: { type: Boolean, default: false },
  hasEditor: { type: Boolean, default: false },
  isDocumentFavorite: { type: Function, default: () => false },
  documentSectionId: { type: Function, default: () => '' },
  isDocumentActionLoading: { type: Function, default: () => false },
})

const emit = defineEmits([
  'update:documentQuery',
  'update:sectionNameDraft',
  'update:sectionEditDraft',
  'register-section-edit-input',
  'open-command-palette',
  'create-document',
  'create-section',
  'save-section-rename',
  'cancel-section-rename',
  'toggle-section',
  'start-section-rename',
  'remove-section',
  'open-document',
  'toggle-favorite',
  'move-section',
  'insert-link',
  'copy-link',
  'duplicate-document',
  'remove-document',
])

const bindSectionEditInput = (element) => {
  emit('register-section-edit-input', element)
}

const isCurrentDocument = (document) => String(document?.id) === props.currentWorkspaceKey
const documentIconLabel = (document) => document?.scope === 'shared' ? '공유' : '문서'
const removeDocumentTitle = (document) => String(document?.role).toUpperCase() === 'ADMIN' ? '삭제' : '목록에서 제거'
</script>

<template>
  <aside class="workspace-doc-sidebar">
    <div class="workspace-doc-sidebar__top">
      <div>
        <p class="workspace-doc-sidebar__eyebrow">Workspace</p>
        <h2>협업 문서</h2>
      </div>
      <div class="workspace-doc-sidebar__actions">
        <button
          type="button"
          class="workspace-command-open-btn"
          title="빠른 명령 Ctrl+K"
          @click="emit('open-command-palette')"
        >
          <i class="fa-solid fa-bolt"></i>
        </button>
        <button type="button" class="workspace-new-page-btn" title="새 페이지" @click="emit('create-document')">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
    </div>

    <label class="workspace-doc-search">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input
        :value="documentQuery"
        type="search"
        placeholder="문서 검색"
        @input="emit('update:documentQuery', $event.target.value)"
      />
    </label>

    <form class="workspace-section-composer" @submit.prevent="emit('create-section')">
      <input
        :value="sectionNameDraft"
        type="text"
        maxlength="32"
        placeholder="섹션 추가"
        @input="emit('update:sectionNameDraft', $event.target.value)"
      />
      <button type="submit" :disabled="!sectionNameDraft.trim()" title="섹션 추가">
        <i class="fa-solid fa-folder-plus"></i>
      </button>
    </form>

    <div v-if="documentsLoading" class="workspace-doc-empty">문서 목록을 불러오는 중입니다.</div>
    <div v-else class="workspace-doc-sections">
      <section v-if="favoriteDocuments.length > 0" class="workspace-doc-section workspace-doc-section--favorites">
        <div class="workspace-doc-section__header">
          <span>즐겨찾기</span>
          <strong>{{ favoriteDocuments.length }}</strong>
        </div>
        <article
          v-for="document in favoriteDocuments"
          :key="`favorite-${document.id}`"
          class="workspace-doc-item workspace-doc-item--favorite"
          :class="{ 'workspace-doc-item--active': isCurrentDocument(document) }"
        >
          <button type="button" class="workspace-doc-item__main" @click="emit('open-document', document)">
            <span class="workspace-doc-item__icon" :class="{ 'workspace-doc-item__icon--shared': document.scope === 'shared' }">
              {{ documentIconLabel(document) }}
            </span>
            <span class="workspace-doc-item__body">
              <strong>{{ document.title }}</strong>
              <small>{{ formatDocumentTime(document.updatedAt) }} · {{ roleLabel(document.role) }}</small>
            </span>
          </button>
          <div class="workspace-doc-item__actions">
            <button type="button" class="workspace-doc-action-btn workspace-doc-action-btn--favorite" title="즐겨찾기 해제" @click.stop="emit('toggle-favorite', document)">
              <i class="fa-solid fa-star"></i>
            </button>
            <select
              v-if="documentSections.length > 0"
              class="workspace-doc-section-select"
              :value="documentSectionId(document)"
              title="섹션 이동"
              @change.stop="emit('move-section', document, $event.target.value)"
            >
              <option value="">섹션 없음</option>
              <option v-for="section in documentSections" :key="`favorite-section-${document.id}-${section.id}`" :value="section.id">
                {{ section.name }}
              </option>
            </select>
            <button type="button" class="workspace-doc-action-btn workspace-doc-action-btn--link" :disabled="!canModifyPage || !hasEditor" title="본문에 링크 삽입" @click.stop="emit('insert-link', document)">
              <i class="fa-solid fa-link"></i>
            </button>
            <button type="button" class="workspace-doc-action-btn" title="페이지 링크 복사" @click.stop="emit('copy-link', document)">
              <i class="fa-regular fa-clipboard"></i>
            </button>
            <button type="button" class="workspace-doc-action-btn" :disabled="isDocumentActionLoading(document, 'duplicate')" title="복제" @click.stop="emit('duplicate-document', document)">
              <i class="fa-regular fa-copy"></i>
            </button>
            <button type="button" class="workspace-doc-action-btn workspace-doc-action-btn--danger" :disabled="isDocumentActionLoading(document, 'remove')" :title="removeDocumentTitle(document)" @click.stop="emit('remove-document', document)">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </article>
      </section>
      <section v-if="recentDocuments.length > 0" class="workspace-doc-section workspace-doc-section--recent">
        <div class="workspace-doc-section__header">
          <span>최근 문서</span>
          <strong>{{ recentDocuments.length }}</strong>
        </div>
        <article
          v-for="document in recentDocuments"
          :key="`recent-${document.id}`"
          class="workspace-doc-item workspace-doc-item--recent"
          :class="{ 'workspace-doc-item--active': isCurrentDocument(document) }"
        >
          <button type="button" class="workspace-doc-item__main" @click="emit('open-document', document)">
            <span class="workspace-doc-item__icon" :class="{ 'workspace-doc-item__icon--shared': document.scope === 'shared' }">
              {{ documentIconLabel(document) }}
            </span>
            <span class="workspace-doc-item__body">
              <strong>{{ document.title }}</strong>
              <small>{{ formatDocumentTime(document.updatedAt) }} · {{ roleLabel(document.role) }}</small>
            </span>
          </button>
          <div class="workspace-doc-item__actions">
            <button
              type="button"
              class="workspace-doc-action-btn workspace-doc-action-btn--favorite"
              :class="{ 'workspace-doc-action-btn--favorite-active': isDocumentFavorite(document) }"
              :title="isDocumentFavorite(document) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
              @click.stop="emit('toggle-favorite', document)"
            >
              <i :class="isDocumentFavorite(document) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
            </button>
            <button type="button" class="workspace-doc-action-btn workspace-doc-action-btn--link" :disabled="!canModifyPage || !hasEditor" title="본문에 링크 삽입" @click.stop="emit('insert-link', document)">
              <i class="fa-solid fa-link"></i>
            </button>
            <button type="button" class="workspace-doc-action-btn" title="페이지 링크 복사" @click.stop="emit('copy-link', document)">
              <i class="fa-regular fa-clipboard"></i>
            </button>
          </div>
        </article>
      </section>

      <section v-if="documentSections.length > 0" class="workspace-doc-section workspace-doc-section--groups">
        <div class="workspace-doc-section__header">
          <span>섹션</span>
          <strong>{{ sectionedDocumentCount }}</strong>
        </div>

        <article v-for="section in visibleSectionViews" :key="section.id" class="workspace-doc-group">
          <div class="workspace-doc-group__header">
            <form v-if="sectionEditingId === section.id" class="workspace-doc-group__rename" @submit.prevent="emit('save-section-rename')">
              <input
                :ref="bindSectionEditInput"
                :value="sectionEditDraft"
                type="text"
                maxlength="32"
                aria-label="섹션 이름"
                @input="emit('update:sectionEditDraft', $event.target.value)"
                @keydown.esc.prevent="emit('cancel-section-rename')"
              />
              <button type="submit" class="workspace-doc-action-btn" :disabled="!sectionEditDraft.trim()" title="섹션 이름 저장">
                <i class="fa-solid fa-check"></i>
              </button>
              <button type="button" class="workspace-doc-action-btn" title="섹션 이름 변경 취소" @click="emit('cancel-section-rename')">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </form>
            <button v-else type="button" class="workspace-doc-group__toggle" :aria-expanded="!section.collapsed" @click="emit('toggle-section', section.id)">
              <i :class="section.collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'"></i>
              <span>{{ section.name }}</span>
              <strong>{{ section.documents.length }}</strong>
            </button>
            <div class="workspace-doc-group__actions">
              <button type="button" class="workspace-doc-action-btn" title="섹션 이름 변경" @click="emit('start-section-rename', section)">
                <i class="fa-regular fa-pen-to-square"></i>
              </button>
              <button type="button" class="workspace-doc-action-btn workspace-doc-action-btn--danger" title="섹션 삭제" @click="emit('remove-section', section)">
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </div>

          <div v-if="!section.collapsed" class="workspace-doc-group__items">
            <article
              v-for="document in section.documents"
              :key="`section-${section.id}-${document.id}`"
              class="workspace-doc-item workspace-doc-item--nested"
              :class="{ 'workspace-doc-item--active': isCurrentDocument(document) }"
            >
              <button type="button" class="workspace-doc-item__main" @click="emit('open-document', document)">
                <span class="workspace-doc-item__icon" :class="{ 'workspace-doc-item__icon--shared': document.scope === 'shared' }">
                  {{ documentIconLabel(document) }}
                </span>
                <span class="workspace-doc-item__body">
                  <strong>{{ document.title }}</strong>
                  <small>{{ formatDocumentTime(document.updatedAt) }} · {{ roleLabel(document.role) }}</small>
                </span>
              </button>
              <div class="workspace-doc-item__actions">
                <button
                  type="button"
                  class="workspace-doc-action-btn workspace-doc-action-btn--favorite"
                  :class="{ 'workspace-doc-action-btn--favorite-active': isDocumentFavorite(document) }"
                  :title="isDocumentFavorite(document) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
                  @click.stop="emit('toggle-favorite', document)"
                >
                  <i :class="isDocumentFavorite(document) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
                </button>
                <select v-if="documentSections.length > 0" class="workspace-doc-section-select" :value="documentSectionId(document)" title="섹션 이동" @change.stop="emit('move-section', document, $event.target.value)">
                  <option value="">섹션 없음</option>
                  <option v-for="targetSection in documentSections" :key="`section-move-${document.id}-${targetSection.id}`" :value="targetSection.id">
                    {{ targetSection.name }}
                  </option>
                </select>
                <button type="button" class="workspace-doc-action-btn workspace-doc-action-btn--link" :disabled="!canModifyPage || !hasEditor" title="본문에 링크 삽입" @click.stop="emit('insert-link', document)">
                  <i class="fa-solid fa-link"></i>
                </button>
                <button type="button" class="workspace-doc-action-btn" title="페이지 링크 복사" @click.stop="emit('copy-link', document)">
                  <i class="fa-regular fa-clipboard"></i>
                </button>
                <button type="button" class="workspace-doc-action-btn" :disabled="isDocumentActionLoading(document, 'duplicate')" title="복제" @click.stop="emit('duplicate-document', document)">
                  <i class="fa-regular fa-copy"></i>
                </button>
                <button type="button" class="workspace-doc-action-btn workspace-doc-action-btn--danger" :disabled="isDocumentActionLoading(document, 'remove')" :title="removeDocumentTitle(document)" @click.stop="emit('remove-document', document)">
                  <i class="fa-regular fa-trash-can"></i>
                </button>
              </div>
            </article>
            <div v-if="section.documents.length === 0" class="workspace-doc-empty">
              이 섹션에 문서가 없습니다.
            </div>
          </div>
        </article>
      </section>
      <section class="workspace-doc-section">
        <div class="workspace-doc-section__header">
          <span>내 페이지</span>
          <strong>{{ personalDocuments.length }}</strong>
        </div>
        <article
          v-for="document in personalDocuments"
          :key="`personal-${document.id}`"
          class="workspace-doc-item"
          :class="{ 'workspace-doc-item--active': isCurrentDocument(document) }"
        >
          <button type="button" class="workspace-doc-item__main" @click="emit('open-document', document)">
            <span class="workspace-doc-item__icon">문서</span>
            <span class="workspace-doc-item__body">
              <strong>{{ document.title }}</strong>
              <small>{{ formatDocumentTime(document.updatedAt) }} · {{ roleLabel(document.role) }}</small>
            </span>
          </button>
          <div class="workspace-doc-item__actions">
            <button
              type="button"
              class="workspace-doc-action-btn workspace-doc-action-btn--favorite"
              :class="{ 'workspace-doc-action-btn--favorite-active': isDocumentFavorite(document) }"
              :title="isDocumentFavorite(document) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
              @click.stop="emit('toggle-favorite', document)"
            >
              <i :class="isDocumentFavorite(document) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
            </button>
            <select v-if="documentSections.length > 0" class="workspace-doc-section-select" :value="documentSectionId(document)" title="섹션 이동" @change.stop="emit('move-section', document, $event.target.value)">
              <option value="">섹션 없음</option>
              <option v-for="section in documentSections" :key="`personal-section-${document.id}-${section.id}`" :value="section.id">
                {{ section.name }}
              </option>
            </select>
            <button type="button" class="workspace-doc-action-btn workspace-doc-action-btn--link" :disabled="!canModifyPage || !hasEditor" title="본문에 링크 삽입" @click.stop="emit('insert-link', document)">
              <i class="fa-solid fa-link"></i>
            </button>
            <button type="button" class="workspace-doc-action-btn" title="페이지 링크 복사" @click.stop="emit('copy-link', document)">
              <i class="fa-regular fa-clipboard"></i>
            </button>
            <button type="button" class="workspace-doc-action-btn" :disabled="isDocumentActionLoading(document, 'duplicate')" title="복제" @click="emit('duplicate-document', document)">
              <i class="fa-regular fa-copy"></i>
            </button>
            <button type="button" class="workspace-doc-action-btn workspace-doc-action-btn--danger" :disabled="isDocumentActionLoading(document, 'remove')" :title="removeDocumentTitle(document)" @click="emit('remove-document', document)">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </article>
        <div v-if="personalDocuments.length === 0" class="workspace-doc-empty">
          내 페이지가 없습니다.
        </div>
      </section>

      <section class="workspace-doc-section">
        <div class="workspace-doc-section__header">
          <span>공유됨</span>
          <strong>{{ sharedDocuments.length }}</strong>
        </div>
        <article
          v-for="document in sharedDocuments"
          :key="`shared-${document.id}`"
          class="workspace-doc-item"
          :class="{ 'workspace-doc-item--active': isCurrentDocument(document) }"
        >
          <button type="button" class="workspace-doc-item__main" @click="emit('open-document', document)">
            <span class="workspace-doc-item__icon workspace-doc-item__icon--shared">공유</span>
            <span class="workspace-doc-item__body">
              <strong>{{ document.title }}</strong>
              <small>{{ formatDocumentTime(document.updatedAt) }} · {{ roleLabel(document.role) }}</small>
            </span>
          </button>
          <div class="workspace-doc-item__actions">
            <button
              type="button"
              class="workspace-doc-action-btn workspace-doc-action-btn--favorite"
              :class="{ 'workspace-doc-action-btn--favorite-active': isDocumentFavorite(document) }"
              :title="isDocumentFavorite(document) ? '즐겨찾기 해제' : '즐겨찾기 추가'"
              @click.stop="emit('toggle-favorite', document)"
            >
              <i :class="isDocumentFavorite(document) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
            </button>
            <select v-if="documentSections.length > 0" class="workspace-doc-section-select" :value="documentSectionId(document)" title="섹션 이동" @change.stop="emit('move-section', document, $event.target.value)">
              <option value="">섹션 없음</option>
              <option v-for="section in documentSections" :key="`shared-section-${document.id}-${section.id}`" :value="section.id">
                {{ section.name }}
              </option>
            </select>
            <button type="button" class="workspace-doc-action-btn workspace-doc-action-btn--link" :disabled="!canModifyPage || !hasEditor" title="본문에 링크 삽입" @click.stop="emit('insert-link', document)">
              <i class="fa-solid fa-link"></i>
            </button>
            <button type="button" class="workspace-doc-action-btn" title="페이지 링크 복사" @click.stop="emit('copy-link', document)">
              <i class="fa-regular fa-clipboard"></i>
            </button>
            <button type="button" class="workspace-doc-action-btn" :disabled="isDocumentActionLoading(document, 'duplicate')" title="복제" @click="emit('duplicate-document', document)">
              <i class="fa-regular fa-copy"></i>
            </button>
            <button type="button" class="workspace-doc-action-btn workspace-doc-action-btn--danger" :disabled="isDocumentActionLoading(document, 'remove')" :title="removeDocumentTitle(document)" @click="emit('remove-document', document)">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </article>
        <div v-if="sharedDocuments.length === 0" class="workspace-doc-empty">
          공유 페이지가 없습니다.
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped src="../styles/02-sidebar-docs.css"></style>