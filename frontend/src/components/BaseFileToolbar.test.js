import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import BaseFileToolbar from "./BaseFileToolbar.vue";

describe("BaseFileToolbar.vue", () => {
  const defaultProps = {
    title: "자료",
    toolbarMetaLabel: "총 4개 항목 · 현재 페이지 4개 · 총 565 KB",
    showFolderNavigation: true,
    folderPathSegments: [
      { id: null, name: "홈" },
      { id: 10, name: "자료" },
    ],
    currentFolder: { id: 10, name: "자료" },
    folderSummaryCards: [
      { key: "items", label: "현재 폴더 항목", value: 4 },
      { key: "files", label: "현재 폴더 파일", value: 3 },
      { key: "folders", label: "현재 폴더 하위 폴더", value: 1 },
      { key: "size", label: "현재 폴더 파일 크기", value: "565 KB" },
    ],
    sortOption: "updatedAt-desc",
    sortOptions: [
      { value: "updatedAt-desc", label: "최근 수정순" },
      { value: "name-asc", label: "이름순" },
    ],
    layoutGuideLabel: "배치",
    layoutPreset: "20",
    visibleLayoutPresetOptions: [
      { value: "20", label: "20개" },
      { value: "50", label: "50개" },
      { value: "custom", label: "직접 설정" },
    ],
    layoutGuideHint: "현재 한 페이지에 20개씩 표시합니다.",
    viewMode: "table",
    itemSize: "medium",
  };

  it("renders condensed title info, inline folder counts, and breadcrumb controls cleanly without expanded view controls", () => {
    const wrapper = mount(BaseFileToolbar, { props: defaultProps });

    expect(wrapper.text()).toContain("자료");
    expect(wrapper.text()).toContain("총 4개 항목 · 현재 페이지 4개 · 총 565 KB");
    expect(wrapper.text()).toContain("파일 3 · 폴더 1");
    expect(wrapper.text()).toContain("홈");
    expect(wrapper.text()).toContain("자료");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.findAll(".toolbar-folder-stat")).toHaveLength(0);

    const propBtn = wrapper.findAll("button").find((b) => b.text().includes("속성"));
    const backBtn = wrapper.findAll("button").find((b) => b.text().includes("상위"));
    expect(propBtn).toBeDefined();
    expect(backBtn).toBeDefined();
  });

  it("folds view mode, size, and layout preset into a toggleable popover", async () => {
    const wrapper = mount(BaseFileToolbar, { props: defaultProps });

    const trigger = wrapper.get(".toolbar-view-trigger");
    expect(trigger.text()).toContain("리스트");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    await trigger.trigger("click");
    const popover = wrapper.get('[role="dialog"]');
    expect(popover.text()).toContain("보기 모드");
    expect(popover.text()).toContain("항목 크기");
    expect(popover.text()).toContain("배치");

    const cardBtn = popover.findAll("button").find((b) => b.text().includes("카드"));
    await cardBtn.trigger("click");
    expect(wrapper.emitted("set-view-mode")?.[0]).toEqual(["grid"]);

    const largeBtn = popover.findAll("button").find((b) => b.text().includes("크게"));
    await largeBtn.trigger("click");
    expect(wrapper.emitted("set-item-size")?.[0]).toEqual(["large"]);

    const layoutSelect = popover.get("select");
    await layoutSelect.setValue("50");
    expect(wrapper.emitted("set-layout-preset")?.[0]).toEqual(["50"]);
  });

  it("emits breadcrumb navigation, folder properties, and go-back events", async () => {
    const wrapper = mount(BaseFileToolbar, { props: defaultProps });

    const homeCrumb = wrapper.findAll(".breadcrumb-button").find((b) => b.text() === "홈");
    await homeCrumb.trigger("click");
    expect(wrapper.emitted("navigate-folder")?.[0]).toEqual([null]);

    const propBtn = wrapper.findAll("button").find((b) => b.text().includes("속성"));
    await propBtn.trigger("click");
    expect(wrapper.emitted("show-folder-properties")?.[0]).toEqual([{ id: 10, name: "자료" }]);

    const backBtn = wrapper.findAll("button").find((b) => b.text().includes("상위"));
    await backBtn.trigger("click");
    expect(wrapper.emitted("go-back")).toBeTruthy();
  });
});
