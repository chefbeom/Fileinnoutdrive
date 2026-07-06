export function formatReadOnlyBytes(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** index;
  const digits = index === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[index]}`;
}

export function formatReadOnlyDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function normalizeReadOnlyAsset(asset = {}, workspaceId = null) {
  return {
    id: asset.idx ?? asset.id ?? null,
    workspaceId: asset.workspaceIdx ?? asset.workspaceId ?? workspaceId,
    assetType: String(asset.assetType || "FILE").toUpperCase(),
    originalName: asset.originalName || asset.fileOriginName || "이름 없는 파일",
    storedFileName: asset.storedFileName || asset.fileSaveName || "",
    objectKey: asset.objectKey || asset.fileSavePath || "",
    contentType: asset.contentType || "application/octet-stream",
    fileSize: Number(asset.fileSize || 0),
    previewUrl: asset.previewUrl || "",
    downloadUrl: asset.downloadUrl || asset.presignedDownloadUrl || "",
    createdAt: asset.createdAt || null,
    createdAtLabel: formatReadOnlyDateTime(asset.createdAt),
    fileSizeLabel: formatReadOnlyBytes(asset.fileSize),
  };
}

export const getReadOnlyWorkspaceImages = (assets = []) =>
  assets.filter((asset) => asset.assetType === "IMAGE");

export const getReadOnlyWorkspaceFiles = (assets = []) =>
  assets.filter((asset) => asset.assetType === "FILE");

export const hasReadOnlyAssets = (assets = []) => assets.length > 0;

export const getReadOnlyAssetBadge = (asset = {}) =>
  asset?.assetType === "IMAGE" ? "이미지" : "파일";

export const escapeReadOnlyHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

export function safeReadOnlyUrl(value = "", baseOrigin = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const origin = baseOrigin ||
    globalThis.window?.location?.origin ||
    globalThis.location?.origin ||
    "http://localhost";

  try {
    const parsed = new URL(raw, origin);
    if (["http:", "https:"].includes(parsed.protocol)) {
      return escapeReadOnlyHtml(raw);
    }
  } catch {
    return "";
  }

  return "";
}

export function renderReadOnlyBlock(block = {}) {
  if (!block?.type) return "";

  const data = block.data || {};

  switch (block.type) {
    case "header": {
      const level = Math.min(Math.max(Number(data.level) || 2, 1), 6);
      return `<h${level} class="ro-heading ro-heading--${level}">${escapeReadOnlyHtml(data.text)}</h${level}>`;
    }
    case "paragraph":
      return `<p class="ro-paragraph">${escapeReadOnlyHtml(data.text)}</p>`;
    case "list": {
      const tag = data.style === "ordered" ? "ol" : "ul";
      const style = tag === "ol" ? "ordered" : "unordered";
      const items = (data.items || []).map((item) => `<li>${escapeReadOnlyHtml(item)}</li>`).join("");
      return `<${tag} class="ro-list ro-list--${style}">${items}</${tag}>`;
    }
    case "image": {
      const caption = data.caption ? `<figcaption class="ro-image-caption">${escapeReadOnlyHtml(data.caption)}</figcaption>` : "";
      const classes = ["ro-image-wrap", data.withBorder && "ro-image-wrap--border", data.stretched && "ro-image-wrap--stretched"].filter(Boolean).join(" ");
      const src = safeReadOnlyUrl(data.file?.url || data.url);
      if (!src) return caption ? `<figure class="${classes}">${caption}</figure>` : "";
      return `<figure class="${classes}"><img src="${src}" alt="${escapeReadOnlyHtml(data.caption)}" class="ro-image" />${caption}</figure>`;
    }
    case "delimiter":
      return '<hr class="ro-delimiter" />';
    case "quote":
      return `<blockquote class="ro-quote"><p>${escapeReadOnlyHtml(data.text)}</p>${data.caption ? `<cite>${escapeReadOnlyHtml(data.caption)}</cite>` : ""}</blockquote>`;
    case "code":
      return `<pre class="ro-code"><code>${escapeReadOnlyHtml(data.code)}</code></pre>`;
    case "table": {
      const rows = (data.content || []).map((row, rowIndex) => {
        const cells = row.map((cell) => rowIndex === 0 && data.withHeadings ? `<th>${escapeReadOnlyHtml(cell)}</th>` : `<td>${escapeReadOnlyHtml(cell)}</td>`).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      return `<div class="ro-table-wrap"><table class="ro-table">${rows}</table></div>`;
    }
    case "checklist": {
      const items = (data.items || []).map((item) =>
        `<li class="ro-checklist-item${item.checked ? " ro-checklist-item--checked" : ""}">
          <span class="ro-checklist-mark">${item.checked ? "✓" : ""}</span>
          <span>${escapeReadOnlyHtml(item.text)}</span>
        </li>`
      ).join("");
      return `<ul class="ro-checklist">${items}</ul>`;
    }
    default:
      return data.text ? `<p class="ro-paragraph">${escapeReadOnlyHtml(data.text)}</p>` : "";
  }
}

export function renderReadOnlyContent(raw) {
  if (!raw) return "";

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed?.blocks && Array.isArray(parsed.blocks)) {
      return parsed.blocks.map(renderReadOnlyBlock).join("\n");
    }
  } catch {}

  return `<p class="ro-paragraph">${escapeReadOnlyHtml(raw)}</p>`;
}
