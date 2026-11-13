import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MediaHeaderToolbar from "./MediaHeaderToolbar.vue";

const baseProps = {
  mediaSourceMode: "manual",
  areaCount: 1,
  folderCount: 0,
  fileCount: 2,
  candidateVideoCount: 12,
  seriesCount: 3,
  displayedVideoCount: 8,
  continueCount: 2,
  collectionCount: 1,
  favoriteCount: 4,
  activeSection: "series",
  selectedCollectionId: null,
  inSeriesDetail: false,
  searchQuery: "",
  scopeFilter: "all",
  statusFilter: "all",
  sortOption: "added-desc",
  seriesEpisodeSortOption: "episode-asc",
  viewMode: "card",
  gridDensity: "normal",
  showThumbnails: true,
  thumbAspect: "video",
  activeAreaLabel: "",
};

describe("MediaHeaderToolbar.vue", () => {
  it("renders minimal exposed controls by default and keeps popovers closed", () => {
    const wrapper = mount(MediaHeaderToolbar, {
      props: baseProps,
    });

    expect(wrapper.text()).toContain("미디어 스트리밍");
    expect(wrapper.get("[data-testid='media-source-status-chip']").text()).toContain("지정 항목 (3)");
    expect(wrapper.find("[data-testid='media-add-menu']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='media-filter-popover']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='active-filter-chips']").exists()).toBe(false);
    // Cluttered buttons should NOT be rendered directly on the hero bar
    expect(wrapper.text()).not.toContain("+ 미디어 영역 지정");
    expect(wrapper.text()).not.toContain("+ 저장소 폴더·파일 지정");
    expect(wrapper.text()).not.toContain("+ 새 동영상 업로드");
  });

  it("opens guided add menu and emits upload, source-picker, and collection events", async () => {
    const wrapper = mount(MediaHeaderToolbar, {
      props: baseProps,
    });

    await wrapper.get("[data-testid='media-add-menu-trigger']").trigger("click");
    expect(wrapper.find("[data-testid='media-add-menu']").exists()).toBe(true);

    await wrapper.get("[data-testid='add-menu-upload']").trigger("click");
    expect(wrapper.emitted("trigger-upload")).toBeTruthy();
    expect(wrapper.find("[data-testid='media-add-menu']").exists()).toBe(false);

    await wrapper.get("[data-testid='media-add-menu-trigger']").trigger("click");
    await wrapper.get("[data-testid='add-menu-areas']").trigger("click");
    expect(wrapper.emitted("open-source-picker")).toEqual([["areas"]]);

    await wrapper.get("[data-testid='media-add-menu-trigger']").trigger("click");
    await wrapper.get("[data-testid='add-menu-folders']").trigger("click");
    expect(wrapper.emitted("open-source-picker")[1]).toEqual(["folders"]);

    await wrapper.get("[data-testid='media-add-menu-trigger']").trigger("click");
    await wrapper.get("[data-testid='add-menu-collection']").trigger("click");
    expect(wrapper.emitted("create-collection")).toBeTruthy();
  });

  it("opens filter & display popover and delegates detailed settings", async () => {
    const wrapper = mount(MediaHeaderToolbar, {
      props: baseProps,
    });

    await wrapper.get("[data-testid='media-filter-trigger']").trigger("click");
    const popover = wrapper.get("[data-testid='media-filter-popover']");
    expect(popover.text()).toContain("저장소 범위");
    expect(popover.text()).toContain("시청 상태");
    expect(popover.text()).toContain("카드 크기 및 화면 표시");

    const sharedBtn = popover.findAll("button").find((b) => b.text() === "공유됨");
    await sharedBtn.trigger("click");
    expect(wrapper.emitted("update:scopeFilter")).toEqual([["shared"]]);

    const largeBtn = popover.findAll("button").find((b) => b.text() === "크게");
    await largeBtn.trigger("click");
    expect(wrapper.emitted("set-grid-density")).toEqual([["large"]]);

    const settingsLink = popover.findAll("button").find((b) => b.text().includes("상세 설정 열기"));
    await settingsLink.trigger("click");
    expect(wrapper.emitted("open-settings")).toBeTruthy();
    expect(wrapper.find("[data-testid='media-filter-popover']").exists()).toBe(false);
  });

  it("displays dismissible active filter chips when filters or area are active", async () => {
    const wrapper = mount(MediaHeaderToolbar, {
      props: {
        ...baseProps,
        searchQuery: "간츠",
        scopeFilter: "owned",
        statusFilter: "watching",
        activeAreaLabel: "애니메이션",
      },
    });

    const chips = wrapper.get("[data-testid='active-filter-chips']");
    expect(chips.text()).toContain("영역: 애니메이션");
    expect(chips.text()).toContain("범위: 내 저장소만");
    expect(chips.text()).toContain("상태: 시청 중");
    expect(chips.text()).toContain('검색: "간츠"');

    const resetBtn = chips.findAll("button").find((b) => b.text() === "모두 초기화");
    await resetBtn.trigger("click");
    expect(wrapper.emitted("reset-filters")).toBeTruthy();
  });

  it("applies mobile viewport clamping classes to popovers and search bar", async () => {
    const wrapper = mount(MediaHeaderToolbar, {
      props: baseProps,
    });

    await wrapper.get("[data-testid='media-add-menu-trigger']").trigger("click");
    const addMenuClasses = wrapper.get("[data-testid='media-add-menu']").classes();
    expect(addMenuClasses).toContain("max-sm:fixed");
    expect(addMenuClasses).toContain("max-sm:left-3");
    expect(addMenuClasses).toContain("max-sm:right-3");
    expect(addMenuClasses).toContain("max-sm:top-auto");
    expect(addMenuClasses).toContain("max-sm:bottom-[calc(4.65rem+env(safe-area-inset-bottom,0px))]");
    expect(addMenuClasses).toContain("max-sm:w-auto");

    await wrapper.get("[data-testid='media-filter-trigger']").trigger("click");
    const filterClasses = wrapper.get("[data-testid='media-filter-popover']").classes();
    expect(filterClasses).toContain("max-sm:fixed");
    expect(filterClasses).toContain("max-sm:left-3");
    expect(filterClasses).toContain("max-sm:right-3");
    expect(filterClasses).toContain("max-sm:top-auto");
    expect(filterClasses).toContain("max-sm:bottom-[calc(4.65rem+env(safe-area-inset-bottom,0px))]");
    expect(wrapper.html()).toContain("min-w-0 w-full flex-1");
  });
});
