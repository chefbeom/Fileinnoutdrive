<template>
  <div class="layout-customizer">
    <!-- Top Live Preview + Presets -->
    <div class="settings-card lc-card">
      <div class="lc-card__head">
        <div>
          <h3 class="settings-section__title">실시간 레이아웃 미리보기 &amp; 프리셋</h3>
          <p class="settings-help">
            버튼을 왼쪽 사이드바 또는 맨 위 검색창 영역으로 옮기고 개인·협업 페이지 표시 여부를 즉시 조절할 수 있습니다.
          </p>
        </div>
        <div class="lc-head-actions">
          <button
            v-if="uiLayoutStore.syncError"
            type="button"
            class="lc-sync-badge is-error"
            title="클릭하여 서버에 다시 저장"
            @click="uiLayoutStore.flushServerSave()"
          >
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>서버 저장 실패 · 다시 시도</span>
          </button>
          <span
            v-else
            class="lc-sync-badge"
            :class="{
              'is-saving': uiLayoutStore.isSaving || uiLayoutStore.isHydrating,
              'is-pending': !uiLayoutStore.isSaving && !uiLayoutStore.isHydrating && uiLayoutStore.hasPendingSave,
            }"
          >
            <i
              :class="
                uiLayoutStore.isSaving || uiLayoutStore.isHydrating
                  ? 'fa-solid fa-rotate fa-spin'
                  : uiLayoutStore.hasPendingSave
                    ? 'fa-regular fa-clock'
                    : 'fa-solid fa-cloud-arrow-up'
              "
            ></i>
            <span>
              {{
                uiLayoutStore.isHydrating
                  ? "서버 설정 불러오는 중..."
                  : uiLayoutStore.isSaving
                    ? "서버에 저장 중..."
                    : uiLayoutStore.hasPendingSave
                      ? "서버 저장 대기 중..."
                      : "서버에 저장됨 (다른 기기 유지)"
              }}
            </span>
          </span>
          <button type="button" class="lc-chip-btn" @click="uiLayoutStore.resetToDefaults()">
            <i class="fa-solid fa-rotate-left"></i>
            <span>기본값 복원</span>
          </button>
        </div>
      </div>

      <p v-if="uiLayoutStore.syncError" class="settings-error">
        {{ uiLayoutStore.syncError }}
      </p>

      <!-- Mini Live Wireframe Preview -->
      <div class="lc-preview-shell">
        <div class="lc-preview-app">
          <!-- Sidebar Wireframe -->
          <aside class="lc-preview-sidebar" :class="{ 'is-compact': layout.sidebarCompactMode }">
            <div class="lc-preview-logo">
              <span class="lc-preview-dot"></span>
              <span>FileInOut</span>
            </div>
            <div v-if="layout.showSidebarUploadButton" class="lc-preview-upload">+ 업로드</div>
            <div class="lc-preview-sections">
              <template v-for="section in orderedSidebarSections" :key="section.id">
                <div
                  v-if="section.id === 'nav'"
                  class="lc-preview-section"
                  :class="{ 'is-hidden-sec': !layout.showSidebarNavSection }"
                >
                  <div class="lc-preview-sec-title">주 메뉴</div>
                  <div v-if="layout.showSidebarNavSection && sidebarPrimaryNavItems.length" class="lc-preview-nav-list">
                    <span v-for="item in sidebarPrimaryNavItems" :key="item.id" class="lc-preview-pill">
                      <i :class="item.icon"></i>
                      <span>{{ item.shortLabel }}</span>
                    </span>
                  </div>
                  <div v-else class="lc-preview-empty">상단 이동 / 숨김</div>
                </div>

                <div
                  v-else-if="section.id === 'recentFiles'"
                  class="lc-preview-section"
                  :class="{ 'is-hidden-sec': !layout.showSidebarRecentSection }"
                >
                  <div class="lc-preview-sec-title">
                    최근 파일
                    <em v-if="!layout.showSidebarRecentSection">숨김</em>
                  </div>
                </div>

                <div
                  v-else-if="section.id === 'personalPages'"
                  class="lc-preview-section"
                  :class="{ 'is-hidden-sec': !layout.showPersonalPages }"
                >
                  <div class="lc-preview-sec-title">
                    개인 페이지
                    <em v-if="!layout.showPersonalPages">숨김</em>
                  </div>
                </div>

                <div
                  v-else-if="section.id === 'sharedPages'"
                  class="lc-preview-section"
                  :class="{ 'is-hidden-sec': !layout.showSharedPages }"
                >
                  <div class="lc-preview-sec-title">
                    협업 페이지
                    <em v-if="!layout.showSharedPages">숨김</em>
                  </div>
                </div>

                <div
                  v-else-if="section.id === 'utilities'"
                  class="lc-preview-section"
                  :class="{ 'is-hidden-sec': !layout.showSidebarUtilitiesSection }"
                >
                  <div class="lc-preview-sec-title">
                    유틸리티
                    <em v-if="!layout.showSidebarUtilitiesSection">숨김</em>
                  </div>
                </div>
              </template>
            </div>
          </aside>

          <!-- Main Column Wireframe -->
          <div class="lc-preview-main">
            <!-- Main Header Row -->
            <div class="lc-preview-header">
              <div
                v-if="layout.showHeaderSearchBar"
                class="lc-preview-search"
                :class="{ 'is-compact': layout.headerSearchCompact }"
              >
                <i class="fa-solid fa-magnifying-glass"></i>
                <span>검색창</span>
              </div>
              <div v-else class="lc-preview-search is-disabled">검색창 숨김</div>

              <!-- Mode 1: After-Search (Same Horizontal Row) -->
              <div
                v-if="layout.headerNavPosition !== 'right-actions' && headerNavItems.length"
                class="lc-preview-inline-nav"
                :class="`is-align-${layout.headerNavAlign}`"
              >
                <span v-for="item in headerNavItems" :key="item.id" class="lc-preview-hbtn">
                  <i :class="item.icon"></i>
                  <span v-if="layout.headerNavStyle !== 'icon-only'">{{ item.shortLabel }}</span>
                </span>
              </div>

              <!-- Right Action Cluster -->
              <div class="lc-preview-actions">
                <template v-if="layout.headerNavPosition === 'right-actions' && headerNavItems.length">
                  <span v-for="item in headerNavItems" :key="item.id" class="lc-preview-hbtn is-mini">
                    <i :class="item.icon"></i>
                    <span v-if="layout.headerNavStyle !== 'icon-only'">{{ item.shortLabel }}</span>
                  </span>
                </template>
                <span v-for="action in visibleHeaderActions" :key="action.id" class="lc-preview-icon-dot" :title="action.label">
                  <i :class="action.icon"></i>
                </span>
                <span class="lc-preview-avatar">나</span>
              </div>
            </div>

            <div class="lc-preview-canvas">
              <span>본문 작업 영역</span>
            </div>

            <div v-if="layout.showMobileBottomNav" class="lc-preview-mobile-bar">
              <span>모바일 하단:</span>
              <span v-for="item in mobileBottomNavItems" :key="item.id" class="lc-preview-mbtn">
                <i :class="item.icon"></i>
                <span>{{ item.shortLabel }}</span>
              </span>
              <span class="lc-preview-mbtn">메뉴</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Presets Grid -->
      <div class="lc-preset-grid">
        <button
          v-for="preset in presets"
          :key="preset.id"
          type="button"
          class="lc-preset-card"
          :class="{ 'is-active': layout.presetId === preset.id }"
          @click="uiLayoutStore.applyPreset(preset.id)"
        >
          <div class="lc-preset-card__top">
            <strong>{{ preset.name }}</strong>
            <span class="lc-preset-badge">{{ preset.badge }}</span>
          </div>
          <p>{{ preset.description }}</p>
        </button>
      </div>
    </div>

    <!-- Navigation Item Placements -->
    <div class="settings-card lc-card">
      <h3 class="settings-section__title">메뉴 버튼 위치 지정</h3>
      <p class="settings-help">
        예: <strong>미디어</strong>, <strong>사진첩</strong> 버튼을 <strong>상단 바</strong>로 설정하면 왼쪽 사이드바 대신 맨 위 검색창 영역으로 이동합니다.
      </p>

      <div class="lc-placement-list">
        <div v-for="item in navItemsCatalog" :key="item.id" class="lc-placement-row">
          <div class="lc-placement-row__info">
            <span class="lc-item-icon"><i :class="item.icon"></i></span>
            <div>
              <div class="lc-item-title">{{ item.label }}</div>
              <div class="lc-item-desc">{{ item.description }}</div>
            </div>
          </div>

          <div class="lc-segmented" role="group" :aria-label="`${item.label} 위치 선택`">
            <button
              v-for="opt in placementOptions"
              :key="opt.value"
              type="button"
              class="lc-segmented__btn"
              :class="{ 'is-active': layout.navPlacements[item.id] === opt.value }"
              @click="uiLayoutStore.setNavPlacement(item.id, opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Reordering Placed Items -->
      <div class="lc-order-columns">
        <div class="lc-order-box">
          <div class="lc-order-box__head">
            <span>상단 바 배치 버튼 순서</span>
            <small>드래그 또는 화살표</small>
          </div>
          <div v-if="headerNavItems.length" class="lc-order-items">
            <div
              v-for="(item, idx) in headerNavItems"
              :key="item.id"
              class="lc-order-chip"
              draggable="true"
              @dragstart="onDragStart('header', item.id)"
              @dragover.prevent
              @drop="onDrop('header', item.id)"
            >
              <span class="lc-order-chip__label">
                <i class="fa-solid fa-grip-vertical lc-grip"></i>
                <i :class="item.icon"></i>
                <span>{{ item.label }}</span>
              </span>
              <span class="lc-order-arrows">
                <button
                  type="button"
                  :disabled="idx === 0"
                  title="앞으로 이동"
                  @click="uiLayoutStore.moveNavItem('header', item.id, -1)"
                >
                  <i class="fa-solid fa-arrow-up"></i>
                </button>
                <button
                  type="button"
                  :disabled="idx === headerNavItems.length - 1"
                  title="뒤로 이동"
                  @click="uiLayoutStore.moveNavItem('header', item.id, 1)"
                >
                  <i class="fa-solid fa-arrow-down"></i>
                </button>
              </span>
            </div>
          </div>
          <p v-else class="lc-empty-tip">
            위 표에서 원하는 버튼의 위치를 <strong>상단 바</strong> 또는 <strong>둘 다</strong>로 변경하면 여기에 표시됩니다.
          </p>
        </div>

        <div class="lc-order-box">
          <div class="lc-order-box__head">
            <span>왼쪽 사이드바 주 메뉴 순서</span>
            <small>드래그 또는 화살표</small>
          </div>
          <div v-if="sidebarPrimaryNavItems.length" class="lc-order-items">
            <div
              v-for="(item, idx) in sidebarPrimaryNavItems"
              :key="item.id"
              class="lc-order-chip"
              draggable="true"
              @dragstart="onDragStart('sidebar', item.id)"
              @dragover.prevent
              @drop="onDrop('sidebar', item.id)"
            >
              <span class="lc-order-chip__label">
                <i class="fa-solid fa-grip-vertical lc-grip"></i>
                <i :class="item.icon"></i>
                <span>{{ item.label }}</span>
              </span>
              <span class="lc-order-arrows">
                <button
                  type="button"
                  :disabled="idx === 0"
                  title="위로 이동"
                  @click="uiLayoutStore.moveNavItem('sidebar', item.id, -1)"
                >
                  <i class="fa-solid fa-arrow-up"></i>
                </button>
                <button
                  type="button"
                  :disabled="idx === sidebarPrimaryNavItems.length - 1"
                  title="아래로 이동"
                  @click="uiLayoutStore.moveNavItem('sidebar', item.id, 1)"
                >
                  <i class="fa-solid fa-arrow-down"></i>
                </button>
              </span>
            </div>
          </div>
          <p v-else class="lc-empty-tip">왼쪽 사이드바 주 메뉴가 모두 숨겨졌거나 상단 바로 이동되었습니다.</p>
        </div>
      </div>
    </div>

    <!-- Header Customization -->
    <div class="settings-card lc-card">
      <h3 class="settings-section__title">상단 검색창 · 헤더 세부 설정</h3>
      <div class="lc-grid-options">
        <div class="lc-option-block">
          <span class="settings-field__label">상단 바 메뉴 자리</span>
          <div class="lc-radio-cards">
            <button
              v-for="pos in headerPositionOptions"
              :key="pos.value"
              type="button"
              class="lc-radio-card"
              :class="{ 'is-active': layout.headerNavPosition === pos.value }"
              @click="uiLayoutStore.setHeaderNavPosition(pos.value)"
            >
              <strong>{{ pos.label }}</strong>
              <small>{{ pos.desc }}</small>
            </button>
          </div>
        </div>

        <div class="lc-two-cols">
          <label class="settings-field">
            <span class="settings-field__label">상단 버튼 표시 형태</span>
            <select
              :value="layout.headerNavStyle"
              class="settings-input"
              @change="uiLayoutStore.setHeaderNavStyle($event.target.value)"
            >
              <option value="icon-label">아이콘 + 이름 (기본)</option>
              <option value="compact">컴팩트 알약 형태</option>
              <option value="icon-only">아이콘만 표시</option>
            </select>
          </label>

          <label class="settings-field">
            <span class="settings-field__label">상단 메뉴 정렬</span>
            <select
              :value="layout.headerNavAlign"
              class="settings-input"
              @change="uiLayoutStore.setHeaderNavAlign($event.target.value)"
            >
              <option value="right">오른쪽 정렬 (기본)</option>
              <option value="center">가운데 정렬</option>
              <option value="left">왼쪽 정렬</option>
            </select>
          </label>
        </div>

        <div class="lc-check-grid">
          <label class="settings-check">
            <input
              type="checkbox"
              :checked="layout.showHeaderSearchBar"
              @change="uiLayoutStore.setLayoutOption('showHeaderSearchBar', $event.target.checked)"
            />
            <span>상단 검색창 표시</span>
          </label>
          <label class="settings-check">
            <input
              type="checkbox"
              :checked="layout.headerSearchCompact"
              :disabled="!layout.showHeaderSearchBar"
              @change="uiLayoutStore.setLayoutOption('headerSearchCompact', $event.target.checked)"
            />
            <span>검색창 폭 줄이기 (버튼 공간 넓힘)</span>
          </label>
        </div>

        <!-- Header Right Action Buttons -->
        <div class="lc-subblock">
          <span class="settings-field__label">오른쪽 기능 아이콘 표시 및 순서</span>
          <div class="lc-order-items lc-order-items--inline">
            <div
              v-for="(action, idx) in orderedHeaderActions"
              :key="action.id"
              class="lc-action-item"
              :class="{ 'is-off': !action.visible }"
            >
              <label class="lc-action-item__check">
                <input
                  type="checkbox"
                  :checked="action.visible"
                  @change="uiLayoutStore.setHeaderActionVisible(action.id, $event.target.checked)"
                />
                <i :class="action.icon"></i>
                <span>{{ action.label }}</span>
              </label>
              <span class="lc-order-arrows">
                <button
                  type="button"
                  :disabled="idx === 0"
                  title="왼쪽으로 이동"
                  @click="uiLayoutStore.moveHeaderAction(action.id, -1)"
                >
                  <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button
                  type="button"
                  :disabled="idx === orderedHeaderActions.length - 1"
                  title="오른쪽으로 이동"
                  @click="uiLayoutStore.moveHeaderAction(action.id, 1)"
                >
                  <i class="fa-solid fa-chevron-right"></i>
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sidebar Section Toggles & Section Ordering -->
    <div class="settings-card lc-card">
      <h3 class="settings-section__title">왼쪽 사이드바 표시 항목 &amp; 섹션 순서</h3>
      <p class="settings-help">
        개인 페이지, 협업 페이지, 최근 파일 등 원하지 않는 항목을 사이드바에서 숨기거나 위아래 순서를 바꿀 수 있습니다.
      </p>

      <div class="lc-check-grid lc-check-grid--sidebar">
        <label class="settings-check lc-check-highlight">
          <input
            type="checkbox"
            :checked="layout.showPersonalPages"
            @change="uiLayoutStore.setLayoutOption('showPersonalPages', $event.target.checked)"
          />
          <span>개인 페이지 섹션 표시 (끄면 숨기기)</span>
        </label>
        <label class="settings-check lc-check-highlight">
          <input
            type="checkbox"
            :checked="layout.showSharedPages"
            @change="uiLayoutStore.setLayoutOption('showSharedPages', $event.target.checked)"
          />
          <span>협업 페이지 섹션 표시 (끄면 숨기기)</span>
        </label>
        <label class="settings-check">
          <input
            type="checkbox"
            :checked="layout.showSidebarNavSection"
            @change="uiLayoutStore.setLayoutOption('showSidebarNavSection', $event.target.checked)"
          />
          <span>주 메뉴 섹션 표시</span>
        </label>
        <label class="settings-check">
          <input
            type="checkbox"
            :checked="layout.showSidebarRecentSection"
            @change="uiLayoutStore.setLayoutOption('showSidebarRecentSection', $event.target.checked)"
          />
          <span>최근 업로드 · 열어본 파일 섹션 표시</span>
        </label>
        <label class="settings-check">
          <input
            type="checkbox"
            :checked="layout.showSidebarUploadButton"
            @change="uiLayoutStore.setLayoutOption('showSidebarUploadButton', $event.target.checked)"
          />
          <span>상단 '+ 업로드 / 폴더 만들기' 버튼</span>
        </label>
        <label class="settings-check">
          <input
            type="checkbox"
            :checked="layout.showMediaSubmenu"
            @change="uiLayoutStore.setLayoutOption('showMediaSubmenu', $event.target.checked)"
          />
          <span>미디어 하위 메뉴 (모든 미디어·이어보기 등)</span>
        </label>
        <label class="settings-check">
          <input
            type="checkbox"
            :checked="layout.showPhotosSubmenu"
            @change="uiLayoutStore.setLayoutOption('showPhotosSubmenu', $event.target.checked)"
          />
          <span>사진첩 하위 메뉴 (모든 사진·앨범 등)</span>
        </label>
        <label class="settings-check">
          <input
            type="checkbox"
            :checked="layout.showSidebarUtilitiesSection"
            @change="uiLayoutStore.setLayoutOption('showSidebarUtilitiesSection', $event.target.checked)"
          />
          <span>하단 유틸리티 영역 전체 표시</span>
        </label>
        <label class="settings-check">
          <input
            type="checkbox"
            :checked="layout.showStorageWidget"
            :disabled="!layout.showSidebarUtilitiesSection"
            @change="uiLayoutStore.setLayoutOption('showStorageWidget', $event.target.checked)"
          />
          <span>저장용량 사용량 게이지 표시</span>
        </label>
        <label class="settings-check">
          <input
            type="checkbox"
            :checked="layout.showAdditionalStorageButton"
            :disabled="!layout.showSidebarUtilitiesSection"
            @change="uiLayoutStore.setLayoutOption('showAdditionalStorageButton', $event.target.checked)"
          />
          <span>'추가 저장용량 구매' 버튼 표시</span>
        </label>
        <label class="settings-check">
          <input
            type="checkbox"
            :checked="layout.sidebarCompactMode"
            @change="uiLayoutStore.setLayoutOption('sidebarCompactMode', $event.target.checked)"
          />
          <span>컴팩트 간격 모드 (좁은 높이)</span>
        </label>
      </div>

      <div class="lc-subblock">
        <span class="settings-field__label">사이드바 구역(섹션) 위아래 순서</span>
        <div class="lc-order-items">
          <div
            v-for="(section, idx) in orderedSidebarSections"
            :key="section.id"
            class="lc-order-chip"
            :class="{ 'is-off': !isSectionVisible(section.id) }"
            draggable="true"
            @dragstart="onDragStart('section', section.id)"
            @dragover.prevent
            @drop="onDrop('section', section.id)"
          >
            <span class="lc-order-chip__label">
              <i class="fa-solid fa-grip-vertical lc-grip"></i>
              <strong>{{ section.label }}</strong>
              <small>{{ section.description }}</small>
              <span v-if="!isSectionVisible(section.id)" class="lc-hidden-pill">숨김</span>
            </span>
            <span class="lc-order-arrows">
              <button
                type="button"
                :disabled="idx === 0"
                title="위로 이동"
                @click="uiLayoutStore.moveSidebarSection(section.id, -1)"
              >
                <i class="fa-solid fa-arrow-up"></i>
              </button>
              <button
                type="button"
                :disabled="idx === orderedSidebarSections.length - 1"
                title="아래로 이동"
                @click="uiLayoutStore.moveSidebarSection(section.id, 1)"
              >
                <i class="fa-solid fa-arrow-down"></i>
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile Bottom Bar Customization -->
    <div class="settings-card lc-card">
      <div class="lc-card__head">
        <div>
          <h3 class="settings-section__title">모바일 하단 바로가기 설정</h3>
          <p class="settings-help">모바일 화면 하단 고정 바에 노출할 메뉴를 최대 4개까지 선택하고 순서를 바꿀 수 있습니다.</p>
        </div>
        <label class="settings-check">
          <input
            type="checkbox"
            :checked="layout.showMobileBottomNav"
            @change="uiLayoutStore.setLayoutOption('showMobileBottomNav', $event.target.checked)"
          />
          <span>하단 바 사용</span>
        </label>
      </div>

      <div v-if="layout.showMobileBottomNav" class="lc-mobile-grid">
        <div class="lc-mobile-picker">
          <span class="settings-field__label">바로가기 항목 (최대 4개)</span>
          <div class="lc-mobile-chips">
            <button
              v-for="item in navItemsCatalog"
              :key="item.id"
              type="button"
              class="lc-chip-btn"
              :class="{ 'is-active': layout.mobileBottomNavIds.includes(item.id) }"
              @click="uiLayoutStore.toggleMobileBottomNavItem(item.id)"
            >
              <i :class="item.icon"></i>
              <span>{{ item.label }}</span>
            </button>
          </div>
        </div>

        <div class="lc-mobile-order">
          <span class="settings-field__label">모바일 하단 순서</span>
          <div class="lc-order-items">
            <div v-for="(item, idx) in mobileBottomNavItems" :key="item.id" class="lc-order-chip">
              <span class="lc-order-chip__label">
                <i :class="item.icon"></i>
                <span>{{ item.label }}</span>
              </span>
              <span class="lc-order-arrows">
                <button
                  type="button"
                  :disabled="idx === 0"
                  title="왼쪽으로"
                  @click="uiLayoutStore.moveMobileBottomNavItem(item.id, -1)"
                >
                  <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button
                  type="button"
                  :disabled="idx === mobileBottomNavItems.length - 1"
                  title="오른쪽으로"
                  @click="uiLayoutStore.moveMobileBottomNavItem(item.id, 1)"
                >
                  <i class="fa-solid fa-chevron-right"></i>
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>

      <p v-if="uiLayoutStore.syncError" class="settings-error" style="margin-top: 0.75rem;">
        {{ uiLayoutStore.syncError }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useUiLayoutStore } from "@/stores/useUiLayoutStore.js";

