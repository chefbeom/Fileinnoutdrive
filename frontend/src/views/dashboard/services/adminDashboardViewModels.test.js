import { describe, expect, it } from "vitest"

import {
  buildPaymentMixCards,
  buildPlanRows,
  buildPlanSummaryCards,
  buildShareAuditRows,
  buildSessionRows,
  buildStorageBreakdownVisuals,
  buildStorageUsers,
  buildStorageVisualSummary,
  buildTopStorageUsers,
  buildTransferVisualGroups,
  filterAdminUsers,
} from "./adminDashboardViewModels.js"

const formatBytes = (bytes) => `${Number(bytes || 0)}B`
const colors = ["red", "blue", "green"]

describe("adminDashboardViewModels", () => {
  it("filters users by status/query and sorts by usage", () => {
    const users = [
      { id: "beta@example.com", name: "Beta", accountStatus: "ACTIVE", usedBytes: 20, planLabel: "Pro" },
      { id: "alpha@example.com", name: "Alpha", accountStatus: "SUSPENDED", usedBytes: 80, planLabel: "Free" },
      { id: "gamma@example.com", name: "Gamma", accountStatus: "ACTIVE", usedBytes: 50, role: "USER" },
    ]

    expect(filterAdminUsers(users, "", "ACTIVE").map((user) => user.id)).toEqual([
      "gamma@example.com",
      "beta@example.com",
    ])
    expect(filterAdminUsers(users, "free", "ALL").map((user) => user.id)).toEqual(["alpha@example.com"])
  })

  it("builds storage visual summary percentages and labels", () => {
    const summary = buildStorageVisualSummary({
      providerUsagePercent: 55.4,
      providerCapacityBytes: 1000,
      providerUsedBytes: 554,
      providerRemainingBytes: 446,
      allocatedUserQuotaBytes: 500,
      totalIngressBytes: 75,
      totalEgressBytes: 25,
      completedIngressBytes: 50,
      canceledIngressBytes: 25,
    }, formatBytes)

    expect(summary.providerUsagePercent).toBe(55.4)
    expect(summary.allocationPercent).toBe(50)
    expect(summary.ingressPercent).toBe(75)
    expect(summary.egressPercent).toBe(25)
    expect(summary.completedIngressPercent).toBeCloseTo(66.67)
    expect(summary.providerCapacityLabel).toBe("1000B")
    expect(buildStorageVisualSummary(null, formatBytes)).toBeNull()
  })

  it("builds storage users and top usage rows", () => {
    const storageUsers = buildStorageUsers([
      { id: "a", quotaBytes: 100, currentStoredBytes: 40, totalIngressBytes: 7, completedIngressBytes: 5, canceledIngressBytes: 2, totalEgressBytes: 3 },
      { id: "b", quotaBytes: 100, currentStoredBytes: 90, totalIngressBytes: 8, completedIngressBytes: 8, canceledIngressBytes: 0, totalEgressBytes: 2 },
    ], formatBytes)

    expect(storageUsers[0]).toMatchObject({ quotaLabel: "100B", storedLabel: "40B", egressLabel: "3B" })

    const topUsers = buildTopStorageUsers(storageUsers, formatBytes, colors)
    expect(topUsers.map((user) => user.id)).toEqual(["b", "a"])
    expect(topUsers[0].sharePercent).toBe(100)
    expect(topUsers[0].combinedTrafficLabel).toBe("10B")
    expect(topUsers[0].color).toBe("red")
  })

  it("builds storage and transfer visual groups", () => {
    const breakdown = buildStorageBreakdownVisuals([
      { type: "image", storedBytes: 20 },
      { type: "video", storedBytes: 80 },
    ], colors)
    expect(breakdown[0]).toMatchObject({ sharePercent: 20, barWidth: 20, color: "red" })
    expect(breakdown[1]).toMatchObject({ sharePercent: 80, barWidth: 80, color: "blue" })

    const groups = buildTransferVisualGroups([
      { direction: "IN", bytes: 30, label: "small" },
      { direction: "IN", bytes: 70, label: "large" },
      { direction: "OUT", bytes: 10, label: "out" },
    ], formatBytes, colors)

    expect(groups[0].direction).toBe("IN")
    expect(groups[0].totalLabel).toBe("100B")
    expect(groups[0].items.map((item) => item.label)).toEqual(["large", "small"])
    expect(groups[1].direction).toBe("OUT")
  })


  it("builds plan summary, payment mix, and plan rows", () => {
    const plans = [
      { planCode: "ADMIN", planLabel: "Admin", userCount: 1, userPercent: 5, usagePercent: 0, usedBytes: 0, quotaBytes: 0 },
      { planCode: "FREE", planLabel: "Free", userCount: 3, userPercent: 60, usagePercent: 20, usedBytes: 200, quotaBytes: 1000 },
      { planCode: "PRO", planLabel: "Pro", userCount: 2, userPercent: 40, usagePercent: 50, usedBytes: 500, quotaBytes: 1000 },
    ]

    expect(buildPlanSummaryCards(plans)).toEqual([
      { label: "분석 대상 사용자", value: "5명" },
      { label: "무료 플랜 사용자", value: "3명" },
      { label: "유료 플랜 사용자", value: "2명" },
      { label: "결제 전환 비중", value: "40.00%" },
      { label: "유료 플랜 사용량", value: "500 B" },
      { label: "유료 플랜 할당량", value: "1000 B" },
    ])

    expect(buildPaymentMixCards(plans)).toEqual([
      { label: "무료 사용자 비중", subLabel: "3명", usageLabel: "60.00%", detail: "200 B" },
      { label: "유료 사용자 비중", subLabel: "2명", usageLabel: "40.00%", detail: "500 B" },
    ])

    expect(buildPlanRows(plans).map((plan) => ({
      planCode: plan.planCode,
      planTypeLabel: plan.planTypeLabel,
      userPercentLabel: plan.userPercentLabel,
      usagePercentLabel: plan.usagePercentLabel,
      usedBytesLabel: plan.usedBytesLabel,
      quotaBytesLabel: plan.quotaBytesLabel,
    }))).toEqual([
      {
        planCode: "FREE",
        planTypeLabel: "무료",
        userPercentLabel: "60.00%",
        usagePercentLabel: "20.00%",
        usedBytesLabel: "200 B",
        quotaBytesLabel: "1000 B",
      },
      {
        planCode: "PRO",
        planTypeLabel: "유료",
        userPercentLabel: "40.00%",
        usagePercentLabel: "50.00%",
        usedBytesLabel: "500 B",
        quotaBytesLabel: "1000 B",
      },
    ])
  })

  it("maps share audit and session rows", () => {
    const shareRows = buildShareAuditRows([{
      action: "CREATED",
      actorIdx: 1,
      ownerEmail: "owner@example.com",
      recipientName: "Recipient",
      fileIdx: 9,
      downloadCount: 1,
      downloadLimit: 3,
    }])

    expect(shareRows[0]).toMatchObject({
      actionLabel: "공유 생성",
      actorLabel: "#1",
      ownerLabel: "owner@example.com",
      recipientLabel: "Recipient",
      fileLabel: "#9",
    })
    expect(shareRows[0].policyLabel).toContain("다운로드 1/3")

    const sessionRows = buildSessionRows([{ email: "user@example.com", expired: false, enabled: true }])
    expect(sessionRows[0]).toMatchObject({
      userLabel: "user@example.com",
      statusLabel: "활성",
      enabledLabel: "사용",
    })
  })
})