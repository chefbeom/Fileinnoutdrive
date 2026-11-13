import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { buildFolderUploadTree } from "@/utils/folderTreeBuilder.js";
import FolderUploadStructureModal from "./FolderUploadStructureModal.vue";

function createFakeFile(name, size, relativePath) {
  const file = new File(["x".repeat(Math.min(size, 10))], name);
  Object.defineProperty(file, "size", { value: size });
  if (relativePath) {
    Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  }
  return file;
}

describe("FolderUploadStructureModal.vue", () => {
  const files = [
    createFakeFile("a.png", 1024, "A폴더/a.png"),
    createFakeFile("b.jpg", 2048, "A폴더/b.jpg"),
    createFakeFile("c.webp", 4096, "A폴더/c.webp"),
    createFakeFile("qw.txt", 512, "A폴더/b폴더/qw.txt"),
  ];
  const sampleTreeData = buildFolderUploadTree(files, []);

  it("renders hierarchical folder and file structure from buildFolderUploadTree output", () => {
    const wrapper = mount(FolderUploadStructureModal, {
      props: {
        isOpen: true,
        treeData: sampleTreeData,
        targetLocationName: "홈 (최상위)",
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    expect(wrapper.text()).toContain("업로드 폴더 구조 확인");
    expect(wrapper.text()).toContain("홈 (최상위)");
    expect(wrapper.text()).toContain("2개"); // A폴더, b폴더
    expect(wrapper.text()).toContain("4개"); // 총 파일 4개
    // 계층 구조 내 폴더와 파일들이 모두 보여야 함
    expect(wrapper.text()).toContain("A폴더");
    expect(wrapper.text()).toContain("b폴더");
    expect(wrapper.text()).toContain("a.png");
    expect(wrapper.text()).toContain("b.jpg");
    expect(wrapper.text()).toContain("c.webp");
    expect(wrapper.text()).toContain("qw.txt");
    expect(wrapper.text()).not.toContain("업로드할 폴더 또는 파일 정보가 없습니다.");
  });

  it("emits confirm event when '업로드 시작' button is clicked", async () => {
    const wrapper = mount(FolderUploadStructureModal, {
      props: {
        isOpen: true,
        treeData: sampleTreeData,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const confirmBtn = wrapper.findAll("button").find((btn) => btn.text().includes("업로드 시작"));
    expect(confirmBtn).toBeDefined();
    await confirmBtn.trigger("click");

    expect(wrapper.emitted("confirm")).toBeTruthy();
    expect(wrapper.emitted("confirm").length).toBe(1);
  });

  it("emits cancel event when '취소' button is clicked", async () => {
    const wrapper = mount(FolderUploadStructureModal, {
      props: {
        isOpen: true,
        treeData: sampleTreeData,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const cancelBtn = wrapper.findAll("button").find((btn) => btn.text().includes("취소"));
    expect(cancelBtn).toBeDefined();
    await cancelBtn.trigger("click");

    expect(wrapper.emitted("cancel")).toBeTruthy();
    expect(wrapper.emitted("cancel").length).toBe(1);
  });
});