const uiLayoutStore = useUiLayoutStore();

const layout = computed(() => uiLayoutStore.layout);
const navItemsCatalog = computed(() => uiLayoutStore.navItemsCatalog);
const presets = computed(() => uiLayoutStore.presetsCatalog);
const headerNavItems = computed(() => uiLayoutStore.headerNavItems);
const sidebarPrimaryNavItems = computed(() => uiLayoutStore.sidebarPrimaryNavItems);
const orderedHeaderActions = computed(() => uiLayoutStore.orderedHeaderActions);
const visibleHeaderActions = computed(() => uiLayoutStore.visibleHeaderActions);
const orderedSidebarSections = computed(() => uiLayoutStore.orderedSidebarSections);
const mobileBottomNavItems = computed(() => uiLayoutStore.mobileBottomNavItems);

const placementOptions = [
  { value: "sidebar", label: "왼쪽 사이드바" },
  { value: "header", label: "상단 바" },
  { value: "both", label: "둘 다" },
  { value: "hidden", label: "숨김" },
];

const headerPositionOptions = [
  { value: "after-search", label: "검색창 오른쪽 (같은 줄)", desc: "검색창과 같은 수평선상 오른쪽 공간에 나란히 배치" },
  { value: "right-actions", label: "우측 기능 아이콘 앞 (같은 줄)", desc: "알림·테마·채팅 아이콘 바로 앞쪽에 압축 배치" },
];

