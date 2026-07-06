import { describe, expect, it } from "vitest";

import {
  escapeReadOnlyHtml,
  formatReadOnlyBytes,
  formatReadOnlyDateTime,
  getReadOnlyAssetBadge,
  getReadOnlyWorkspaceFiles,
  getReadOnlyWorkspaceImages,
  hasReadOnlyAssets,
  normalizeReadOnlyAsset,
  renderReadOnlyBlock,
  renderReadOnlyContent,
  safeReadOnlyUrl,
} from "./workspaceReadOnlyViewModel.js";

describe("workspaceReadOnlyViewModel", () => {
  it("normalizes assets and groups them by type", () => {
    const assets = [
      normalizeReadOnlyAsset({
        idx: 1,
        workspaceIdx: 10,
        assetType: "image",
        originalName: "photo.png",
        fileSize: 1536,
        createdAt: "2026-07-05T10:00:00",
      }),
      normalizeReadOnlyAsset({
        id: 2,
        assetType: "FILE",
        fileOriginName: "doc.pdf",
        presignedDownloadUrl: "/download",
      }, 20),
    ];

    expect(assets[0]).toMatchObject({
      id: 1,
      workspaceId: 10,
      assetType: "IMAGE",
      originalName: "photo.png",
      fileSizeLabel: "1.50 KB",
    });
    expect(assets[1]).toMatchObject({
      id: 2,
      workspaceId: 20,
      downloadUrl: "/download",
    });
    expect(getReadOnlyWorkspaceImages(assets).map((asset) => asset.id)).toEqual([1]);
    expect(getReadOnlyWorkspaceFiles(assets).map((asset) => asset.id)).toEqual([2]);
    expect(hasReadOnlyAssets(assets)).toBe(true);
    expect(getReadOnlyAssetBadge(assets[0])).toBe("이미지");
    expect(getReadOnlyAssetBadge(assets[1])).toBe("파일");
  });

  it("formats values and sanitizes text/url content", () => {
    expect(formatReadOnlyBytes(0)).toBe("0 B");
    expect(formatReadOnlyBytes(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatReadOnlyDateTime("bad-date")).toBe("");
    expect(escapeReadOnlyHtml("<script>alert('x')</script>")).toBe("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(safeReadOnlyUrl("https://example.com/a?b=1", "https://fileinnout.local")).toBe("https://example.com/a?b=1");
    expect(safeReadOnlyUrl("javascript:alert(1)", "https://fileinnout.local")).toBe("");
  });

  it("renders supported editor blocks safely", () => {
    expect(renderReadOnlyBlock({ type: "header", data: { level: 9, text: "제목" } }))
      .toBe('<h6 class="ro-heading ro-heading--6">제목</h6>');
    expect(renderReadOnlyBlock({ type: "paragraph", data: { text: "<b>bold</b>" } }))
      .toBe('<p class="ro-paragraph">&lt;b&gt;bold&lt;/b&gt;</p>');
    expect(renderReadOnlyBlock({
      type: "checklist",
      data: { items: [{ text: "완료", checked: true }] },
    })).toContain("ro-checklist-item--checked");
    expect(renderReadOnlyBlock({
      type: "table",
      data: { withHeadings: true, content: [["A", "B"], ["1", "2"]] },
    })).toContain("<th>A</th>");
  });

  it("renders editor content and plain text fallbacks", () => {
    const raw = JSON.stringify({
      blocks: [
        { type: "paragraph", data: { text: "본문" } },
        { type: "image", data: { file: { url: "/image.png" }, caption: "캡션" } },
      ],
    });

    expect(renderReadOnlyContent(raw)).toContain('<p class="ro-paragraph">본문</p>');
    expect(renderReadOnlyContent(raw)).toContain('src="/image.png"');
    expect(renderReadOnlyContent("<not-json>")).toBe('<p class="ro-paragraph">&lt;not-json&gt;</p>');
  });
});
