import { describe, expect, it } from "vitest";
import { useHeaderSearchStore } from "./useHeaderSearchStore.js";

describe("useHeaderSearchStore", () => {
  it("preserves custom and multi extension filters when availableExtensions updates and resets scope cleanly", () => {
    const store = useHeaderSearchStore();
    const state = store.getScopeState("home");

    state.searchQuery = "계약";
    state.extensionFilter = "pdf, .hwp";
    state.searchScope = "root";
    state.searchRootFolderId = 42;

    store.setAvailableExtensions("home", [".PDF", "jpg"]);
    expect(state.availableExtensions).toEqual(["jpg", "pdf"]);
    expect(state.extensionFilter).toBe("pdf, .hwp");

    store.setAvailableRootFolders("home", [
      { id: 10, fileOriginName: "자료" },
      { id: 10, name: "중복자료" },
      { idx: 42, fileOriginName: "프로젝트" },
    ]);
    expect(state.availableRootFolders).toEqual([
      { id: 10, name: "자료" },
      { id: 42, name: "프로젝트" },
    ]);

    store.resetScope("home");
    expect(state.searchQuery).toBe("");
    expect(state.extensionFilter).toBe("all");
    expect(state.searchScope).toBe("current");
    expect(state.searchRootFolderId).toBeNull();
    expect(state.availableExtensions).toEqual(["jpg", "pdf"]);
    expect(state.availableRootFolders).toEqual([
      { id: 10, name: "자료" },
      { id: 42, name: "프로젝트" },
    ]);
  });
});
