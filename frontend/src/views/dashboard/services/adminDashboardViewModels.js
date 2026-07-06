import { VISUAL_COLORS } from "@/constants/adminDashboardOptions.js"
import { clampPercent, formatBytesAuto, formatPercent, percentValue } from "@/utils/storageFormat.js"

import {
  formatAdminDateTime,
  formatShareAuditAction,
  formatShareAuditPolicy,
} from "./adminDashboardFormat.js"

const rowsOf = (value) => (Array.isArray(value) ? value : [])
const bytesOf = (value) => Number(value || 0)
const fallbackFormatBytes = (bytes) => String(bytesOf(bytes))

const entityLabel = ({ email, name, idx } = {}) => email || name || (idx ? `#${idx}` : "-")

export const filterAdminUsers = (users, query = "", statusFilter = "ALL") => {
  const normalizedQuery = String(query || "").trim().toLowerCase()

  return rowsOf(users)
    .filter((user) => {
      if (statusFilter !== "ALL" && user.accountStatus !== statusFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return [user.id, user.name, user.role, user.planLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    })
    .sort((left, right) => Number(right.usedBytes || 0) - Number(left.usedBytes || 0))
}

export const buildStorageBreakdownCards = (items, formatBytesByUnit = fallbackFormatBytes) => (
  rowsOf(items).map((item) => ({
    ...item,
    formattedBytes: formatBytesByUnit(item.storedBytes),
  }))
)

export const buildTransferBreakdownRows = (items, formatBytesByUnit = fallbackFormatBytes) => (
  rowsOf(items).map((item) => ({
    ...item,
    formattedBytes: formatBytesByUnit(item.bytes),
  }))
)

export const buildStorageVisualSummary = (summary, formatBytesByUnit = fallbackFormatBytes) => {
  if (!summary) return null

  const ingressBytes = bytesOf(summary.totalIngressBytes)
  const egressBytes = bytesOf(summary.totalEgressBytes)
  const totalTrafficBytes = ingressBytes + egressBytes

  return {
    providerUsagePercent: clampPercent(summary.providerUsagePercent),
    allocationPercent: clampPercent(percentValue(summary.allocatedUserQuotaBytes, summary.providerCapacityBytes)),
    ingressPercent: clampPercent(percentValue(ingressBytes, totalTrafficBytes)),
    egressPercent: clampPercent(percentValue(egressBytes, totalTrafficBytes)),
    completedIngressPercent: clampPercent(percentValue(summary.completedIngressBytes, ingressBytes)),
    canceledIngressPercent: clampPercent(percentValue(summary.canceledIngressBytes, ingressBytes)),
    providerUsedLabel: formatBytesByUnit(summary.providerUsedBytes),
    providerRemainingLabel: formatBytesByUnit(summary.providerRemainingBytes),
    providerCapacityLabel: formatBytesByUnit(summary.providerCapacityBytes),
    allocatedQuotaLabel: formatBytesByUnit(summary.allocatedUserQuotaBytes),
    ingressLabel: formatBytesByUnit(ingressBytes),
    egressLabel: formatBytesByUnit(egressBytes),
    completedIngressLabel: formatBytesByUnit(summary.completedIngressBytes),
    canceledIngressLabel: formatBytesByUnit(summary.canceledIngressBytes),
  }
}

export const buildStorageBreakdownVisuals = (items, colors = VISUAL_COLORS) => {
  const rows = rowsOf(items)
  const totalBytes = rows.reduce((sum, item) => sum + bytesOf(item.storedBytes), 0)

  return rows.map((item, index) => ({
    ...item,
    sharePercent: clampPercent(percentValue(item.storedBytes, totalBytes)),
    barWidth: item.storedBytes > 0 ? Math.max(8, clampPercent(percentValue(item.storedBytes, totalBytes))) : 0,
    color: colors[index % colors.length],
  }))
}

export const buildTransferVisualGroups = (items, formatBytesByUnit = fallbackFormatBytes, colors = VISUAL_COLORS) => {
  const grouped = rowsOf(items).reduce((map, row) => {
    const directionKey = row.direction || "UNKNOWN"
    if (!map.has(directionKey)) {
      map.set(directionKey, [])
    }
    map.get(directionKey).push(row)
    return map
  }, new Map())

  return Array.from(grouped.entries()).map(([direction, rows], directionIndex) => {
    const totalBytes = rows.reduce((sum, row) => sum + bytesOf(row.bytes), 0)

    return {
      direction,
      totalBytes,
      totalLabel: formatBytesByUnit(totalBytes),
      items: rows
        .slice()
        .sort((left, right) => bytesOf(right.bytes) - bytesOf(left.bytes))
        .map((row, rowIndex) => ({
          ...row,
          sharePercent: clampPercent(percentValue(row.bytes, totalBytes)),
          barWidth: row.bytes > 0 ? Math.max(8, clampPercent(percentValue(row.bytes, totalBytes))) : 0,
          color: colors[(directionIndex + rowIndex) % colors.length],
        })),
    }
  })
}

export const buildStorageUsers = (users, formatBytesByUnit = fallbackFormatBytes) => (
  rowsOf(users).map((user) => ({
    ...user,
    quotaLabel: formatBytesByUnit(user.quotaBytes),
    storedLabel: formatBytesByUnit(user.currentStoredBytes),
    ingressLabel: formatBytesByUnit(user.totalIngressBytes),
    completedIngressLabel: formatBytesByUnit(user.completedIngressBytes),
    canceledIngressLabel: formatBytesByUnit(user.canceledIngressBytes),
    egressLabel: formatBytesByUnit(user.totalEgressBytes),
  }))
)

export const buildTopStorageUsers = (users, formatBytesByUnit = fallbackFormatBytes, colors = VISUAL_COLORS) => {
  const topUsers = rowsOf(users)
    .slice()
    .sort((left, right) => bytesOf(right.currentStoredBytes) - bytesOf(left.currentStoredBytes))
    .slice(0, 5)

  const maxStoredBytes = topUsers.reduce((maxValue, user) => (
    Math.max(maxValue, bytesOf(user.currentStoredBytes))
  ), 0)

  return topUsers.map((user, index) => ({
    ...user,
    sharePercent: clampPercent(percentValue(user.currentStoredBytes, maxStoredBytes)),
    barWidth: user.currentStoredBytes > 0 ? Math.max(8, clampPercent(percentValue(user.currentStoredBytes, maxStoredBytes))) : 0,
    combinedTrafficLabel: formatBytesByUnit(bytesOf(user.totalIngressBytes) + bytesOf(user.totalEgressBytes)),
    color: colors[index % colors.length],
  }))
}


export const buildPlanStats = (plans) => rowsOf(plans)
  .filter((plan) => plan.planCode !== "ADMIN")
  .sort((left, right) => Number(right.userCount || 0) - Number(left.userCount || 0))

export const buildPlanSummaryCards = (plans) => {
  const rows = buildPlanStats(plans)
  if (!rows.length) return []

  const totalUsers = rows.reduce((sum, plan) => sum + Number(plan.userCount || 0), 0)
  const paidUsers = rows
    .filter((plan) => plan.planCode !== "FREE")
    .reduce((sum, plan) => sum + Number(plan.userCount || 0), 0)
  const freeUsers = rows
    .filter((plan) => plan.planCode === "FREE")
    .reduce((sum, plan) => sum + Number(plan.userCount || 0), 0)
  const paidUsedBytes = rows
    .filter((plan) => plan.planCode !== "FREE")
    .reduce((sum, plan) => sum + Number(plan.usedBytes || 0), 0)
  const paidQuotaBytes = rows
    .filter((plan) => plan.planCode !== "FREE")
    .reduce((sum, plan) => sum + Number(plan.quotaBytes || 0), 0)

  return [
    { label: "분석 대상 사용자", value: `${totalUsers}명` },
    { label: "무료 플랜 사용자", value: `${freeUsers}명` },
    { label: "유료 플랜 사용자", value: `${paidUsers}명` },
    { label: "결제 전환 비중", value: formatPercent(percentValue(paidUsers, totalUsers)) },
    { label: "유료 플랜 사용량", value: formatBytesAuto(paidUsedBytes) },
    { label: "유료 플랜 할당량", value: formatBytesAuto(paidQuotaBytes) },
  ]
}

export const buildPaymentMixCards = (plans) => {
  const rows = buildPlanStats(plans)
  if (!rows.length) return []

  const totalUsers = rows.reduce((sum, plan) => sum + Number(plan.userCount || 0), 0)
  const freeUsers = rows
    .filter((plan) => plan.planCode === "FREE")
    .reduce((sum, plan) => sum + Number(plan.userCount || 0), 0)
  const paidUsers = rows
    .filter((plan) => plan.planCode !== "FREE")
    .reduce((sum, plan) => sum + Number(plan.userCount || 0), 0)
  const freeUsedBytes = rows
    .filter((plan) => plan.planCode === "FREE")
    .reduce((sum, plan) => sum + Number(plan.usedBytes || 0), 0)
  const paidUsedBytes = rows
    .filter((plan) => plan.planCode !== "FREE")
    .reduce((sum, plan) => sum + Number(plan.usedBytes || 0), 0)

  return [
    {
      label: "무료 사용자 비중",
      subLabel: `${freeUsers}명`,
      usageLabel: formatPercent(percentValue(freeUsers, totalUsers)),
      detail: formatBytesAuto(freeUsedBytes),
    },
    {
      label: "유료 사용자 비중",
      subLabel: `${paidUsers}명`,
      usageLabel: formatPercent(percentValue(paidUsers, totalUsers)),
      detail: formatBytesAuto(paidUsedBytes),
    },
  ]
}

export const buildPlanRows = (plans) => buildPlanStats(plans).map((plan) => ({
  ...plan,
  planTypeLabel: plan.planCode === "FREE" ? "무료" : "유료",
  userPercentLabel: formatPercent(plan.userPercent),
  usagePercentLabel: formatPercent(plan.usagePercent),
  usedBytesLabel: formatBytesAuto(plan.usedBytes),
  quotaBytesLabel: formatBytesAuto(plan.quotaBytes),
}))
export const buildShareAuditRows = (logs) => (
  rowsOf(logs).map((item) => ({
    ...item,
    actionLabel: formatShareAuditAction(item.action),
    createdAtLabel: formatAdminDateTime(item.createdAt),
    actorLabel: entityLabel({ email: item.actorEmail, name: item.actorName, idx: item.actorIdx }),
    ownerLabel: entityLabel({ email: item.ownerEmail, name: item.ownerName, idx: item.ownerIdx }),
    recipientLabel: entityLabel({ email: item.recipientEmail, name: item.recipientName, idx: item.recipientIdx }),
    fileLabel: item.fileName || (item.fileIdx ? `#${item.fileIdx}` : "-"),
    policyLabel: formatShareAuditPolicy(item),
  }))
)

export const buildSessionRows = (sessions) => (
  rowsOf(sessions).map((item) => ({
    ...item,
    userLabel: item.email || item.name || (item.userIdx ? `#${item.userIdx}` : "-"),
    createdAtLabel: formatAdminDateTime(item.createdAt),
    updatedAtLabel: formatAdminDateTime(item.updatedAt),
    expiresAtLabel: formatAdminDateTime(item.expiresAt),
    statusLabel: item.expired ? "\uB9CC\uB8CC" : "\uD65C\uC131",
    enabledLabel: item.enabled ? "\uC0AC\uC6A9" : "\uC911\uC9C0",
  }))
)