import { describe, expect, it } from "vitest";
import {
  describeSearchScopeLabel,
  formatExtensionFilterValue,
  matchesSearchItem,
  normalizeExtensionToken,
  normalizeSearchScope,
  parseExtensionTokens,
  parseSearchQueryTokens,
} from "./fileSearch.js";

describe("fileSearch utilities", () => {
  it("normalizes search scopes safely", () => {
    expect(normalizeSearchScope()).toBe("current");
    expect(normalizeSearchScope("current")).toBe("current");
    expect(normalizeSearchScope("subtree")).toBe("subtree");
    expect(normalizeSearchScope("recursive")).toBe("subtree");
    expect(normalizeSearchScope("root")).toBe("root");
    expect(normalizeSearchScope("ALL")).toBe("root");
    expect(normalizeSearchScope("other")).toBe("current");
  });

  it("parses and formats single and multi extension filters", () => {
    expect(normalizeExtensionToken("*.PDF")).toBe("pdf");
    expect(normalizeExtensionToken("..png")).toBe("png");
    expect(normalizeExtensionToken("all")).toBe("");
    expect(parseExtensionTokens("all")).toEqual([]);
    expect(parseExtensionTokens("*.jpg, .PNG; pdf jpg")).toEqual(["jpg", "png", "pdf"]);
    expect(formatExtensionFilterValue(".pdf, PNG")).toBe("pdf, png");
    expect(formatExtensionFilterValue("")).toBe("all");
  });

  it("parses inline .ext, *.ext, and ext: keywords and matches items accurately", () => {
    expect(parseSearchQueryTokens("보고서 .pdf")).toEqual({
      textTerm: "보고서",
      textTokens: ["보고서"],
      inlineExtensions: ["pdf"],
    });
    expect(parseSearchQueryTokens("ext:jpg,png 2026")).toEqual({
      textTerm: "2026",
      textTokens: ["2026"],
      inlineExtensions: ["jpg", "png"],
    });

    const pdfDoc = { name: "2026_분기_보고서.pdf", extension: "pdf", isFolder: false };
    const folder = { name: "보고서.pdf", extension: "", isFolder: true };

    expect(matchesSearchItem({ ...pdfDoc, searchQuery: "2026 보고서 .pdf" })).toBe(true);
    expect(matchesSearchItem({ ...pdfDoc, searchQuery: "보고서", extensionFilter: "jpg, .pdf" })).toBe(true);
    expect(matchesSearchItem({ ...pdfDoc, searchQuery: "보고서", extensionFilter: "docx" })).toBe(false);
    expect(matchesSearchItem({ ...folder, searchQuery: ".pdf" })).toBe(false);
    expect(matchesSearchItem({ ...folder, searchQuery: "보고서" })).toBe(true);
  });

  it("describes directory search scope labels including selected root folder", () => {
    const roots = [
      { id: 10, name: "자료" },
      { id: 20, name: "프로젝트" },
    ];
    expect(describeSearchScopeLabel({ searchScope: "current" })).toBe("현재 디렉터리");
    expect(describeSearchScopeLabel({ searchScope: "subtree" })).toBe("현재 폴더 + 하위");
    expect(describeSearchScopeLabel({ searchScope: "root", rootFolders: roots })).toBe("루트 (홈 (전체))");
    expect(describeSearchScopeLabel({ searchScope: "root", searchRootFolderId: 10, rootFolders: roots })).toBe("루트 (자료)");
  });
});
