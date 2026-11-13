// Pure functional module for Media Series & Season classification,
// episode parsing, fuzzy template matching, and user override resolution.

const RELEASE_TAG_PATTERNS = [
  /\[(?:1080p|720p|2160p|4k|fhd|hd|bd|bdrip|web-?dl|webrip|hevc|x264|x265|aac|flac|10bit|dual|sub|dub|kor|eng|jpn|ohys-raws|leopard-raws|subsplease|erai-raws)[^\]]*\]/gi,
  /\((?:1080p|720p|2160p|4k|bd|bdrip|web-?dl|webrip|x264|x265|19\d{2}|20\d{2})[^)]*\)/gi,
];

// Explicit markers for seasons & specials
const EXPLICIT_SEASON_RULES = [
  // Korean / English / Japanese numeric season markers
  {
    regex: /(?:\(|\[|-|\s|_)*(?:시즌|season)\s*0*([1-9]\d?)(?:\)|\]|-|\s|_)*/gi,
    resolve: (m) => ({ kind: "season", number: Number(m[1]), rawLabel: `시즌 ${Number(m[1])}` }),
  },
  {
    regex: /(?:\(|\[|-|\s|_)*(?:제\s*)?0*([1-9]\d?)\s*(?:기|쿨)(?:\)|\]|-|\s|_)*/gi,
    resolve: (m) => ({ kind: "season", number: Number(m[1]), rawLabel: `${Number(m[1])}기` }),
  },
  {
    regex: /(?:\(|\[|-|\s|_)*第\s*0*([1-9]\d?)\s*期(?:\)|\]|-|\s|_)*/gi,
    resolve: (m) => ({ kind: "season", number: Number(m[1]), rawLabel: `${Number(m[1])}기` }),
  },
  {
    regex: /(?:^|[\s._\-[])s0*([1-9]\d?)(?=$|[\s._\-\]])/gi,
    resolve: (m) => ({ kind: "season", number: Number(m[1]), rawLabel: `시즌 ${Number(m[1])}` }),
  },
  {
    regex: /(?:\(|\[|-|\s|_)*(?:part|파트)\s*0*([1-9]\d?)(?:\)|\]|-|\s|_)*/gi,
    resolve: (m) => ({ kind: "season", number: Number(m[1]), rawLabel: `파트 ${Number(m[1])}` }),
  },
  // Sequel / Final markers (-속-, -완-, Zoku, Kan, Final)
  {
    regex: /(?:[-~_(\[\s]+)(?:속|續|続|zoku)(?:[-~_)\]\s]+|$)/gi,
    resolve: () => ({ kind: "sequel", number: 2, rawLabel: "속 (2기)" }),
  },
  {
    regex: /(?:[-~_(\[\s]+)(?:완|完|kan|완결편|完結編|final(?:\s*season)?|파이널(?:\s*시즌)?)(?:[-~_)\]\s]+|$)/gi,
    resolve: () => ({ kind: "final", number: 99, rawLabel: "완 (완결편)" }),
  },
  // Roman numeral at the end of title
  {
    regex: /\s+(II|III|IV)(?=$|\s|\(|\])/g,
    resolve: (m) => {
      const map = { II: 2, III: 3, IV: 4 };
      const num = map[m[1]] || 2;
      return { kind: "season", number: num, rawLabel: `시즌 ${num}` };
    },
  },
];

const SPECIAL_MARKER_RULES = [
  {
    regex: /(?:\(|\[|-|\s|_)*(?:극장판|劇場版|the\s+movie|movie|영화)(?:\)|\]|-|\s|_|$)/gi,
    label: "극장판",
  },
  {
    regex: /(?:\(|\[|-|\s|_)*(?:ova|oad|ona|스페셜|특별편|특전|special|sp)(?:\)|\]|-|\s|_|$)/gi,
    label: "특별편 (OVA/SP)",
  },
];