const dragState = ref({ group: null, id: null });

const onDragStart = (group, id) => {
  dragState.value = { group, id };
};

const onDrop = (group, targetId) => {
  if (dragState.value.group !== group || !dragState.value.id || dragState.value.id === targetId) {
    dragState.value = { group: null, id: null };
    return;
  }
  const sourceId = dragState.value.id;
  dragState.value = { group: null, id: null };
  if (group === "section") {
    uiLayoutStore.reorderSidebarSection(sourceId, targetId);
  } else {
    uiLayoutStore.reorderNavItem(group, sourceId, targetId);
  }
};

const isSectionVisible = (sectionId) => {
  if (sectionId === "nav") return layout.value.showSidebarNavSection;
  if (sectionId === "recentFiles") return layout.value.showSidebarRecentSection;
  if (sectionId === "personalPages") return layout.value.showPersonalPages;
  if (sectionId === "sharedPages") return layout.value.showSharedPages;
  if (sectionId === "utilities") return layout.value.showSidebarUtilitiesSection;
  return true;
};
</script>

<style scoped>
.layout-customizer {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.lc-card {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.lc-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.lc-head-actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.lc-sync-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.32rem 0.68rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
  background: color-mix(in srgb, #10b981 14%, var(--bg-elevated) 86%);
  color: #10b981;
  border: 1px solid color-mix(in srgb, #10b981 28%, transparent);
}

.lc-sync-badge.is-saving,
.lc-sync-badge.is-pending {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}

.lc-sync-badge.is-error {
  background: color-mix(in srgb, #ef4444 14%, var(--bg-elevated) 86%);
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 35%, transparent);
  cursor: pointer;
}

.lc-chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.42rem 0.78rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.16s ease;
}

.lc-chip-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.lc-chip-btn.is-active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}

/* Miniature Live Wireframe Preview */
.lc-preview-shell {
  border-radius: 1rem;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-input) 75%, var(--bg-main) 25%);
  padding: 0.75rem;
}

