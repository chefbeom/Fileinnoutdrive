import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ModalBackHistoryManager,
  MODAL_HISTORY_KEY,
  MODAL_ITEM_KEY,
  safeExitFullscreen,
  safePauseMedia,
} from "./modalBackHistory.js";

describe("modalBackHistory", () => {
  let mockHistory;

  beforeEach(() => {
    mockHistory = {
      state: {},
      pushState: vi.fn((state) => {
        mockHistory.state = state;
      }),
      replaceState: vi.fn((state) => {
        mockHistory.state = state;
      }),
      back: vi.fn(() => {
        // simulate popstate
        const prev = { ...mockHistory.state };
        delete prev[MODAL_HISTORY_KEY];
        delete prev[MODAL_ITEM_KEY];
        mockHistory.state = prev;
        window.dispatchEvent(new Event("popstate"));
      }),
    };

    vi.stubGlobal("history", mockHistory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pushes history entry on open with unique modal identifier", () => {
    const onClose = vi.fn();
    const manager = new ModalBackHistoryManager({
      modalId: "media-theater",
      onClose,
    });

    manager.open("video-123");

    expect(mockHistory.pushState).toHaveBeenCalled();
    expect(mockHistory.state[MODAL_HISTORY_KEY]).toBe("media-theater");
    expect(mockHistory.state[MODAL_ITEM_KEY]).toBe("video-123");
    expect(manager.isPushed).toBe(true);

    manager.destroy();
  });

  it("handles popstate (browser/hardware back button) cleanly without calling history.back()", () => {
    const onClose = vi.fn();
    const onBeforeClose = vi.fn();
    const manager = new ModalBackHistoryManager({
      modalId: "media-theater",
      onClose,
      onBeforeClose,
    });

    manager.open("video-123");
    expect(manager.isPushed).toBe(true);

    // Simulate browser back button being clicked by user:
    // history.state changes to remove the modal key, then popstate fires
    mockHistory.state = { someRouteKey: "/home" };
    window.dispatchEvent(new Event("popstate"));

    expect(onBeforeClose).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith({ fromPopState: true });
    expect(manager.isPushed).toBe(false);
    expect(mockHistory.back).not.toHaveBeenCalled(); // Crucial: must NOT call back() again
  });

  it("handles requestClose (UI button click) by executing onClose and popping the history entry", () => {
    const onClose = vi.fn();
    const onBeforeClose = vi.fn();
    const manager = new ModalBackHistoryManager({
      modalId: "file-preview",
      onClose,
      onBeforeClose,
    });

    manager.open("doc-456");
    expect(manager.isPushed).toBe(true);

    manager.requestClose();

    expect(onBeforeClose).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith({ fromPopState: false });
    expect(mockHistory.back).toHaveBeenCalled();
    expect(manager.isPushed).toBe(false);
  });

  it("updates item on playlist/photo advance via replaceState without growing history stack", () => {
    const manager = new ModalBackHistoryManager({
      modalId: "photo-lightbox",
      onClose: vi.fn(),
    });

    manager.open("photo-1");
    expect(mockHistory.pushState).toHaveBeenCalledTimes(1);

    manager.updateItem("photo-2");
    expect(mockHistory.replaceState).toHaveBeenCalledWith(
      expect.objectContaining({
        [MODAL_HISTORY_KEY]: "photo-lightbox",
        [MODAL_ITEM_KEY]: "photo-2",
      }),
      "",
      expect.any(String)
    );
    // pushState should NOT have been called again!
    expect(mockHistory.pushState).toHaveBeenCalledTimes(1);

    manager.destroy();
  });

  it("supports handoff from one modal to another without pushing extra stack entries", () => {
    const onCloseFile = vi.fn();
    const fileManager = new ModalBackHistoryManager({
      modalId: "file-preview",
      onClose: onCloseFile,
    });

    fileManager.open("video-file-1");
    expect(mockHistory.state[MODAL_HISTORY_KEY]).toBe("file-preview");

    // Handoff to media theater
    fileManager.handoffTo("media-theater", "video-file-1");
    expect(mockHistory.state[MODAL_HISTORY_KEY]).toBe("media-theater");
    expect(fileManager.isPushed).toBe(false);

    // New theater manager opens
    const onTheaterClose = vi.fn();
    const theaterManager = new ModalBackHistoryManager({
      modalId: "media-theater",
      onClose: onTheaterClose,
    });

    theaterManager.open("video-file-1");
    // Because state already has media-theater, it uses replaceState, not pushState!
    expect(mockHistory.replaceState).toHaveBeenCalled();
    expect(theaterManager.isPushed).toBe(true);

    theaterManager.destroy();
  });

  it("safeExitFullscreen handles document.exitFullscreen and webkitExitFullscreen without error", () => {
    const exitFs = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "fullscreenElement", {
      value: {},
      configurable: true,
    });
    document.exitFullscreen = exitFs;

    safeExitFullscreen();
    expect(exitFs).toHaveBeenCalled();

    delete document.fullscreenElement;
  });

  it("safePauseMedia safely pauses video/audio element", () => {
    const pauseFn = vi.fn();
    const mediaEl = {
      paused: false,
      pause: pauseFn,
    };

    safePauseMedia(mediaEl);
    expect(pauseFn).toHaveBeenCalled();

    // When already paused
    mediaEl.paused = true;
    safePauseMedia(mediaEl);
    expect(pauseFn).toHaveBeenCalledTimes(1);
  });

  it("closeForNavigation strips modal history keys via replaceState without calling history.back()", () => {
    const onClose = vi.fn();
    const onBeforeClose = vi.fn();
    const manager = new ModalBackHistoryManager({
      modalId: "media-theater",
      onClose,
      onBeforeClose,
    });

    manager.open("video-999");
    expect(mockHistory.state[MODAL_HISTORY_KEY]).toBe("media-theater");
    mockHistory.replaceState.mockClear();

    manager.closeForNavigation();

    expect(onBeforeClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ fromPopState: false });
    expect(mockHistory.back).not.toHaveBeenCalled();
    expect(mockHistory.replaceState).toHaveBeenCalledTimes(1);
    expect(mockHistory.state[MODAL_HISTORY_KEY]).toBeUndefined();
    expect(mockHistory.state[MODAL_ITEM_KEY]).toBeUndefined();
    expect(manager.isPushed).toBe(false);
  });
});
