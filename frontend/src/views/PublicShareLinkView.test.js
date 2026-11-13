import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPublicApi = vi.hoisted(() => ({
  fetchPublicShareLinkMeta: vi.fn(),
  issuePublicSharePresignedUrl: vi.fn(),
}));

const mockRouterPush = vi.hoisted(() => vi.fn());
const mockRouteState = vi.hoisted(() => ({
  params: { token: "shareTok123" },
}));

vi.mock("@/api/publicShareLinkApi.js", () => mockPublicApi);
vi.mock("vue-router", () => ({
  useRoute: () => mockRouteState,
  useRouter: () => ({ push: mockRouterPush }),
}));

import PublicShareLinkView from "./PublicShareLinkView.vue";

describe("PublicShareLinkView.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteState.params.token = "shareTok123";
  });

  it("loads public metadata and redeems one download slot via presigned URL", async () => {
    mockPublicApi.fetchPublicShareLinkMeta.mockResolvedValue({
      token: "shareTok123",
      fileName: "contract.pdf",
      fileFormat: "pdf",
      fileSize: 4096,
      ownerName: "홍길동",
      remainingSeconds: 1800,
      maxDownloads: 1,
      downloadCount: 0,
      remainingDownloads: 1,
      passwordProtected: false,
      downloadable: true,
      status: "ACTIVE",
    });
    mockPublicApi.issuePublicSharePresignedUrl.mockResolvedValue({
      presignedUrl: "https://minio.local/bucket/contract.pdf?X-Amz-Signature=ok",
      fileName: "contract.pdf",
      downloadCount: 1,
      remainingDownloads: 0,
      status: "EXHAUSTED",
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const wrapper = mount(PublicShareLinkView);
    await flushPromises();

    expect(wrapper.text()).toContain("contract.pdf");
    expect(wrapper.text()).toContain("홍길동");
    expect(wrapper.text()).toContain("1 / 1회");
    expect(wrapper.text()).toContain("30분 0초 남음");

    const downloadBtn = wrapper.findAll("button").find((btn) => btn.text().includes("파일 다운로드"));
    expect(downloadBtn).toBeDefined();

    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(mockPublicApi.issuePublicSharePresignedUrl).toHaveBeenCalledWith("shareTok123", "");
    expect(clickSpy).toHaveBeenCalled();
    expect(wrapper.text()).toContain("0 / 1회");
    expect(wrapper.text()).toContain("설정된 다운로드 허용 횟수를 모두 사용했습니다.");
    clickSpy.mockRestore();
  });

  it("requires password before redeeming protected share links", async () => {
    mockPublicApi.fetchPublicShareLinkMeta.mockResolvedValue({
      token: "pwTok",
      fileName: "secret-doc.zip",
      fileFormat: "zip",
      fileSize: 1024,
      remainingSeconds: 600,
      maxDownloads: 3,
      downloadCount: 0,
      remainingDownloads: 3,
      passwordProtected: true,
      downloadable: true,
      status: "ACTIVE",
    });
    mockPublicApi.issuePublicSharePresignedUrl.mockResolvedValue({
      presignedUrl: "https://minio.local/bucket/secret-doc.zip?X-Amz-Signature=pw",
      fileName: "secret-doc.zip",
      downloadCount: 1,
      remainingDownloads: 2,
      status: "ACTIVE",
    });

    mockRouteState.params.token = "pwTok";
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const wrapper = mount(PublicShareLinkView);
    await flushPromises();

    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(wrapper.text()).toContain("비밀번호를 입력해 주세요");
    expect(mockPublicApi.issuePublicSharePresignedUrl).not.toHaveBeenCalled();

    await wrapper.find('input[type="password"]').setValue("pw1234");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(mockPublicApi.issuePublicSharePresignedUrl).toHaveBeenCalledWith("pwTok", "pw1234");
    expect(wrapper.text()).toContain("2 / 3회");
    clickSpy.mockRestore();
  });

  it("renders error screen when token metadata lookup fails", async () => {
    mockPublicApi.fetchPublicShareLinkMeta.mockRejectedValue({
      response: { data: { message: "다운로드 공유 링크를 찾을 수 없습니다." } },
    });

    const wrapper = mount(PublicShareLinkView);
    await flushPromises();

    expect(wrapper.text()).toContain("링크를 열 수 없습니다");
    expect(wrapper.text()).toContain("다운로드 공유 링크를 찾을 수 없습니다.");
  });
});
