export const formatRelativeTime = (dateValue, fallback = "방금 전") => {
  if (!dateValue) return fallback;

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return fallback;

  const diff = Date.now() - parsed.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  return `${Math.floor(hours / 24)}일 전`;
};