.lc-preview-app {
  display: grid;
  grid-template-columns: 158px minmax(0, 1fr);
  min-height: 205px;
  border-radius: 0.85rem;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
}

.lc-preview-sidebar {
  border-right: 1px solid var(--border-color);
  background: var(--bg-elevated);
  padding: 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.42rem;
}

.lc-preview-sidebar.is-compact {
  gap: 0.28rem;
}

.lc-preview-logo {
  display: flex;
  align-items: center;
  gap: 0.38rem;
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--text-main);
}

.lc-preview-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--accent);
}

.lc-preview-upload {
  padding: 0.28rem 0.45rem;
  border-radius: 0.5rem;
  background: var(--accent);
  color: #ffffff;
  font-size: 0.66rem;
  font-weight: 700;
  text-align: center;
}

.lc-preview-sections {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.lc-preview-section {
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  padding: 0.3rem 0.4rem;
  background: var(--bg-main);
}

.lc-preview-section.is-hidden-sec {
  opacity: 0.42;
  border-style: dashed;
}

.lc-preview-sec-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.64rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.lc-preview-sec-title em {
  font-style: normal;
  font-size: 0.58rem;
  color: var(--text-muted);
}

.lc-preview-nav-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.22rem;
  margin-top: 0.25rem;
}

.lc-preview-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  padding: 0.14rem 0.32rem;
  border-radius: 0.35rem;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.58rem;
  font-weight: 700;
}

