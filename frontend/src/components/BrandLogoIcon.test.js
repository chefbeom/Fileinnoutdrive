import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import BrandLogoIcon from "./BrandLogoIcon.vue";

describe("BrandLogoIcon.vue", () => {
  it("renders decorative blue FileInNOut brand icon by default", () => {
    const wrapper = mount(BrandLogoIcon);
    const img = wrapper.find("img");

    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toBe("/favicon.svg?v=4");
    expect(img.attributes("alt")).toBe("");
    expect(img.attributes("aria-hidden")).toBe("true");
  });

  it("exposes accessible alt text when provided", () => {
    const wrapper = mount(BrandLogoIcon, {
      props: {
        alt: "FileInNOut 로고",
      },
    });
    const img = wrapper.find("img");

    expect(img.attributes("alt")).toBe("FileInNOut 로고");
    expect(img.attributes("aria-hidden")).toBeUndefined();
  });
});
