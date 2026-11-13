import { api } from "@/plugins/axiosinterceptor.js";

const extractObjectResult = (responseData) => {
  if (!responseData) return null;
  if (responseData?.result?.body && typeof responseData.result.body === "object") {
    return responseData.result.body;
  }
  if (responseData?.result && typeof responseData.result === "object") {
    return responseData.result;
  }
  if (responseData?.data?.result && typeof responseData.data.result === "object") {
    return responseData.data.result;
  }
  if (typeof responseData === "object") {
    return responseData;
  }
  return null;
};

export async function fetchMediaLibraryState() {
  const response = await api.get("/media-library");
  const payload = extractObjectResult(response?.data);
  return {
    state: payload?.state && typeof payload.state === "object" ? payload.state : null,
    updatedAt: payload?.updatedAt || null,
  };
}

export async function saveMediaLibraryState(state = {}) {
  const response = await api.put("/media-library", {
    state: state && typeof state === "object" ? state : {},
  });
  const payload = extractObjectResult(response?.data);
  return {
    state: payload?.state && typeof payload.state === "object" ? payload.state : state,
    updatedAt: payload?.updatedAt || null,
  };
}

export async function fetchVaultMediaLibraryState() {
  const response = await api.get("/media-library/vault");
  const payload = extractObjectResult(response?.data);
  return {
    state: payload?.state && typeof payload.state === "object" ? payload.state : null,
    updatedAt: payload?.updatedAt || null,
  };
}

export async function saveVaultMediaLibraryState(state = {}) {
  const response = await api.put("/media-library/vault", {
    state: state && typeof state === "object" ? state : {},
  });
  const payload = extractObjectResult(response?.data);
  return {
    state: payload?.state && typeof payload.state === "object" ? payload.state : state,
    updatedAt: payload?.updatedAt || null,
  };
}
