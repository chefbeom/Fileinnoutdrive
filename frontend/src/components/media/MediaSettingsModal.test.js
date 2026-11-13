import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MediaSettingsModal from "./MediaSettingsModal.vue";

const baseProps = {
  open: true,
  preferences: {
    mediaSourceMode: "manual",
    enableContinueWatching: true,
    autoPlayNext: true,
    autoLoadSubtitles: true,
    defaultPlaybackRate: 1.0,
  },
  autoClassifyEnabled: true,
  viewMode: "card",
  gridDensity: "normal",
  thumbAspect: "video",
  showThumbnails: true,
  areaCount: 1,
  folderCount: 0,
  fileCount: 2,
  candidateVideoCount: 15,
  seriesCount: 4,
  removedSeriesCount: 1,
};

describe("MediaSettingsModal.vue", () => {
  it("does not render when closed", () => {
    const wrapper = mount(MediaSettingsModal, {
      props: { ...baseProps, open: false },
      global: { stubs: { Teleport: true } },
    });
    expect(wrapper.find("[data-testid='media-settings-modal']").exists()).toBe(false);
  });

  it("renders grouped settings and emits source mode / source picker navigation", async () => {
    const wrapper = mount(MediaSettingsModal, {
      props: baseProps,
      global: { stubs: { Teleport: true } },
    });

    const modal = wrapper.get("[data-testid='media-settings-modal']");
    expect(modal.text()).toContain("라이브러리 표시 기준");
    expect(modal.text()).toContain("시리즈 분류 · 관리");
    expect(modal.text()).toContain("화면 표시 설정");
    expect(modal.text()).toContain("재생 · 자막 설정");
    expect(modal.text()).toContain("모든 동영상 자동 (15)");

    await wrapper.get("[data-testid='settings-open-areas']").trigger("click");
    expect(wrapper.emitted("close")).toBeTruthy();
    expect(wrapper.emitted("open-source-picker")).toEqual([["areas"]]);

    await wrapper.get("[data-testid='settings-open-merge']").trigger("click");
    expect(wrapper.emitted("open-merge-series")).toBeTruthy();

    await wrapper.get("[data-testid='settings-open-removed']").trigger("click");
    expect(wrapper.emitted("open-removed-series")).toBeTruthy();
  });

  it("emits reset actions from maintenance footer", async () => {
    const wrapper = mount(MediaSettingsModal, {
      props: baseProps,
      global: { stubs: { Teleport: true } },
    });

    const buttons = wrapper.findAll("button");
    await buttons.find((b) => b.text().includes("설정 기본값 복원")).trigger("click");
    await buttons.find((b) => b.text().includes("시리즈 규칙 초기화")).trigger("click");
    await buttons.find((b) => b.text().includes("시청 기록 초기화")).trigger("click");

    expect(wrapper.emitted("reset-preferences")).toBeTruthy();
    expect(wrapper.emitted("reset-series-overrides")).toBeTruthy();
    expect(wrapper.emitted("clear-watch-history")).toBeTruthy();
  });

  it("uses dynamic viewport height and single-column fallback on narrow screens", () => {
    const wrapper = mount(MediaSettingsModal, {
      props: baseProps,
      global: { stubs: { Teleport: true } },
    });

    const html = wrapper.html();
    expect(html).toContain("max-h-[88dvh]");
    expect(html).toContain("grid-cols-1 sm:grid-cols-2");
    expect(html).toContain("p-4 sm:p-6");
  });
});
