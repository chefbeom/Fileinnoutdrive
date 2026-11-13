import { ref } from "vue";

const vaultTokenRef = ref("");
const folderTokensRef = ref({});

export const setSecretVaultToken = (token = "") => {
  vaultTokenRef.value = typeof token === "string" ? token.trim() : "";
};

export const getSecretVaultToken = () => vaultTokenRef.value;

export const setSecretFolderToken = (folderId, token) => {
  if (folderId == null || !token) {
    return;
  }
  folderTokensRef.value = {
    ...folderTokensRef.value,
    [String(folderId)]: String(token).trim(),
  };
};

export const clearSecretFolderTokens = () => {
  folderTokensRef.value = {};
};

export const getSecretFolderTokensHeader = () => {
  const tokens = Object.values(folderTokensRef.value).filter(Boolean);
  return tokens.join(",");
};

export const clearAllSecretTokens = () => {
  vaultTokenRef.value = "";
  folderTokensRef.value = {};
};