export const toCompactKey = (text = "") => {
  return String(text || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s._\-~:!?,·'"`()[\]{}<>/\\|]+/g, "");
};

export const buildCharacterBigrams = (compact = "") => {
  const clean = String(compact || "");
  if (!clean) return [];
  if (clean.length === 1) return [clean];
  const grams = [];
  for (let i = 0; i < clean.length - 1; i += 1) {
    grams.push(clean.slice(i, i + 2));
  }
  return grams;
};

export const computeDiceSimilarity = (compactA = "", compactB = "") => {
  if (!compactA || !compactB) return 0;
  if (compactA === compactB) return 1;
  const gramsA = buildCharacterBigrams(compactA);
  const gramsB = buildCharacterBigrams(compactB);
  if (!gramsA.length || !gramsB.length) return 0;

  const counts = new Map();
  for (const g of gramsA) {
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  let intersection = 0;
  for (const g of gramsB) {
    const c = counts.get(g) || 0;
    if (c > 0) {
      intersection += 1;
      counts.set(g, c - 1);
    }
  }
  return (2 * intersection) / (gramsA.length + gramsB.length);
};

export const commonPrefixLength = (a = "", b = "") => {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) {
    i += 1;
  }
  return i;
};

export const commonSuffixLength = (a = "", b = "", maxPrefix = 0) => {
  const limit = Math.min(a.length, b.length) - maxPrefix;
  let i = 0;
  while (i < limit && a[a.length - 1 - i] === b[b.length - 1 - i]) {
    i += 1;
  }
  return i;
};

/**
 * Normalizes a folder name and extracts season/special markers.
 */
export const analyzeFolderTitle = (rawFolderName = "") => {
  let working = String(rawFolderName || "").normalize("NFC").trim();

  for (const pattern of RELEASE_TAG_PATTERNS) {
    working = working.replace(pattern, " ");
  }

  let isSpecial = false;
  let specialTypeLabel = "";
  for (const rule of SPECIAL_MARKER_RULES) {
    if (rule.regex.test(working)) {
      isSpecial = true;
      specialTypeLabel = rule.label;
      working = working.replace(rule.regex, " ");
    }
    rule.regex.lastIndex = 0;
  }

  let seasonNumberHint = null;
  let seasonKind = "normal"; // 'normal' | 'season' | 'sequel' | 'final' | 'special'
  let extractedSeasonLabel = "";

  for (const rule of EXPLICIT_SEASON_RULES) {
    rule.regex.lastIndex = 0;
    const match = rule.regex.exec(working);
    if (match) {
      const resolved = rule.resolve(match);
      if (seasonNumberHint == null || resolved.number < seasonNumberHint) {
        seasonNumberHint = resolved.number;
        seasonKind = resolved.kind;
        extractedSeasonLabel = resolved.rawLabel;
      }
      working = working.replace(rule.regex, " ");
    }
    rule.regex.lastIndex = 0;
  }

  if (isSpecial) {
    seasonKind = "special";
  }

  const cleanBaseTitle = working
    .replace(/^[\s._\-~:]+|[\s._\-~:]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim() || String(rawFolderName || "").trim();

  const compactBase = toCompactKey(cleanBaseTitle);
  const compactOriginal = toCompactKey(rawFolderName);

  return {
    originalName: String(rawFolderName || "").trim(),
    cleanBaseTitle,
    compactBase: compactBase || compactOriginal,
    compactOriginal,
    seasonKind,
    seasonNumberHint,
    extractedSeasonLabel: isSpecial ? (specialTypeLabel || "특별편") : extractedSeasonLabel,
    isSpecial,
    specialTypeLabel,
  };
};

/**
 * Computes similarity between two analyzed folder units.
 * Returns { score: 0..1, matchType: 'exact-base' | 'template' | 'prefix' | 'fuzzy' | 'none', sharedPrefix, sharedSuffix }
 */
export const computeFolderPairSimilarity = (unitA, unitB) => {
  const a = unitA?.analyzed || analyzeFolderTitle(unitA?.name || "");
  const b = unitB?.analyzed || analyzeFolderTitle(unitB?.name || "");

  const A = a.compactBase;
  const B = b.compactBase;
  if (!A || !B) {
    return { score: 0, matchType: "none", sharedPrefix: "", sharedSuffix: "" };
  }

  const sameParentBonus =
    unitA?.parentId != null &&
    unitB?.parentId != null &&
    String(unitA.parentId) === String(unitB.parentId)
      ? 0.08
      : 0;

  // S1: Exact base title match after removing season/special markers
  if (A === B && A.length >= 2) {
    return {
      score: 1.0,
      matchType: "exact-base",
      sharedPrefix: A,
      sharedSuffix: "",
    };
  }

  // S2: Prefix containment (e.g., "진격의거인" & "진격의거인더파이널" or movie subtitle)
  const shorter = A.length <= B.length ? A : B;
  const longer = A.length <= B.length ? B : A;
  if (shorter.length >= 4 && longer.startsWith(shorter)) {
    const ratio = shorter.length / longer.length;
    const baseScore = 0.82 + 0.14 * ratio;
    return {
      score: Math.min(1, baseScore + sameParentBonus),
      matchType: "prefix",
      sharedPrefix: shorter,
      sharedSuffix: "",
    };
  }

  // S3: Prefix + Suffix Template (e.g., "청춘돼지는...의꿈을꾸지않는다")
  const pLen = commonPrefixLength(A, B);
  const sLen = commonSuffixLength(A, B, pLen);
  const maxLen = Math.max(A.length, B.length);

  if (pLen >= 3 && sLen >= 3 && pLen + sLen >= 6) {
    const coverage = (pLen + sLen) / maxLen;
    const templateScore = 0.58 + 0.42 * coverage + sameParentBonus;
    return {
      score: Math.min(1, Number(templateScore.toFixed(4))),
      matchType: "template",
      sharedPrefix: A.slice(0, pLen),
      sharedSuffix: A.slice(A.length - sLen),
    };
  }

  // S4: Dice 2-gram similarity (requires meaningful prefix or high overlap to avoid false positives)
  const dice = computeDiceSimilarity(A, B);
  if (pLen >= 4 && dice >= 0.62) {
    const score = Math.min(1, dice + 0.12 + sameParentBonus);
    return {
      score: Number(score.toFixed(4)),
      matchType: "fuzzy",
      sharedPrefix: A.slice(0, pLen),
      sharedSuffix: "",
    };
  }

  return {
    score: Number(Math.min(1, dice * 0.85).toFixed(4)),
    matchType: "none",
    sharedPrefix: pLen > 0 ? A.slice(0, pLen) : "",
    sharedSuffix: "",
  };
};

/**
 * Parses episode number and title from a video filename.
 */
export const parseEpisodeFromFilename = (fileName = "") => {
  const raw = String(fileName || "").normalize("NFC").trim();
  const withoutExt = raw.replace(/\.[^.]+$/, "");

  for (const rule of SPECIAL_MARKER_RULES) {
    rule.regex.lastIndex = 0;
    if (rule.regex.test(withoutExt)) {
      rule.regex.lastIndex = 0;
      return {
        episodeNumber: null,
        isSpecialEpisode: true,
        episodeBadge: rule.label === "극장판" ? "극장판" : "OVA/특별편",
        cleanEpisodeTitle: withoutExt,
      };
    }
  }

  // 1) S01E05 or E05 / EP05
  const seMatch = /(?:s\d{1,2})?\s*(?:e|ep|episode)\s*0*(\d{1,4})(?!\d)/i.exec(withoutExt);
  if (seMatch) {
    const ep = Number(seMatch[1]);
    return {
      episodeNumber: ep,
      isSpecialEpisode: false,
      episodeBadge: `${ep}화`,
      cleanEpisodeTitle: withoutExt,
    };
  }

  // 2) 제01화, 01화, 第01話
  const korMatch = /(?:제|第)?\s*0*(\d{1,4})\s*(?:화|話|회|강|부)(?!\d)/i.exec(withoutExt);
  if (korMatch) {
    const ep = Number(korMatch[1]);
    return {
      episodeNumber: ep,
      isSpecialEpisode: false,
      episodeBadge: `${ep}화`,
      cleanEpisodeTitle: withoutExt,
    };
  }

  // 3) " - 01 " or "[01]" or "_01_" avoiding resolution numbers (720, 1080, 2160, 264, 265, years)
  const dashMatch = /(?:[-_[\s])0*(\d{1,3})(?:v\d)?(?=$|[\s\]_.-])/i.exec(
    withoutExt.replace(/\b(?:19\d{2}|20\d{2}|480|720|1080|1440|2160|264|265)\b/g, ""),
  );
  if (dashMatch) {
    const ep = Number(dashMatch[1]);
    if (ep > 0 && ep < 500) {
      return {
        episodeNumber: ep,
        isSpecialEpisode: false,
        episodeBadge: `${ep}화`,
        cleanEpisodeTitle: withoutExt,
      };
    }
  }

  return {
    episodeNumber: null,
    isSpecialEpisode: false,
    episodeBadge: "단편",
    cleanEpisodeTitle: withoutExt,
  };
};

export const sortEpisodesNaturally = (episodes = []) => {
  return [...episodes].sort((a, b) => {
    const epA = a.episodeNumber;
    const epB = b.episodeNumber;
    if (epA != null && epB != null && epA !== epB) {
      return epA - epB;
    }
    if (epA != null && epB == null) return -1;
    if (epA == null && epB != null) return 1;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko-KR", { numeric: true });
  });
};

const makePairKey = (idA, idB) => {
  const a = String(idA);
  const b = String(idB);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};

/**
 * Orders seasons inside a series:
 * 1. Explicit user seasonOrder if provided
 * 2. Regular seasons ordered by seasonNumberHint (null treated as Season 1 if another season >= 2 exists),
 *    with 'final' (-완-) placed after numbered seasons
 * 3. Specials / Movies placed at the end (with isSpecial: true)
 */
export const orderAndLabelSeasons = (
  seasonUnits = [],
  customSeasonLabels = {},
  customOrderIds = [],
  { rootChildFolderId = null, rootChildTitle = "" } = {},
) => {
  const customOrderMap = new Map();
  customOrderIds.forEach((id, idx) => customOrderMap.set(String(id), idx));
  const rootChildKey = rootChildFolderId != null ? String(rootChildFolderId) : null;
  const compactRootTitle = rootChildTitle ? toCompactKey(analyzeFolderTitle(rootChildTitle).cleanBaseTitle || rootChildTitle) : "";

  const sorted = [...seasonUnits].sort((a, b) => {
    const idA = String(a.folderId);
    const idB = String(b.folderId);
    if (customOrderMap.has(idA) && customOrderMap.has(idB)) {
      return customOrderMap.get(idA) - customOrderMap.get(idB);
    }

    // Specials / Movies go after regular seasons unless manually ordered
    if (a.analyzed.isSpecial !== b.analyzed.isSpecial) {
      return a.analyzed.isSpecial ? 1 : -1;
    }

    // Direct episodes placed inside a series child folder come before nested season folders unless numbered higher
    if (rootChildKey && idA !== idB) {
      if (idA === rootChildKey && a.analyzed.seasonNumberHint == null) return -1;
      if (idB === rootChildKey && b.analyzed.seasonNumberHint == null) return 1;
    }

    const hintA = a.analyzed.seasonNumberHint ?? 1;
    const hintB = b.analyzed.seasonNumberHint ?? 1;
    if (hintA !== hintB) {
      return hintA - hintB;
    }

    if (compactRootTitle) {
      const aMatchesRoot = a.analyzed.compactBase === compactRootTitle;
      const bMatchesRoot = b.analyzed.compactBase === compactRootTitle;
      if (aMatchesRoot !== bMatchesRoot) {
        return aMatchesRoot ? -1 : 1;
      }
    }

    // Fallback to earliest episode upload date or natural folder name sort
    const timeA = a.earliestUploadMs || 0;
    const timeB = b.earliestUploadMs || 0;
    if (timeA && timeB && timeA !== timeB) {
      return timeA - timeB;
    }

    return String(a.name || "").localeCompare(String(b.name || ""), "ko-KR", { numeric: true });
  });

  let regularCounter = 0;
  return sorted.map((unit, idx) => {
    const folderId = String(unit.folderId);
    const customLabel = customSeasonLabels?.[folderId];
    if (customLabel) {
      if (!unit.analyzed.isSpecial) regularCounter += 1;
      return {
        ...unit,
        seasonIndex: idx + 1,
        seasonNumber: unit.analyzed.isSpecial ? null : regularCounter,
        seasonLabel: customLabel,
        isSpecial: Boolean(unit.analyzed.isSpecial),
      };
    }

    if (unit.analyzed.isSpecial) {
      return {
        ...unit,
        seasonIndex: idx + 1,
        seasonNumber: null,
        seasonLabel: unit.analyzed.extractedSeasonLabel || unit.name || "특별편 · 극장판",
        isSpecial: true,
      };
    }

    regularCounter += 1;
    let defaultLabel = `시즌 ${regularCounter}`;
    if (unit.analyzed.seasonKind === "sequel") {
      defaultLabel = `시즌 ${regularCounter} (속)`;
    } else if (unit.analyzed.seasonKind === "final") {
      defaultLabel = `시즌 ${regularCounter} (완)`;
    } else if (rootChildKey && folderId === rootChildKey && sorted.length > 1) {
      defaultLabel = "본편 (기본 폴더)";
    } else if (
      rootChildKey &&
      unit.analyzed.seasonKind === "normal" &&
      unit.analyzed.seasonNumberHint == null &&
      compactRootTitle &&
      unit.analyzed.compactBase &&
      unit.analyzed.compactBase !== compactRootTitle
    ) {
      defaultLabel = unit.analyzed.cleanBaseTitle || unit.name;
    } else if (sorted.length > 1 && unit.analyzed.cleanBaseTitle !== sorted[0].analyzed.cleanBaseTitle) {
      defaultLabel = `시즌 ${regularCounter}`;
    }

    return {
      ...unit,
      seasonIndex: idx + 1,
      seasonNumber: regularCounter,
      seasonLabel: defaultLabel,
      isSpecial: false,
    };
  });
};

const sortResolvedSeries = (seriesList = []) => {
  return seriesList.sort((a, b) => {
    if ((b.watchingCount > 0) !== (a.watchingCount > 0)) {
      return b.watchingCount > 0 ? 1 : -1;
    }
    if ((b.seasonCount > 1) !== (a.seasonCount > 1)) {
      return b.seasonCount > 1 ? 1 : -1;
    }
    return (b.latestUploadMs || 0) - (a.latestUploadMs || 0);
  });
};

/**
 * Splits a group of folder units into maximal sub-groups only when explicit
 * cannotLink constraints forbid keeping units in the same group.
 */
const splitGroupByCannotLink = (units = [], cannotLinkPairs = new Set()) => {
  if (units.length <= 1 || cannotLinkPairs.size === 0) {
    return units.length ? [units] : [];
  }
  const groups = [];
  for (const unit of units) {
    let placed = false;
    for (const group of groups) {
      const conflicts = group.some((member) => cannotLinkPairs.has(makePairKey(member.folderId, unit.folderId)));
      if (!conflicts) {
        group.push(unit);
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push([unit]);
    }
  }
  return groups;
};

/**
 * Resolves the deepest designated Media Area ancestor for a given folder unit,
 * along with the immediate child folder under that Area root (or null if direct files).
 */
const resolveAreaMembership = (unit, areaById, folderById) => {
  if (!unit || !areaById.size) return null;
  const unitId = String(unit.folderId ?? "");
  if (!unitId || unitId.startsWith("__")) return null;

  const chain = [];
  const visited = new Set();
  if (!folderById.has(unitId)) {
    chain.unshift({
      id: unitId,
      name: unit.name || unitId,
      parentId: unit.parentId ?? null,
    });
    visited.add(unitId);
  }

  let cursorId = folderById.has(unitId)
    ? unitId
    : unit.parentId != null
      ? String(unit.parentId)
      : "";

  while (cursorId && !visited.has(cursorId)) {
    visited.add(cursorId);
    const folder = folderById.get(cursorId);
    if (!folder) break;
    chain.unshift(folder);
    cursorId = folder.parentId != null ? String(folder.parentId) : "";
  }

  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const candidateId = String(chain[i].id);
    if (areaById.has(candidateId)) {
      const area = areaById.get(candidateId);
      const directChild = i + 1 < chain.length ? chain[i + 1] : null;
      return { area, directChild };
    }
  }
  return null;
};

/**
 * Main Series Classification Engine.
 *
 * Priority:
 *  1) User manualSeries overrides & cannotLink constraints
 *  2) Designated Media Library Areas (e.g., '홈/.../애니메이션' -> each direct child directory is registered as a Series)
 *  3) Folder hierarchy (parent folder containing multiple video child folders)
 *  4) Exact base name match after stripping season/special markers (-속-, -완-, 시즌N, 극장판, OVA)
 *  5) Fuzzy / Template similarity >= 0.78 (auto-grouped immediately, flagged as auto-grouped so user can adjust)
 *  6) Standalone series (single folder)
 */
export const classifyMediaSeries = ({
  folderUnits = [],
  folderById = new Map(),
  seriesOverrides = {},
  mediaAreas = [],
} = {}) => {
  const manualSeriesList = Array.isArray(seriesOverrides?.manualSeries) ? seriesOverrides.manualSeries : [];
  const cannotLinkPairs = new Set(
    (Array.isArray(seriesOverrides?.cannotLink) ? seriesOverrides.cannotLink : []).map(
      (pair) => makePairKey(pair?.[0], pair?.[1]),
    ),
  );
  const autoClassifyEnabled = seriesOverrides?.autoClassifyEnabled !== false;
  const validAreas = (Array.isArray(mediaAreas) ? mediaAreas : []).filter(
    (area) => area && area.folderId != null && !String(area.folderId).startsWith("__"),
  );
  const areaById = new Map(validAreas.map((area) => [String(area.folderId), area]));

  const enrichedUnits = folderUnits.map((unit) => {
    const analyzed = analyzeFolderTitle(unit.name);
    const episodes = sortEpisodesNaturally(
      (unit.videos || []).map((video) => {
        const parsedEp = parseEpisodeFromFilename(video.name || video.displayTitle || "");
        return {
          ...video,
          episodeNumber: parsedEp.episodeNumber,
          isSpecialEpisode: parsedEp.isSpecialEpisode,
          episodeBadge: parsedEp.episodeBadge,
        };
      }),
    );
    const timestamps = episodes
      .map((e) => e.uploadedAtMs || e.lastModifiedMs || 0)
      .filter((v) => v > 0);
    const earliestUploadMs = timestamps.length > 0 ? Math.min(...timestamps) : 0;

    return {
      ...unit,
      folderId: String(unit.folderId),
      analyzed,
      episodes,
      earliestUploadMs,
    };
  });

  const unitById = new Map(enrichedUnits.map((u) => [String(u.folderId), u]));
  const assignedFolderIds = new Set();
  const resolvedSeries = [];

  // [Step 1] Apply user manualSeries first (highest priority)
  for (const manual of manualSeriesList) {
    if (!manual || !Array.isArray(manual.folderIds)) continue;
    const validUnits = manual.folderIds
      .map((id) => unitById.get(String(id)))
      .filter(Boolean);
    if (!validUnits.length) continue;

    validUnits.forEach((u) => assignedFolderIds.add(String(u.folderId)));
    const firstAreaMembership = resolveAreaMembership(validUnits[0], areaById, folderById);
    const orderedSeasons = orderAndLabelSeasons(
      validUnits,
      manual.seasonLabels || {},
      manual.folderIds.map((id) => String(id)),
    );

    resolvedSeries.push(
      buildSeriesObject({
        id: manual.id || `manual_${orderedSeasons[0].folderId}`,
        title: manual.title || orderedSeasons[0].analyzed.cleanBaseTitle || orderedSeasons[0].name,
        titleLocked: Boolean(manual.titleLocked),
        source: "manual",
        confidence: 1.0,
        matchReason: "사용자 지정 시리즈",
        seasons: orderedSeasons,
        coverFileId: manual.coverFileId || null,
        areaFolderId: firstAreaMembership ? String(firstAreaMembership.area.folderId) : null,
        areaName: firstAreaMembership
          ? (firstAreaMembership.area.name || folderById.get(String(firstAreaMembership.area.folderId))?.name || "")
          : "",
      }),
    );
  }

  // [Step 2] Designated Media Library Areas (Directory-scoped automatic series registration)
  const unitsByArea = new Map();
  if (areaById.size > 0) {
    for (const unit of enrichedUnits) {
      if (assignedFolderIds.has(String(unit.folderId))) continue;
      const membership = resolveAreaMembership(unit, areaById, folderById);
      if (!membership) continue;
      const areaKey = String(membership.area.folderId);
      if (!unitsByArea.has(areaKey)) {
        unitsByArea.set(areaKey, {
          area: membership.area,
          directRootUnits: [],
          childBuckets: new Map(),
        });
      }
      const bucket = unitsByArea.get(areaKey);
      if (!membership.directChild) {
        bucket.directRootUnits.push(unit);
      } else {
        const childId = String(membership.directChild.id);
        if (!bucket.childBuckets.has(childId)) {
          bucket.childBuckets.set(childId, {
            directChild: membership.directChild,
            units: [],
          });
        }
        bucket.childBuckets.get(childId).units.push(unit);
      }
    }

    for (const [areaKey, group] of unitsByArea.entries()) {
      const liveAreaFolder = folderById.get(areaKey);
      const areaDisplayName = group.area?.name || liveAreaFolder?.name || "지정 미디어 영역";
      const groupingMode = group.area?.groupingMode || "children-as-series";

      // Sub-clusters inside each direct child folder (e.g. /간츠, /내청코, /바케모노가타리)
      const areaChildClusters = [];
      for (const [, childGroup] of group.childBuckets.entries()) {
        const splitGroups = splitGroupByCannotLink(childGroup.units, cannotLinkPairs);
        for (const subUnits of splitGroups) {
          subUnits.forEach((u) => assignedFolderIds.add(String(u.folderId)));
          areaChildClusters.push({
            directChild: childGroup.directChild,
            units: subUnits,
            representativeAnalyzed: analyzeFolderTitle(childGroup.directChild.name || subUnits[0].name),
          });
        }
      }

      // Optionally also cluster depth-1 siblings within the same area if configured
      if (groupingMode === "children-plus-similarity" && autoClassifyEnabled && areaChildClusters.length > 1) {
        let merged = true;
        while (merged && areaChildClusters.length > 1) {
          merged = false;
          let bestPair = null;
          let bestScore = -1;
          for (let i = 0; i < areaChildClusters.length; i += 1) {
            for (let j = i + 1; j < areaChildClusters.length; j += 1) {
              const cA = areaChildClusters[i];
              const cB = areaChildClusters[j];
              const blocked = cA.units.some((uA) =>
                cB.units.some((uB) => cannotLinkPairs.has(makePairKey(uA.folderId, uB.folderId))),
              );
              if (blocked) continue;
              const sim = computeFolderPairSimilarity(
                { name: cA.directChild.name, analyzed: cA.representativeAnalyzed, parentId: areaKey },
                { name: cB.directChild.name, analyzed: cB.representativeAnalyzed, parentId: areaKey },
              );
              if (sim.score >= 0.8 && sim.score > bestScore) {
                bestScore = sim.score;
                bestPair = [i, j];
              }
            }
          }
          if (bestPair) {
            const [idxA, idxB] = bestPair;
            areaChildClusters[idxA].units.push(...areaChildClusters[idxB].units);
            areaChildClusters[idxA].mergedSiblings = true;
            areaChildClusters.splice(idxB, 1);
            merged = true;
          }
        }
      }

      for (const cluster of areaChildClusters) {
        const rootChildId = String(cluster.directChild.id);
        const rootChildTitle = cluster.mergedSiblings
          ? (cluster.representativeAnalyzed?.cleanBaseTitle || cluster.directChild.name)
          : (cluster.directChild.name || cluster.units[0]?.name);
        const orderedSeasons = orderAndLabelSeasons(cluster.units, {}, [], {
          rootChildFolderId: cluster.mergedSiblings ? null : rootChildId,
          rootChildTitle,
        });
        const stableKey = orderedSeasons.map((s) => s.folderId).sort().join("_");
        resolvedSeries.push(
          buildSeriesObject({
            id: `area_${areaKey}_${rootChildId}_${stableKey}`,
            title: rootChildTitle,
            titleLocked: false,
            source: "area",
            confidence: 1.0,
            matchReason: cluster.mergedSiblings
              ? `'${areaDisplayName}' 영역 하위 폴더 · 유사 시즌 통합`
              : `'${areaDisplayName}' 영역 하위 폴더('${cluster.directChild.name}') 기준 구분`,
            seasons: orderedSeasons,
            areaFolderId: areaKey,
            areaName: areaDisplayName,
            rootChildFolderId: rootChildId,
          }),
        );
      }

      // Direct loose video files placed right under the Area root directory
      if (group.directRootUnits.length > 0) {
        group.directRootUnits.forEach((u) => assignedFolderIds.add(String(u.folderId)));
        const orderedDirect = orderAndLabelSeasons(group.directRootUnits);
        resolvedSeries.push(
          buildSeriesObject({
            id: `area_${areaKey}_root`,
            title: group.childBuckets.size > 0 ? `${areaDisplayName} · 직속 영상` : areaDisplayName,
            titleLocked: false,
            source: "area",
            confidence: 1.0,
            matchReason: `'${areaDisplayName}' 영역 직속 폴더 영상`,
            seasons: orderedDirect,
            areaFolderId: areaKey,
            areaName: areaDisplayName,
          }),
        );
      }
    }
  }

  const remainingUnits = enrichedUnits.filter((u) => !assignedFolderIds.has(String(u.folderId)));

  if (!autoClassifyEnabled) {
    for (const unit of remainingUnits) {
      const ordered = orderAndLabelSeasons([unit]);
      resolvedSeries.push(
        buildSeriesObject({
          id: `single_${unit.folderId}`,
          title: unit.analyzed.cleanBaseTitle || unit.name,
          titleLocked: false,
          source: "single",
          confidence: 1.0,
          matchReason: "폴더 개별 표시",
          seasons: ordered,
        }),
      );
    }
    sortResolvedSeries(resolvedSeries);
    return { series: resolvedSeries, reviewCandidates: [] };
  }

  // [Step 3, 4, 5] Average-Linkage Clustering with cannotLink constraints (outside areas)
  const clusters = remainingUnits.map((u) => ({
    units: [u],
    source: "single",
    confidence: 1.0,
    matchReason: "단독 폴더",
    parentFolderTitle: null,
  }));

  const pairScoreCache = new Map();
  const getPairInfo = (uA, uB) => {
    const key = makePairKey(uA.folderId, uB.folderId);
    if (pairScoreCache.has(key)) return pairScoreCache.get(key);

    if (cannotLinkPairs.has(key)) {
      const blocked = { score: 0, matchType: "blocked" };
      pairScoreCache.set(key, blocked);
      return blocked;
    }

    // Check hierarchical structure: same non-root parent folder AND child names look like season folders
    if (
      uA.parentId != null &&
      uB.parentId != null &&
      String(uA.parentId) === String(uB.parentId)
    ) {
      const parentFolder = folderById.get(String(uA.parentId));
      const bothHaveSeasonMarkers =
        (uA.analyzed.seasonKind !== "normal" || uA.analyzed.isSpecial) &&
        (uB.analyzed.seasonKind !== "normal" || uB.analyzed.isSpecial);
      if (parentFolder && bothHaveSeasonMarkers) {
        const structInfo = {
          score: 0.96,
          matchType: "structure",
          parentTitle: parentFolder.name,
        };
        pairScoreCache.set(key, structInfo);
        return structInfo;
      }
    }

    const sim = computeFolderPairSimilarity(uA, uB);
    pairScoreCache.set(key, sim);
    return sim;
  };

  // Iteratively merge the highest scoring pair of clusters if average linkage >= 0.76
  const AUTO_MERGE_THRESHOLD = 0.78;
  const MIN_AVERAGE_LINKAGE = 0.74;

  let merged = true;
  while (merged && clusters.length > 1) {
    merged = false;
    let bestPair = null;
    let bestScore = -1;
    let bestMeta = null;

    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        const cA = clusters[i];
        const cB = clusters[j];

        // Check if any pair between cA and cB is in cannotLink
        let hasCannotLink = false;
        let totalScore = 0;
        let maxPairScore = 0;
        let dominantMeta = null;
        let pairCount = 0;

        for (const uA of cA.units) {
          for (const uB of cB.units) {
            const key = makePairKey(uA.folderId, uB.folderId);
            if (cannotLinkPairs.has(key)) {
              hasCannotLink = true;
              break;
            }
            const info = getPairInfo(uA, uB);
            totalScore += info.score;
            pairCount += 1;
            if (info.score > maxPairScore) {
              maxPairScore = info.score;
              dominantMeta = info;
            }
          }
          if (hasCannotLink) break;
        }

        if (hasCannotLink || pairCount === 0) continue;
        const avgScore = totalScore / pairCount;

        if (maxPairScore >= AUTO_MERGE_THRESHOLD && avgScore >= MIN_AVERAGE_LINKAGE) {
          if (avgScore > bestScore) {
            bestScore = avgScore;
            bestPair = [i, j];
            bestMeta = dominantMeta;
          }
        }
      }
    }

    if (bestPair) {
      const [idxA, idxB] = bestPair;
      const target = clusters[idxA];
      const source = clusters[idxB];
      target.units.push(...source.units);
      target.confidence = Number(bestScore.toFixed(2));
      if (bestMeta?.matchType === "structure") {
        target.source = "structure";
        target.parentFolderTitle = bestMeta.parentTitle;
        target.matchReason = `상위 폴더('${bestMeta.parentTitle}') 기준 자동 묶음`;
      } else if (bestMeta?.matchType === "exact-base") {
        target.source = "name";
        target.matchReason = "시즌·특별편 표기 일치 자동 묶음";
      } else if (bestMeta?.matchType === "template") {
        target.source = "fuzzy";
        target.matchReason = "공통 제목 패턴(접두·접미) 자동 묶음";
      } else {
        target.source = "fuzzy";
        target.matchReason = "유사 제목 자동 묶음";
      }
      clusters.splice(idxB, 1);
      merged = true;
    }
  }

  const reviewCandidates = [];

  for (const cluster of clusters) {
    const orderedSeasons = orderAndLabelSeasons(cluster.units);
    const primarySeason = orderedSeasons.find((s) => !s.isSpecial) || orderedSeasons[0];

    let seriesTitle = primarySeason.analyzed.cleanBaseTitle || primarySeason.name;
    if (cluster.parentFolderTitle) {
      seriesTitle = cluster.parentFolderTitle;
    }

    const stableKey = orderedSeasons
      .map((s) => s.folderId)
      .sort()
      .join("_");

    const seriesObj = buildSeriesObject({
      id: `auto_${stableKey}`,
      title: seriesTitle,
      titleLocked: false,
      source: orderedSeasons.length > 1 ? cluster.source : "single",
      confidence: cluster.confidence,
      matchReason: orderedSeasons.length > 1 ? cluster.matchReason : "단독 작품",
      seasons: orderedSeasons,
    });

    resolvedSeries.push(seriesObj);
    if (orderedSeasons.length > 1 && cluster.source !== "manual") {
      reviewCandidates.push(seriesObj);
    }
  }

  sortResolvedSeries(resolvedSeries);

  return {
    series: resolvedSeries,
    reviewCandidates,
  };
};

