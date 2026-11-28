/**
 * modalBackHistory.js
 *
 * 모바일 및 웹 환경에서 모달/미리보기/전체화면 플레이어 재생 시
 * 스마트폰 시스템 '뒤로가기'(Android 백 버튼, iOS 스와이프 백, 브라우저 뒤로가기) 및
 * 모달 내부 뒤로가기/닫기 UI 버튼의 브라우저 히스토리(popstate)를 일원화하여
 * 페이지 이탈 없이 자연스럽게 모달을 닫아주는 유틸리티 & 컴포저블.
 */

export const MODAL_HISTORY_KEY = "__fileInNOutModal";
export const MODAL_ITEM_KEY = "__fileInNOutModalItem";

/**
 * 안전하게 전체화면을 종료합니다 (표준 및 웹킷 지원).
 */
export function safeExitFullscreen() {
  try {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      if (typeof document.exitFullscreen === "function") {
        document.exitFullscreen().catch(() => {});
      }
    } else if (document.webkitFullscreenElement) {
      if (typeof document.webkitExitFullscreen === "function") {
        document.webkitExitFullscreen();
      }
    }
  } catch {
    // ignore fullscreen exit errors
  }
}

/**
 * HTML5 비디오 또는 오디오 요소를 안전하게 일시정지합니다.
 */
export function safePauseMedia(element) {
  if (!element || typeof element.pause !== "function") return;
  try {
    if (!element.paused) {
      element.pause();
    }
  } catch {
    // ignore media pause errors
  }
}

/**
 * 모달용 브라우저 뒤로가기(History/popstate) 관리자
 */
export class ModalBackHistoryManager {
  constructor(options = {}) {
    this.modalId = options.modalId || "modal";
    this.onClose = typeof options.onClose === "function" ? options.onClose : () => {};
    this.onBeforeClose = typeof options.onBeforeClose === "function" ? options.onBeforeClose : null;
    this.isPushed = false;
    this.isClosing = false;
    this._popstateHandler = this._handlePopState.bind(this);
    this._isAttached = false;
  }

  /**
   * 모달이 열릴 때 히스토리 스택을 등록하고 리스너를 바인딩합니다.
   * @param {string|number|null} itemId 
   */
  open(itemId = null) {
    if (typeof window === "undefined" || !window.history) return;

    this.isClosing = false;
    const currentState = window.history.state || {};
    const existingModal = currentState[MODAL_HISTORY_KEY];

    if (existingModal === this.modalId) {
      // 이미 현재 모달로 등록되어 있는 경우: 아이템 ID만 replaceState로 동기화
      this.isPushed = true;
      window.history.replaceState(
        {
          ...currentState,
          [MODAL_ITEM_KEY]: itemId != null ? String(itemId) : null,
        },
        "",
        window.location.href
      );
    } else if (existingModal) {
      // 다른 모달에서 전환되어 넘어온 경우(핸드오프): 스택 깊이를 늘리지 않고 replaceState
      this.isPushed = true;
      window.history.replaceState(
        {
          ...currentState,
          [MODAL_HISTORY_KEY]: this.modalId,
          [MODAL_ITEM_KEY]: itemId != null ? String(itemId) : null,
        },
        "",
        window.location.href
      );
    } else {
      // 일반적인 신규 모달 오픈: pushState로 +1 히스토리 등록
      this.isPushed = true;
      window.history.pushState(
        {
          ...currentState,
          [MODAL_HISTORY_KEY]: this.modalId,
          [MODAL_ITEM_KEY]: itemId != null ? String(itemId) : null,
          __modalOpenTs: Date.now(),
        },
        "",
        window.location.href
      );
    }

    if (!this._isAttached) {
      window.addEventListener("popstate", this._popstateHandler);
      this._isAttached = true;
    }
  }

