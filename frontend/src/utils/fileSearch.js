export const SEARCH_SCOPE_OPTIONS = [
  { value: "current", label: "현재 디렉터리" },
  { value: "subtree", label: "현재 폴더 + 하위" },
  { value: "root", label: "루트 디렉터리" },
];

export const normalizeSearchScope = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "subtree" || normalized === "sub" || normalized === "recursive") {
    return "subtree";
  }
  if (normalized === "root" || normalized === "all") {
    return "root";
  }
  return "current";
};

export const normalizeExtensionToken = (rawToken) => {
  let normalized = String(rawToken || "").trim().toLowerCase();
  while (normalized.length > 0 && (normalized.startsWith("*") || normalized.startsWith("."))) {
    normalized = normalized.slice(1).trim();
  }
  if (!normalized || normalized === "all" || normalized === "*") {
    return "";
  }
  return normalized;
};

export const parseExtensionTokens = (rawFilter) => {
  if (!rawFilter) {
    return [];
  }
  const trimmed = String(rawFilter).trim();
  if (!trimmed || trimmed.toLowerCase() === "all") {
    return [];
  }

  const tokens = [];
  const seen = new Set();
  for (const part of trimmed.split(/[,;\s]+/)) {
    const normalized = normalizeExtensionToken(part);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      tokens.push(normalized);
    }
  }
  return tokens;
};

export const formatExtensionFilterValue = (rawFilter) => {
  const tokens = Array.isArray(rawFilter)
    ? [...new Set(rawFilter.map(normalizeExtensionToken).filter(Boolean))]
    : parseExtensionTokens(rawFilter);
  if (tokens.length === 0) {
    return "all";
  }
  return tokens.join(", ");
};

export const parseSearchQueryTokens = (rawQuery) => {
  const normalized = String(rawQuery || "").trim().toLowerCase();
  if (!normalized) {
    return {
      textTerm: "",
      textTokens: [],
      inlineExtensions: [],
    };
  }

  const textTokens = [];
  const inlineSet = new Set();

  for (const token of normalized.split(/\s+/)) {
    if (token.startsWith("ext:") && token.length > 4) {
      for (const ext of parseExtensionTokens(token.slice(4))) {
        inlineSet.add(ext);
      }
      continue;
    }

    if ((token.startsWith("*.") && token.length > 2) || (token.startsWith(".") && token.length > 1)) {
      const parsedExt = normalizeExtensionToken(token);
      if (parsedExt) {
        inlineSet.add(parsedExt);
        continue;
      }
    }

    textTokens.push(token);
  }

  return {
    textTerm: textTokens.join(" "),
    textTokens,
    inlineExtensions: [...inlineSet],
  };
};

export const matchesFileExtensionTokens = ({ name = "", extension = "", isFolder = false }, tokens = []) => {
  if (!tokens || tokens.length === 0) {
    return true;
  }
  if (isFolder) {
    return false;
  }
  const extLower = normalizeExtensionToken(extension);
  const nameLower = String(name || "").trim().toLowerCase();
  return tokens.some((token) => extLower === token || (nameLower && nameLower.endsWith(`.${token}`)));
};

export const matchesSearchItem = ({
  name = "",
  extension = "",
  isFolder = false,
  searchQuery = "",
  extensionFilter = "all",
  extraSearchText = [],
}) => {
  const parsed = parseSearchQueryTokens(searchQuery);
  const filterTokens = parseExtensionTokens(extensionFilter);

  if (parsed.textTokens.length > 0) {
    const haystack = [
      String(name || "").toLowerCase(),
      normalizeExtensionToken(extension),
      ...extraSearchText.map((entry) => String(entry || "").toLowerCase()),
    ].join(" ");
    if (!parsed.textTokens.every((token) => haystack.includes(token))) {
      return false;
    }
  }

  if (
    parsed.inlineExtensions.length > 0 &&
    !matchesFileExtensionTokens({ name, extension, isFolder }, parsed.inlineExtensions)
  ) {
    return false;
  }

  if (
    filterTokens.length > 0 &&
    !matchesFileExtensionTokens({ name, extension, isFolder }, filterTokens)
  ) {
    return false;
  }

  return true;
};

export const describeSearchScopeLabel = ({
  searchScope = "current",
  searchRootFolderId = null,
  rootFolders = [],
  rootFallbackLabel = "홈 (전체)",
} = {}) => {
  const normalizedScope = normalizeSearchScope(searchScope);
  if (normalizedScope === "subtree") {
    return "현재 폴더 + 하위";
  }
  if (normalizedScope === "root") {
    if (searchRootFolderId != null) {
      const matched = (rootFolders || []).find(
        (folder) => String(folder?.id ?? folder?.idx) === String(searchRootFolderId),
      );
      return matched?.name ? `루트 (${matched.name})` : "루트 (선택 폴더)";
    }
    return `루트 (${rootFallbackLabel})`;
  }
  return "현재 디렉터리";
};