.lc-preview-empty {
  margin-top: 0.2rem;
  font-size: 0.58rem;
  color: var(--text-muted);
}

.lc-preview-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.lc-preview-topstrip {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.32rem 0.6rem;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-elevated) 94%);
  flex-wrap: wrap;
}

.lc-preview-topstrip.is-align-right,
.lc-preview-inline-nav.is-align-right {
  justify-content: flex-end;
}

.lc-preview-topstrip.is-align-center,
.lc-preview-inline-nav.is-align-center {
  justify-content: center;
}

.lc-preview-topstrip.is-align-left,
.lc-preview-inline-nav.is-align-left {
  justify-content: flex-start;
}

.lc-preview-header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-elevated);
}

.lc-preview-search {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.55rem;
  border-radius: 0.55rem;
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-muted);
  font-size: 0.64rem;
  flex: 1 1 110px;
  max-width: 170px;
}

.lc-preview-search.is-compact {
  max-width: 110px;
}

.lc-preview-search.is-disabled {
  flex: 0 0 auto;
  border-style: dashed;
  opacity: 0.55;
}

.lc-preview-inline-nav {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 0.28rem;
  flex-wrap: wrap;
}

.lc-preview-hbtn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.18rem 0.42rem;
  border-radius: 0.45rem;
  background: var(--accent);
  color: #ffffff;
  font-size: 0.6rem;
  font-weight: 700;
}