  /**
   * 모달 내부에서 다음 영상/사진/에피소드로 전환될 때 호출합니다.
   * 히스토리 스택을 추가하지 않고 현재 항목 정보만 업데이트합니다.
   */
  updateItem(itemId) {
    if (typeof window === "undefined" || !window.history || !this.isPushed) return;
    const currentState = window.history.state || {};
    if (currentState[MODAL_HISTORY_KEY] === this.modalId) {
      window.history.replaceState(
        {
          ...currentState,
          [MODAL_ITEM_KEY]: itemId != null ? String(itemId) : null,
        },
        "",
        window.location.href
      );
    }
  }

  /**
   * 다른 모달(예: FilePreview -> MediaTheater)로 히스토리 권한을 즉시 양도합니다.
   */
  handoffTo(nextModalId, nextItemId = null) {
    if (typeof window === "undefined" || !window.history) return;
    const currentState = window.history.state || {};
    if (this.isPushed && currentState[MODAL_HISTORY_KEY] === this.modalId) {
      window.history.replaceState(
        {
          ...currentState,
          [MODAL_HISTORY_KEY]: nextModalId,
          [MODAL_ITEM_KEY]: nextItemId != null ? String(nextItemId) : null,
        },
        "",
        window.location.href
      );
    }
    this.isPushed = false;
    this.destroy();
  }

  /**
   * popstate 이벤트 발생 시 처리 (하드웨어/브라우저 뒤로가기)
   */
  _handlePopState(event) {
    if (!this.isPushed || this.isClosing) return;

    const currentModal = window.history.state?.[MODAL_HISTORY_KEY];
    // 현재 히스토리 상태에서 이 모달 식별자가 빠졌다면 사용자가 뒤로가기를 실행한 것임
    if (currentModal !== this.modalId) {
      this.isClosing = true;
      this.isPushed = false;

      if (this.onBeforeClose) {
        try {
          this.onBeforeClose();
        } catch {
          // ignore
        }
      }

      this.onClose({ fromPopState: true });
      this.destroy();
    }
  }

  /**
   * UI 버튼(← 뒤로, X 닫기, Esc 키, 배경 클릭)에 의해 모달을 닫을 때 호출합니다.
   * 히스토리가 푸시되어 있다면 history.back()으로 정리합니다.
   * @param {{ skipHistoryBack?: boolean }} [options]
   */
  requestClose(options = {}) {
    if (this.isClosing) return;
    this.isClosing = true;

    const skipHistoryBack = Boolean(options?.skipHistoryBack);

    if (this.onBeforeClose) {
      try {
        this.onBeforeClose();
      } catch {
        // ignore
      }
    }

    const wasPushed = this.isPushed;
    const isTopState = window.history?.state?.[MODAL_HISTORY_KEY] === this.modalId;

    this.isPushed = false;
    this.onClose({ fromPopState: false });
    this.destroy();

    if (skipHistoryBack) {
      if (isTopState && typeof window !== "undefined" && window.history?.replaceState) {
        try {
          const nextState = { ...(window.history.state || {}) };
          delete nextState[MODAL_HISTORY_KEY];
          delete nextState[MODAL_ITEM_KEY];
          window.history.replaceState(nextState, "", window.location.href);
        } catch {
          // ignore
        }
      }
      return;
    }

    // 사용자가 UI 버튼을 눌러 닫았고 히스토리가 정상적으로 푸시되어 있었다면 히스토리 1회 팝
    if (wasPushed && isTopState && typeof window !== "undefined" && window.history?.back) {
      try {
        window.history.back();
      } catch {
        // ignore
      }
    }
  }

  /**
   * 모달을 닫고 즉시 다른 라우트/위치로 이동하거나 미니 플레이어로 전환할 때 호출합니다.
   * 비동기 window.history.back()과 router.push() 간의 경합을 막기 위해 replaceState로 모달 키만 제거합니다.
   */
  closeForNavigation() {
    this.requestClose({ skipHistoryBack: true });
  }

  /**
   * 이벤트 리스너 제거 및 정리
   */
  destroy() {
    if (typeof window !== "undefined" && this._isAttached) {
      window.removeEventListener("popstate", this._popstateHandler);
      this._isAttached = false;
    }
  }
}
