import { describe, expect, it } from "vitest"

import {
  formatAdminDateTime,
  formatShareAuditAction,
  formatShareAuditPolicy,
  statusBadgeClass,
} from "./adminDashboardFormat.js"

describe("adminDashboardFormat", () => {
  it("formats invalid or empty date values as placeholders", () => {
    expect(formatAdminDateTime()).toBe("-")
    expect(formatAdminDateTime("not-a-date")).toBe("-")
  })

  it("maps known share audit actions and preserves unknown actions", () => {
    expect(formatShareAuditAction("CREATED")).toBe("공유 생성")
    expect(formatShareAuditAction("DOWNLOADED")).toBe("공유 파일 다운로드")
    expect(formatShareAuditAction("CUSTOM_ACTION")).toBe("CUSTOM_ACTION")
    expect(formatShareAuditAction("")).toBe("-")
  })

  it("formats share audit policy labels", () => {
    const policy = formatShareAuditPolicy({
      expiresAt: "2026-07-05T12:00:00Z",
      downloadCount: 2,
      downloadLimit: 5,
    })

    expect(policy).toContain("만료")
    expect(policy).toContain("다운로드 2/5")
    expect(formatShareAuditPolicy({})).toBe("-")
  })

  it("returns account status badge classes", () => {
    expect(statusBadgeClass("ACTIVE")).toBe("admin-badge admin-badge--active")
    expect(statusBadgeClass("SUSPENDED")).toBe("admin-badge admin-badge--suspended")
    expect(statusBadgeClass("BANNED")).toBe("admin-badge admin-badge--banned")
    expect(statusBadgeClass("UNKNOWN")).toBe("admin-badge")
  })
})