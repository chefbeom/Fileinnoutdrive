import axios from "axios";
import { apiPath } from "@/utils/backendUrl.js";

const publicClient = axios.create({
  timeout: 15000,
});

const buildApiUrl = (path) => apiPath(path);

export const toAbsoluteUrl = (pathOrUrl) => {
  const value = String(pathOrUrl || "").trim();
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  const normalized = value.startsWith("/") ? value : `/${value}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${normalized}`;
  }
  return normalized;
};

export const buildPublicSharePageUrl = (token) => {
  const safeToken = encodeURIComponent(String(token || "").trim());
  return toAbsoluteUrl(`/share-link/${safeToken}`);
};

export const buildPublicDirectDownloadUrl = (token) => {
  const safeToken = encodeURIComponent(String(token || "").trim());
  return toAbsoluteUrl(buildApiUrl(`/file/share-links/public/${safeToken}/download`));
};

export const fetchPublicShareLinkMeta = async (token) => {
  const safeToken = encodeURIComponent(String(token || "").trim());
  const { data } = await publicClient.get(buildApiUrl(`/file/share-links/public/${safeToken}`));
  return data?.result;
};

export const issuePublicSharePresignedUrl = async (token, password = "") => {
  const safeToken = encodeURIComponent(String(token || "").trim());
  const payload = password ? { password } : {};
  const { data } = await publicClient.post(
    buildApiUrl(`/file/share-links/public/${safeToken}/download-url`),
    payload,
  );
  return data?.result;
};
