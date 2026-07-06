export const SHARE_AUDIT_ACTION_LABELS = Object.freeze({
  CREATED: "\uACF5\uC720 \uC0DD\uC131",
  UPDATED: "\uACF5\uC720 \uBCC0\uACBD",
  ACCEPTED: "\uACF5\uC720 \uC218\uB77D",
  REJECTED: "\uACF5\uC720 \uAC70\uC808",
  CANCELED: "\uACF5\uC720 \uCDE8\uC18C",
  CANCELED_ALL: "\uC804\uCCB4 \uACF5\uC720 \uCDE8\uC18C",
  DOWNLOAD_LINK_CREATED: "\uB2E4\uC6B4\uB85C\uB4DC \uB9C1\uD06C \uBC1C\uAE09",
  DOWNLOADED: "\uACF5\uC720 \uD30C\uC77C \uB2E4\uC6B4\uB85C\uB4DC",
  SAVED_TO_DRIVE: "\uB0B4 \uB4DC\uB77C\uC774\uBE0C\uC5D0 \uC800\uC7A5",
})

export const formatAdminDateTime = (value) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export const formatShareAuditAction = (action) => SHARE_AUDIT_ACTION_LABELS[action] || action || "-"

export const formatShareAuditPolicy = (item) => {
  const labels = []
  if (item?.expiresAt) labels.push(`\uB9CC\uB8CC ${formatAdminDateTime(item.expiresAt)}`)
  if (item?.downloadLimit) labels.push(`\uB2E4\uC6B4\uB85C\uB4DC ${Number(item.downloadCount || 0)}/${item.downloadLimit}`)
  return labels.join(" | ") || "-"
}

export const statusBadgeClass = (status) => {
  switch (status) {
    case "ACTIVE":
      return "admin-badge admin-badge--active"
    case "SUSPENDED":
      return "admin-badge admin-badge--suspended"
    case "BANNED":
      return "admin-badge admin-badge--banned"
    default:
      return "admin-badge"
  }
}