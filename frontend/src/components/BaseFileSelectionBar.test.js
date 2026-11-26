import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import BaseFileSelectionBar from "./BaseFileSelectionBar.vue";

describe("BaseFileSelectionBar.vue", () => {
  it("renders idle state with fixed slot height when selectedCount is 0 to prevent layout shift", () => {
    const wrapper = mount(BaseFileSelectionBar, {
      props: {
        selectedCount: 0,
      },
    });

    const slot = wrapper.find(".selection-bar-slot");
    expect(slot.exists()).toBe(true);
    expect(slot.classes()).toContain("selection-bar--idle");
    expect(wrapper.text()).toContain("선택된 항목 없음");
    expect(wrapper.text()).toContain("일괄 작업 대기 중");
    expect(wrapper.text()).not.toContain("파일이나 폴더를 선택하면 일괄 다운로드");
    expect(wrapper.findAll("button").length).toBe(0);
  });

  it("renders active batch action buttons when selectedCount > 0", async () => {
    const wrapper = mount(BaseFileSelectionBar, {
      props: {
        selectedCount: 2,
        downloadableCount: 2,
        ownedShareableCount: 2,
        vaultMovableCount: 2,
        deleteMode: "trash",
      },
    });

    const slot = wrapper.find(".selection-bar-slot");
    expect(slot.exists()).toBe(true);
    expect(slot.classes()).toContain("selection-bar--active");
    expect(wrapper.text()).toContain("2개 선택됨");

    const buttons = wrapper.findAll("button");
    const downloadBtn = buttons.find((b) => b.text().includes("선택 다운로드"));
    const shareBtn = buttons.find((b) => b.text().includes("선택 공유"));
    const vaultMoveBtn = buttons.find((b) => b.text().includes("자체 비밀구역으로 옮기기"));
    const deleteBtn = buttons.find((b) => b.text().includes("선택 삭제"));
    const clearBtn = buttons.find((b) => b.text().includes("선택 해제"));

    expect(downloadBtn).toBeDefined();
    expect(shareBtn).toBeDefined();
    expect(vaultMoveBtn).toBeDefined();
    expect(deleteBtn).toBeDefined();
    expect(clearBtn).toBeDefined();

    await clearBtn.trigger("click");
    expect(wrapper.emitted("clear")).toBeTruthy();

    await downloadBtn.trigger("click");
    expect(wrapper.emitted("download")).toBeTruthy();

    await vaultMoveBtn.trigger("click");
    expect(wrapper.emitted("move-to-vault")).toBeTruthy();

    await wrapper.setProps({ vaultMode: true, vaultExportableCount: 2 });
    expect(wrapper.findAll("button").find((b) => b.text().includes("자체 비밀구역으로 옮기기"))).toBeUndefined();
    const exportBtn = wrapper.findAll("button").find((b) => b.text().includes("일반 저장소로 꺼내기 (복호화)"));
    expect(exportBtn).toBeDefined();
    await exportBtn.trigger("click");
    expect(wrapper.emitted("move-from-vault")).toBeTruthy();

    await wrapper.setProps({
      vaultMode: false,
      favoriteCandidateCount: 1,
      favoritedCount: 1,
    });
    const addFavBtn = wrapper.findAll("button").find((b) => b.text().includes("즐겨찾기 추가"));
    const removeFavBtn = wrapper.findAll("button").find((b) => b.text().includes("즐겨찾기 해제"));
    expect(addFavBtn).toBeDefined();
    expect(removeFavBtn).toBeDefined();
    await addFavBtn.trigger("click");
    await removeFavBtn.trigger("click");
    expect(wrapper.emitted("favorite")).toEqual([[true], [false]]);
  });
});
