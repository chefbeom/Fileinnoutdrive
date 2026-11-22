import { onScopeDispose, ref } from "vue";
import { clearVaultThumbnails } from "@/utils/fileThumbnailCache.js";
import { defineStore } from "pinia";
import {
  changeVaultPin,
  configureHiddenFolder,
  createFolder,
  fetchHiddenFolderStatus,
  fetchVaultStatus,
  lockHiddenFolderSession,
  lockVaultSession,
  registerVaultPin,
  unlockHiddenFolder,
  unlockVaultWithPin,
} from "@/api/filesApi.js";
import {
  clearAllSecretTokens,
  clearSecretFolderTokens,
  getSecretVaultToken,
  setSecretFolderToken,
  setSecretVaultToken,
} from "@/stores/secretSessionHeaders.js";

const PIN_PATTERN = /^\d{4}$/;

const extractApiErrorMessage = (error, fallback = "요청 처리에 실패했습니다.") => {
  return (
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
};

export const useSecretFolderStore = defineStore("secretFolder", () => {
  const vaultMode = ref(false);
  const vaultTrashView = ref(false);
  const vaultUnlocked = ref(false);
  const vaultPinRegistered = ref(false);
  const showHiddenFolders = ref(false);
  const unlockedFolderIds = ref({});

  const pinModal = ref({
    open: false,
    mode: "vault-unlock", // 'vault-register' | 'vault-unlock' | 'vault-change' | 'folder-register' | 'folder-unlock'
    title: "",
    description: "",
    folderId: null,
    folderName: "",
    enterVaultOnSuccess: true,
    loading: false,
    errorMessage: "",
  });

  const folderDialog = ref({
    open: false,
    mode: "create", // 'create' | 'configure'
    parentId: null,
    folder: null,
    initialName: "",
    wasHidden: false,
    hidden: true,
    pinEnabled: false,
    hasExistingPin: false,
    loading: false,
    errorMessage: "",
  });

  let pendingPinResolve = null;
  let pendingDialogResolve = null;

  const isFolderUnlocked = (folderId) => {
    if (folderId == null) return false;
    return Boolean(unlockedFolderIds.value[String(folderId)]);
  };

  const resolvePendingPin = (value) => {
    const resolver = pendingPinResolve;
    pendingPinResolve = null;
    if (resolver) {
      resolver(Boolean(value));
    }
  };

  const resolvePendingDialog = (value) => {
    const resolver = pendingDialogResolve;
    pendingDialogResolve = null;
    if (resolver) {
      resolver(value);
    }
  };

  const openPinPrompt = (config) => {
    resolvePendingPin(false);
    return new Promise((resolve) => {
      pendingPinResolve = resolve;
      pinModal.value = {
        open: true,
        mode: config.mode,
        title: config.title || "PIN 입력",
        description: config.description || "",
        folderId: config.folderId ?? null,
        folderName: config.folderName || "",
        enterVaultOnSuccess: config.enterVaultOnSuccess ?? true,
        loading: false,
        errorMessage: "",
      };
    });
  };

  const cancelPinModal = () => {
    pinModal.value = {
      ...pinModal.value,
      open: false,
      loading: false,
      errorMessage: "",
    };
    resolvePendingPin(false);
  };

  const submitPinModal = async ({ pin = "", confirmPin = "", currentPin = "" } = {}) => {
    const mode = pinModal.value.mode;
    const normalizedPin = String(pin || "").trim();
    const normalizedConfirm = String(confirmPin || "").trim();
    const normalizedCurrent = String(currentPin || "").trim();

    if (mode === "vault-change") {
      if (!PIN_PATTERN.test(normalizedCurrent) || !PIN_PATTERN.test(normalizedPin)) {
        pinModal.value = { ...pinModal.value, errorMessage: "PIN 번호는 숫자 4자리로 입력해 주세요." };
        return false;
      }
      if (normalizedPin !== normalizedConfirm) {
        pinModal.value = { ...pinModal.value, errorMessage: "새 PIN 번호가 서로 일치하지 않습니다." };
        return false;
      }
    } else if (mode === "vault-register" || mode === "folder-register") {
      if (!PIN_PATTERN.test(normalizedPin)) {
        pinModal.value = { ...pinModal.value, errorMessage: "PIN 번호는 숫자 4자리여야 합니다." };
        return false;
      }
      if (normalizedPin !== normalizedConfirm) {
        pinModal.value = { ...pinModal.value, errorMessage: "PIN 번호 확인이 일치하지 않습니다." };
        return false;
      }
    } else if (!PIN_PATTERN.test(normalizedPin)) {
      pinModal.value = { ...pinModal.value, errorMessage: "4자리 숫자 PIN을 입력해 주세요." };
      return false;
    }

    pinModal.value = { ...pinModal.value, loading: true, errorMessage: "" };

    try {
      if (mode === "vault-register") {
        const result = await registerVaultPin(normalizedPin);
        setSecretVaultToken(result?.unlockToken || "");
        vaultPinRegistered.value = true;
        vaultUnlocked.value = true;
        if (pinModal.value.enterVaultOnSuccess !== false) {
          vaultMode.value = true;
          vaultTrashView.value = false;
        }
      } else if (mode === "vault-unlock") {
        const result = await unlockVaultWithPin(normalizedPin);
        setSecretVaultToken(result?.unlockToken || "");
        vaultPinRegistered.value = true;
        vaultUnlocked.value = true;
        if (pinModal.value.enterVaultOnSuccess !== false) {
          vaultMode.value = true;
          vaultTrashView.value = false;
        }
      } else if (mode === "vault-change") {
        const result = await changeVaultPin(normalizedCurrent, normalizedPin);
        setSecretVaultToken(result?.unlockToken || "");
        vaultUnlocked.value = true;
      } else if (mode === "folder-register" || mode === "folder-unlock") {
        const folderId = pinModal.value.folderId;
        const result = await unlockHiddenFolder(folderId, normalizedPin);
        if (result?.unlockToken) {
          setSecretFolderToken(folderId, result.unlockToken);
        }
        unlockedFolderIds.value = {
          ...unlockedFolderIds.value,
          [String(folderId)]: true,
        };
      }

      pinModal.value = {
        ...pinModal.value,
        open: false,
        loading: false,
        errorMessage: "",
      };
      resolvePendingPin(true);
      return true;
    } catch (error) {
      pinModal.value = {
        ...pinModal.value,
        loading: false,
        errorMessage: extractApiErrorMessage(error, "PIN 확인에 실패했습니다."),
      };
      return false;
    }
  };

  const invalidateVaultUnlock = () => {
    vaultUnlocked.value = false;
    setSecretVaultToken("");
    clearVaultThumbnails();
  };

  const ensureVaultUnlocked = async ({
    enterVault = false,
    title = "",
    registerTitle = "",
    description = "",
    registerDescription = "",
  } = {}) => {
    try {
      const status = await fetchVaultStatus();
      vaultPinRegistered.value = Boolean(status?.pinRegistered);
      if (status?.unlocked && getSecretVaultToken()) {
        vaultUnlocked.value = true;
        if (enterVault) {
          vaultMode.value = true;
          vaultTrashView.value = false;
        }
        return true;
      }
      if (!status?.unlocked && getSecretVaultToken()) {
        invalidateVaultUnlock();
      }
      if (!vaultPinRegistered.value) {
        return await openPinPrompt({
          mode: "vault-register",
          enterVaultOnSuccess: Boolean(enterVault),
          title: registerTitle || title || "자체 비밀 폴더 PIN 등록",
          description:
            registerDescription ||
            description ||
            "처음 접근하는 자체 비밀 폴더입니다. 사용할 4자리 숫자 PIN 번호를 등록해 주세요.",
        });
      }
      return await openPinPrompt({
        mode: "vault-unlock",
        enterVaultOnSuccess: Boolean(enterVault),
        title: title || "자체 비밀 폴더 잠금 해제",
        description:
          description ||
          "자체 비밀 폴더에 들어가려면 4자리 숫자 PIN 번호를 입력하세요.",
      });
    } catch {
      return await openPinPrompt({
        mode: vaultPinRegistered.value ? "vault-unlock" : "vault-register",
        enterVaultOnSuccess: Boolean(enterVault),
        title: title || "자체 비밀 폴더 인증",
        description: description || "4자리 숫자 PIN 번호를 입력하세요.",
      });
    }
  };

  const openVaultAccess = async () => ensureVaultUnlocked({ enterVault: true });

  const openChangeVaultPinModal = () => {
    return openPinPrompt({
      mode: "vault-change",
      title: "비밀 폴더 PIN 변경",
      description: "현재 4자리 PIN과 새로 사용할 4자리 PIN을 입력하세요.",
    });
  };

  const exitVaultMode = ({ lockVault = true } = {}) => {
    vaultMode.value = false;
    vaultTrashView.value = false;
    if (lockVault) {
      const hadVaultToken = Boolean(getSecretVaultToken());
      vaultUnlocked.value = false;
      setSecretVaultToken("");
      clearVaultThumbnails();
      if (hadVaultToken) {
        void lockVaultSession().catch(() => {});
      }
    }
  };

  const setVaultTrashView = (enabled) => {
    vaultTrashView.value = Boolean(enabled);
  };

  const setShowHiddenFolders = (nextValue) => {
    const normalized = Boolean(nextValue);
    showHiddenFolders.value = normalized;
    if (!normalized) {
      const unlockedIds = Object.keys(unlockedFolderIds.value || {}).filter((id) => unlockedFolderIds.value[id]);
      unlockedFolderIds.value = {};
      clearSecretFolderTokens();
      for (const id of unlockedIds) {
        void lockHiddenFolderSession(id).catch(() => {});
      }
    }
  };

  const toggleShowHiddenFolders = () => {
    setShowHiddenFolders(!showHiddenFolders.value);
    return showHiddenFolders.value;
  };

  const ensureFolderUnlocked = async (folder) => {
    if (!folder || !folder.hiddenFolder || !folder.pinEnabled) {
      return true;
    }
    const folderId = folder.id ?? folder.idx;
    if (folderId == null) {
      return false;
    }
    if (isFolderUnlocked(folderId)) {
      return true;
    }

    let pinRegistered = Boolean(folder.pinRegistered);
    try {
      const status = await fetchHiddenFolderStatus(folderId);
      pinRegistered = Boolean(status?.pinRegistered);
      if (status?.unlocked) {
        unlockedFolderIds.value = {
          ...unlockedFolderIds.value,
          [String(folderId)]: true,
        };
        return true;
      }
    } catch {
      // Fall through to prompt using best-known registration state
    }

    return openPinPrompt({
      mode: pinRegistered ? "folder-unlock" : "folder-register",
      title: pinRegistered
        ? `'${folder.name || "비밀 폴더"}' PIN 입력`
        : `'${folder.name || "비밀 폴더"}' PIN 등록`,
      description: pinRegistered
        ? "숨긴 폴더에 들어가려면 4자리 숫자 PIN을 입력하세요."
        : "아직 PIN이 등록되지 않았습니다. 이 폴더에서 사용할 4자리 숫자 PIN을 등록해 주세요.",
      folderId,
      folderName: folder.name || "",
    });
  };

  const openCreateHiddenFolderDialog = (parentId = null) => {
    resolvePendingDialog(null);
    return new Promise((resolve) => {
      pendingDialogResolve = resolve;
      folderDialog.value = {
        open: true,
        mode: "create",
        parentId,
        folder: null,
        initialName: "",
        wasHidden: false,
        hidden: true,
        pinEnabled: false,
        hasExistingPin: false,
        loading: false,
        errorMessage: "",
      };
    });
  };

  const openConfigureHiddenFolderDialog = (folder) => {
    resolvePendingDialog(null);
    const wasHidden = Boolean(folder?.hiddenFolder);
    return new Promise((resolve) => {
      pendingDialogResolve = resolve;
      folderDialog.value = {
        open: true,
        mode: "configure",
        parentId: folder?.parentId ?? null,
        folder,
        initialName: folder?.name || folder?.fileOriginName || "",
        wasHidden,
        hidden: true,
        pinEnabled: Boolean(folder?.pinEnabled),
        hasExistingPin: Boolean(folder?.pinEnabled && folder?.pinRegistered),
        loading: false,
        errorMessage: "",
      };
    });
  };

  const cancelFolderDialog = () => {
    folderDialog.value = {
      ...folderDialog.value,
      open: false,
      loading: false,
      errorMessage: "",
    };
    resolvePendingDialog(null);
  };

  const submitFolderDialog = async ({
    folderName = "",
    hidden = true,
    pinEnabled = false,
    pin = "",
    confirmPin = "",
    currentPin = "",
    registerLater = false,
  } = {}) => {
    const mode = folderDialog.value.mode;
    const trimmedName = String(folderName || "").trim();
    const trimmedPin = String(pin || "").trim();
    const trimmedConfirm = String(confirmPin || "").trim();
    const trimmedCurrent = String(currentPin || "").trim();

    if (mode === "create" && !trimmedName) {
      folderDialog.value = { ...folderDialog.value, errorMessage: "폴더 이름을 입력해 주세요." };
      return null;
    }

    if (hidden && pinEnabled && !registerLater) {
      if (trimmedPin || mode === "create") {
        if (!PIN_PATTERN.test(trimmedPin)) {
          folderDialog.value = { ...folderDialog.value, errorMessage: "PIN 번호는 숫자 4자리여야 합니다." };
          return null;
        }
        if (trimmedPin !== trimmedConfirm) {
          folderDialog.value = { ...folderDialog.value, errorMessage: "PIN 번호 확인이 일치하지 않습니다." };
          return null;
        }
      }
    }

    if (mode === "configure" && folderDialog.value.hasExistingPin) {
      if (!PIN_PATTERN.test(trimmedCurrent)) {
        folderDialog.value = { ...folderDialog.value, errorMessage: "기존 4자리 PIN 번호를 입력해 주세요." };
        return null;
      }
    }

    folderDialog.value = { ...folderDialog.value, loading: true, errorMessage: "" };

    try {
      let result = null;
      if (mode === "create") {
        result = await createFolder(trimmedName, folderDialog.value.parentId, {
          hidden: true,
          pinEnabled: Boolean(pinEnabled),
          pin: pinEnabled && !registerLater ? trimmedPin : undefined,
          vaultMode: vaultMode.value,
          spaceType: vaultMode.value ? "VAULT" : "DRIVE",
        });
      } else {
        const targetId = folderDialog.value.folder?.id ?? folderDialog.value.folder?.idx;
        result = await configureHiddenFolder(targetId, {
          hidden: Boolean(hidden),
          pinEnabled: Boolean(hidden && pinEnabled),
          pin: hidden && pinEnabled && trimmedPin ? trimmedPin : undefined,
          currentPin: folderDialog.value.hasExistingPin ? trimmedCurrent : undefined,
        });
        if (result?.unlockToken && targetId != null) {
          setSecretFolderToken(targetId, result.unlockToken);
          unlockedFolderIds.value = {
            ...unlockedFolderIds.value,
            [String(targetId)]: true,
          };
        }
      }

      folderDialog.value = {
        ...folderDialog.value,
        open: false,
        loading: false,
        errorMessage: "",
      };
      resolvePendingDialog(result);
      return result;
    } catch (error) {
      folderDialog.value = {
        ...folderDialog.value,
        loading: false,
        errorMessage: extractApiErrorMessage(error, "비밀 폴더 저장에 실패했습니다."),
      };
      return null;
    }
  };

  const resetSecretSession = () => {
    vaultMode.value = false;
    vaultTrashView.value = false;
    vaultUnlocked.value = false;
    vaultPinRegistered.value = false;
    showHiddenFolders.value = false;
    unlockedFolderIds.value = {};
    clearAllSecretTokens();
    clearVaultThumbnails();
    cancelPinModal();
    cancelFolderDialog();
  };

  if (globalThis.window?.addEventListener) {
    globalThis.window.addEventListener("fileinnout-session-cleared", resetSecretSession);
    if (typeof onScopeDispose === "function") {
      onScopeDispose(() => {
        globalThis.window?.removeEventListener?.("fileinnout-session-cleared", resetSecretSession);
      });
    }
  }

  return {
    vaultMode,
    vaultTrashView,
    vaultUnlocked,
    vaultPinRegistered,
    showHiddenFolders,
    unlockedFolderIds,
    pinModal,
    folderDialog,
    isFolderUnlocked,
    ensureVaultUnlocked,
    invalidateVaultUnlock,
    openVaultAccess,
    openChangeVaultPinModal,
    exitVaultMode,
    setVaultTrashView,
    setShowHiddenFolders,
    toggleShowHiddenFolders,
    ensureFolderUnlocked,
    cancelPinModal,
    submitPinModal,
    openCreateHiddenFolderDialog,
    openConfigureHiddenFolderDialog,
    cancelFolderDialog,
    submitFolderDialog,
    resetSecretSession,
  };
});