.lc-preview-hbtn.is-mini {
  padding: 0.16rem 0.34rem;
}

.lc-preview-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.24rem;
}

.lc-preview-icon-dot {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.35rem;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.56rem;
}

.lc-preview-avatar {
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 999px;
  background: var(--accent);
  color: #ffffff;
  font-size: 0.56rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.lc-preview-canvas {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 0.72rem;
  padding: 0.6rem;
}

.lc-preview-mobile-bar {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  border-top: 1px solid var(--border-color);
  background: var(--bg-elevated);
  font-size: 0.6rem;
  color: var(--text-muted);
  flex-wrap: wrap;
}

.lc-preview-mbtn {
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  padding: 0.12rem 0.36rem;
  border-radius: 0.35rem;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

/* Presets */
.lc-preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.lc-preset-card {
  text-align: left;
  padding: 0.8rem 0.9rem;
  border-radius: 0.95rem;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  cursor: pointer;
  transition: all 0.16s ease;
}

.lc-preset-card:hover {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border-color));
}

.lc-preset-card.is-active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-elevated) 91%);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
}

.lc-preset-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.3rem;
}

.lc-preset-card__top strong {
  font-size: 0.86rem;
  color: var(--text-main);
}

.lc-preset-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.14rem 0.48rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
}

