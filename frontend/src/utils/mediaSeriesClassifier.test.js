import { describe, expect, it } from "vitest";
import {
  analyzeFolderTitle,
  classifyMediaSeries,
  computeFolderPairSimilarity,
  parseEpisodeFromFilename,
} from "./mediaSeriesClassifier.js";

describe("mediaSeriesClassifier", () => {
  it("groups Oregairu (-속-, -완-, 극장판/OVA) into a single ordered series", () => {
    const folderUnits = [
      {
        folderId: "10",
        name: "역시내 청춘러브코메디는 잘못됐다. 시즌1",
        parentId: null,
        videos: [{ id: 1001, name: "Oregairu S01E01.mp4" }],
      },
      {
        folderId: "11",
        name: "역시내 청춘러브코메디는 잘못됐다.-속-",
        parentId: null,
        videos: [{ id: 1002, name: "Oregairu S02E01.mp4" }],
      },
      {
        folderId: "12",
        name: "역시내 청춘러브코메디는 잘못됐다.-완-",
        parentId: null,
        videos: [{ id: 1003, name: "Oregairu S03E01.mp4" }],
      },
      {
        folderId: "13",
        name: "역시내 청춘러브코메디는 잘못됐다. OVA",
        parentId: null,
        videos: [{ id: 1004, name: "Oregairu OVA.mp4" }],
      },
    ];

    const { series } = classifyMediaSeries({ folderUnits });
    expect(series).toHaveLength(1);
    expect(series[0].seasons.map((s) => s.folderId)).toEqual(["10", "11", "12", "13"]);
    expect(series[0].regularSeasons).toHaveLength(3);
    expect(series[0].specialSeasons).toHaveLength(1);
    expect(series[0].seasons[1].seasonLabel).toContain("속");
    expect(series[0].seasons[2].seasonLabel).toContain("완");
    expect(series[0].seasons[3].isSpecial).toBe(true);
  });

  it("groups irregular subtitle series (청춘 돼지 시리즈) via prefix+suffix template matching", () => {
    const folderUnits = [
      {
        folderId: "21",
        name: "청춘 돼지는 바니걸 선배의 꿈을 꾸지 않는다",
        parentId: null,
        videos: [{ id: 2001, name: "01화.mp4", uploadedAtMs: 1000 }],
      },
      {
        folderId: "22",
        name: "청춘 돼지는 꿈꾸는 소녀의 꿈을 꾸지 않는다 (극장판)",
        parentId: null,
        videos: [{ id: 2002, name: "극장판.mp4", uploadedAtMs: 2000 }],
      },
      {
        folderId: "23",
        name: "청춘 돼지는 외출하는 여동생의 꿈을 꾸지 않는다",
        parentId: null,
        videos: [{ id: 2003, name: "극장판2.mp4", uploadedAtMs: 3000 }],
      },
      {
        folderId: "99",
        name: "청춘 기록",
        parentId: null,
        videos: [{ id: 9001, name: "청춘기록 01화.mp4", uploadedAtMs: 4000 }],
      },
    ];

    const { series } = classifyMediaSeries({ folderUnits });
    // '청춘 기록' must NOT be merged with '청춘 돼지는...'
    expect(series).toHaveLength(2);
    const bunnySeries = series.find((s) => s.folderIds.includes("21"));
    expect(bunnySeries).toBeTruthy();
    expect(bunnySeries.folderIds.sort()).toEqual(["21", "22", "23"]);
    expect(bunnySeries.specialSeasons).toHaveLength(1);
  });

  it("respects user cannotLink constraints and manualSeries overrides", () => {
    const folderUnits = [
      {
        folderId: "21",
        name: "청춘 돼지는 바니걸 선배의 꿈을 꾸지 않는다",
        parentId: null,
        videos: [{ id: 2001, name: "01화.mp4" }],
      },
      {
        folderId: "22",
        name: "청춘 돼지는 외출하는 여동생의 꿈을 꾸지 않는다",
        parentId: null,
        videos: [{ id: 2002, name: "01화.mp4" }],
      },
    ];

    // When user splits folder 22 from 21, cannotLink prevents auto-merging
    const { series } = classifyMediaSeries({
      folderUnits,
      seriesOverrides: {
        cannotLink: [["21", "22"]],
      },
    });
    expect(series).toHaveLength(2);

    // When user manually merges arbitrary folders with custom title & order
    const { series: manualResult } = classifyMediaSeries({
      folderUnits,
      seriesOverrides: {
        manualSeries: [
          {
            id: "ser_custom",
            title: "청춘 돼지 시리즈 전체 모음",
            titleLocked: true,
            folderIds: ["22", "21"],
            seasonLabels: { "22": "외출하는 여동생", "21": "바니걸 선배" },
          },
        ],
      },
    });
    expect(manualResult).toHaveLength(1);
    expect(manualResult[0].title).toBe("청춘 돼지 시리즈 전체 모음");
    expect(manualResult[0].seasons.map((s) => s.folderId)).toEqual(["22", "21"]);
    expect(manualResult[0].seasons[0].seasonLabel).toBe("외출하는 여동생");
  });

  it("parses episode numbers and special badges accurately", () => {
    expect(parseEpisodeFromFilename("[Ohys-Raws] Oregairu - 07 (BD 1920x1080 x264).mp4").episodeNumber).toBe(7);
    expect(parseEpisodeFromFilename("역시 내 청춘 제12화.mkv").episodeNumber).toBe(12);
    expect(parseEpisodeFromFilename("Show.S02E05.1080p.mp4").episodeNumber).toBe(5);
    expect(parseEpisodeFromFilename("청춘 돼지 극장판.mp4").isSpecialEpisode).toBe(true);
    expect(analyzeFolderTitle("하이큐!! 2기 [1080p]").seasonNumberHint).toBe(2);
  });

  it("groups directory-scoped media areas by immediate child folders while rolling up nested arcs", () => {
    const folderById = new Map([
      ["1", { id: "1", name: "홈", parentId: null }],
      ["2", { id: "2", name: "저장한내용", parentId: "1" }],
      ["3", { id: "3", name: "엔터", parentId: "2" }],
      ["4", { id: "4", name: "비디오들", parentId: "3" }],
      ["5", { id: "5", name: "애니메이션", parentId: "4" }],
      ["10", { id: "10", name: "간츠", parentId: "5" }],
      ["20", { id: "20", name: "내청코", parentId: "5" }],
      ["21", { id: "21", name: "역시내 청춘러브코메디는 잘못됐다. 시즌1", parentId: "20" }],
      ["22", { id: "22", name: "역시내 청춘러브코메디는 잘못됐다.-속-", parentId: "20" }],
      ["23", { id: "23", name: "역시내 청춘러브코메디는 잘못됐다.-완-", parentId: "20" }],
      ["30", { id: "30", name: "국민이산다", parentId: "5" }],
      ["40", { id: "40", name: "바케모노가타리", parentId: "5" }],
      ["41", { id: "41", name: "바케모노가타리", parentId: "40" }],
      ["42", { id: "42", name: "니세모노가타리", parentId: "40" }],
      ["43", { id: "43", name: "키즈모노가타리 극장판", parentId: "40" }],
    ]);

    const folderUnits = [
      { folderId: "10", name: "간츠", parentId: "5", videos: [{ id: 101, name: "01.mp4" }] },
      { folderId: "21", name: "역시내 청춘러브코메디는 잘못됐다. 시즌1", parentId: "20", videos: [{ id: 201, name: "01.mp4" }] },
      { folderId: "22", name: "역시내 청춘러브코메디는 잘못됐다.-속-", parentId: "20", videos: [{ id: 202, name: "01.mp4" }] },
      { folderId: "23", name: "역시내 청춘러브코메디는 잘못됐다.-완-", parentId: "20", videos: [{ id: 203, name: "01.mp4" }] },
      { folderId: "30", name: "국민이산다", parentId: "5", videos: [{ id: 301, name: "01.mp4" }] },
      { folderId: "41", name: "바케모노가타리", parentId: "40", videos: [{ id: 401, name: "01.mp4" }] },
      { folderId: "42", name: "니세모노가타리", parentId: "40", videos: [{ id: 402, name: "01.mp4" }] },
      { folderId: "43", name: "키즈모노가타리 극장판", parentId: "40", videos: [{ id: 403, name: "01.mp4" }] },
      // Loose video directly under Area root should remain standalone and not merge into children
      { folderId: "5", name: "애니메이션", parentId: "4", videos: [{ id: 501, name: "단편 OVA.mp4" }] },
    ];

    const { series } = classifyMediaSeries({
      folderUnits,
      folderById,
      mediaAreas: [{ folderId: "5", name: "애니메이션", groupingMode: "children-as-series" }],
    });

    expect(series).toHaveLength(5);

    const gantz = series.find((s) => s.title === "간츠");
    const oregairu = series.find((s) => s.title === "내청코");
    const kokumin = series.find((s) => s.title === "국민이산다");
    const monogatari = series.find((s) => s.title === "바케모노가타리");
    const areaRootStandalone = series.find((s) => s.folderIds.includes("5"));

    expect(gantz).toBeTruthy();
    expect(gantz.source).toBe("area");
    expect(gantz.areaFolderId).toBe("5");
    expect(gantz.areaName).toBe("애니메이션");
    expect(gantz.rootChildFolderId).toBe("10");

    expect(oregairu).toBeTruthy();
    expect(oregairu.seasons.map((s) => s.folderId)).toEqual(["21", "22", "23"]);
    expect(oregairu.regularSeasons).toHaveLength(3);

    expect(kokumin).toBeTruthy();
    expect(kokumin.episodeCount).toBe(1);

    expect(monogatari).toBeTruthy();
    expect(monogatari.seasons.map((s) => s.folderId)).toEqual(["41", "42", "43"]);
    expect(monogatari.seasons[1].seasonLabel).toBe("니세모노가타리");
    expect(monogatari.specialSeasons).toHaveLength(1);

    expect(areaRootStandalone).toBeTruthy();
    expect(areaRootStandalone.episodeCount).toBe(1);
  });

  it("applies deepest nested area, children-plus-similarity mode, and cannotLink splitting inside areas", () => {
    const folderById = new Map([
      ["4", { id: "4", name: "비디오들", parentId: null }],
      ["5", { id: "5", name: "애니메이션", parentId: "4" }],
      ["6", { id: "6", name: "독립영화", parentId: "4" }],
      ["51", { id: "51", name: "하이큐 1기", parentId: "5" }],
      ["52", { id: "52", name: "하이큐 2기", parentId: "5" }],
      ["53", { id: "53", name: "모노가타리", parentId: "5" }],
      ["54", { id: "54", name: "바케모노가타리", parentId: "53" }],
      ["55", { id: "55", name: "니세모노가타리", parentId: "53" }],
    ]);

    const folderUnits = [
      { folderId: "6", name: "독립영화", parentId: "4", videos: [{ id: 601, name: "movie.mp4" }] },
      { folderId: "51", name: "하이큐 1기", parentId: "5", videos: [{ id: 511, name: "01.mp4" }] },
      { folderId: "52", name: "하이큐 2기", parentId: "5", videos: [{ id: 521, name: "01.mp4" }] },
      { folderId: "54", name: "바케모노가타리", parentId: "53", videos: [{ id: 541, name: "01.mp4" }] },
      { folderId: "55", name: "니세모노가타리", parentId: "53", videos: [{ id: 551, name: "01.mp4" }] },
    ];

    const { series } = classifyMediaSeries({
      folderUnits,
      folderById,
      mediaAreas: [
        { folderId: "4", name: "비디오들", groupingMode: "children-as-series" },
        { folderId: "5", name: "애니메이션", groupingMode: "children-plus-similarity" },
      ],
      seriesOverrides: {
        cannotLink: [["54", "55"]],
      },
    });

    const indieFilm = series.find((s) => s.folderIds.includes("6"));
    expect(indieFilm?.areaFolderId).toBe("4");
    expect(indieFilm?.areaName).toBe("비디오들");

    // children-plus-similarity merges depth-1 siblings "하이큐 1기" and "하이큐 2기" under area 5
    const haikyu = series.find((s) => s.folderIds.includes("51"));
    expect(haikyu?.areaFolderId).toBe("5");
    expect(haikyu?.folderIds).toEqual(["51", "52"]);

    // cannotLink splits subfolder 55 from 54 even though both are inside child folder 53
    const bake = series.find((s) => s.folderIds.includes("54"));
    const nise = series.find((s) => s.folderIds.includes("55"));
    expect(bake?.folderIds).toEqual(["54"]);
    expect(nise?.folderIds).toEqual(["55"]);
  });
});