function buildSeriesObject({
  id,
  title,
  titleLocked,
  source,
  confidence,
  matchReason,
  seasons,
  coverFileId = null,
  areaFolderId = null,
  areaName = "",
  rootChildFolderId = null,
}) {
  const allEpisodes = [];
  const regularSeasons = [];
  const specialSeasons = [];

  for (const season of seasons) {
    if (season.isSpecial) {
      specialSeasons.push(season);
    } else {
      regularSeasons.push(season);
    }
    for (const ep of season.episodes || []) {
      allEpisodes.push({
        ...ep,
        seasonFolderId: season.folderId,
        seasonLabel: season.seasonLabel,
        isSpecialSeason: season.isSpecial,
      });
    }
  }

  const totalDurationSeconds = allEpisodes.reduce(
    (sum, ep) => sum + (Number(ep.durationSeconds) || 0),
    0,
  );
  const completedCount = allEpisodes.filter((ep) => ep.completed).length;
  const watchingEpisodes = allEpisodes.filter((ep) => ep.watchState === "watching");
  const overallProgressPercent = allEpisodes.length > 0
    ? Math.round(
        allEpisodes.reduce((sum, ep) => sum + (ep.completed ? 100 : Number(ep.progressPercent) || 0), 0) /
          allEpisodes.length,
      )
    : 0;

  // Next episode to watch: either most recently watching episode, or first unwatched episode
  const nextEpisode =
    [...watchingEpisodes].sort((a, b) => (b.lastWatchedAtMs || 0) - (a.lastWatchedAtMs || 0))[0] ||
    allEpisodes.find((ep) => !ep.completed) ||
    allEpisodes[0] ||
    null;

  const explicitCover = coverFileId
    ? allEpisodes.find((ep) => String(ep.id) === String(coverFileId))
    : null;
  const coverEpisode = explicitCover || nextEpisode || allEpisodes[0] || null;

  const latestUploadMs = allEpisodes.reduce(
    (max, ep) => Math.max(max, ep.uploadedAtMs || ep.lastModifiedMs || 0),
    0,
  );

  return {
    id,
    title,
    titleLocked,
    source, // 'manual' | 'area' | 'structure' | 'name' | 'fuzzy' | 'single'
    confidence,
    matchReason,
    seasons,
    regularSeasons,
    specialSeasons,
    seasonCount: regularSeasons.length || 1,
    specialCount: specialSeasons.length,
    totalFolderCount: seasons.length,
    allEpisodes,
    episodeCount: allEpisodes.length,
    totalDurationSeconds,
    completedCount,
    watchingCount: watchingEpisodes.length,
    overallProgressPercent,
    nextEpisode,
    coverEpisode,
    coverFileId: coverEpisode?.id || null,
    latestUploadMs,
    folderIds: seasons.map((s) => String(s.folderId)),
    areaFolderId: areaFolderId ? String(areaFolderId) : null,
    areaName: areaName ? String(areaName) : "",
    rootChildFolderId: rootChildFolderId ? String(rootChildFolderId) : null,
  };
}