.lc-preset-card p {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.42;
  color: var(--text-secondary);
}

/* Placement List */
.lc-placement-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.lc-placement-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 0.72rem 0.85rem;
  border-radius: 0.9rem;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  flex-wrap: wrap;
}

.lc-placement-row__info {
  display: flex;
  align-items: center;
  gap: 0.68rem;
  min-width: 190px;
}

.lc-item-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.6rem;
  background: var(--accent-soft);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.lc-item-title {
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--text-main);
}

.lc-item-desc {
  font-size: 0.74rem;
  color: var(--text-muted);
}

.lc-segmented {
  display: inline-flex;
  border-radius: 0.72rem;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  padding: 0.18rem;
  gap: 0.18rem;
  flex-wrap: wrap;
}

.lc-segmented__btn {
  padding: 0.34rem 0.62rem;
  border: 0;
  border-radius: 0.54rem;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.lc-segmented__btn:hover {
  color: var(--text-main);
}

.lc-segmented__btn.is-active {
  background: var(--accent);
  color: #ffffff;
}

/* Order Columns */
.lc-order-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.lc-order-box {
  border-radius: 0.95rem;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.lc-order-box__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-main);
}

.lc-order-box__head small {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-muted);
}

.lc-order-items {
  display: flex;
  flex-direction: column;
  gap: 0.42rem;
}

