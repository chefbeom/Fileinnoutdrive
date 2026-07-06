import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"

import AdminPlanSection from "./AdminPlanSection.vue"

describe("AdminPlanSection", () => {
  it("renders plan summary cards, mix cards, and plan table rows", () => {
    const wrapper = mount(AdminPlanSection, {
      props: {
        planSummaryCards: [
          { label: "분석 대상 사용자", value: "5명" },
          { label: "결제 전환 비중", value: "40.00%" },
        ],
        paymentMixCards: [
          { label: "무료 사용자 비중", subLabel: "3명", usageLabel: "60.00%", detail: "200 B" },
        ],
        planRows: [
          {
            planCode: "FREE",
            planLabel: "Free",
            planTypeLabel: "무료",
            userCount: 3,
            userPercentLabel: "60.00%",
            usagePercent: 20,
            usagePercentLabel: "20.00%",
            usedBytesLabel: "200 B",
            quotaBytesLabel: "1000 B",
          },
        ],
      },
    })

    expect(wrapper.text()).toContain("분석 대상 사용자")
    expect(wrapper.text()).toContain("플랜 비중")
    expect(wrapper.text()).toContain("무료 사용자 비중")
    expect(wrapper.text()).toContain("플랜 / 결제 비중 상세 표")
    expect(wrapper.find("tbody tr").text()).toContain("FREE")
    expect(wrapper.find("tbody tr").text()).toContain("무료")
    expect(wrapper.find(".admin-progress__bar").attributes("style")).toContain("width: 20%")
  })
})