.lc-order-items--inline {
  flex-direction: row;
  flex-wrap: wrap;
}

.lc-order-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.68rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  cursor: grab;
}

.lc-order-chip.is-off {
  opacity: 0.65;
}

.lc-order-chip__label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-main);
  flex-wrap: wrap;
}

.lc-order-chip__label small {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 0.73rem;
}

.lc-grip {
  color: var(--text-muted);
  font-size: 0.76rem;
}

.lc-hidden-pill {
  font-size: 0.66rem;
  font-weight: 700;
  padding: 0.1rem 0.42rem;
  border-radius: 999px;
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444;
}

.lc-order-arrows {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.lc-order-arrows button {
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 0.48rem;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  cursor: pointer;
}

.lc-order-arrows button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.lc-order-arrows button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.lc-empty-tip {
  margin: 0;
  padding: 0.75rem;
  border-radius: 0.7rem;
  border: 1px dashed var(--border-color);
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--text-muted);
}

/* Radio cards & checks */
.lc-grid-options {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.lc-option-block,
.lc-subblock {
  display: flex;
  flex-direction: column;
  gap: 0.48rem;
}

.lc-radio-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
}

.lc-radio-card {
  text-align: left;
  padding: 0.72rem 0.8rem;
  border-radius: 0.85rem;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.lc-radio-card strong {
  font-size: 0.82rem;
  color: var(--text-main);
}

.lc-radio-card small {
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--text-muted);
}

.lc-radio-card.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.lc-two-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.lc-check-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem 0.9rem;
}

.lc-check-highlight {
  padding: 0.55rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border-color));
  background: color-mix(in srgb, var(--accent) 7%, var(--bg-elevated) 93%);
}

.lc-action-item {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.65rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
}

.lc-action-item.is-off {
  opacity: 0.58;
}

.lc-action-item__check {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-main);
  cursor: pointer;
}

.lc-mobile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 0.9rem;
}

.lc-mobile-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.45rem;
}

@media (max-width: 780px) {
  .lc-preview-app {
    grid-template-columns: 1fr;
  }

  .lc-preview-sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }

  .lc-preset-grid,
  .lc-order-columns,
  .lc-radio-cards,
  .lc-two-cols,
  .lc-check-grid,
  .lc-mobile-grid {
    grid-template-columns: 1fr;
  }
}
</style>
