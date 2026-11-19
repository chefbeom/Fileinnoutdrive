import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import {
  changeVaultPin as changeVaultPinApi,
  configureHiddenFolder as configureHiddenFolderApi,
  createFolder as createFolderApi,
  fetchHiddenFolderStatus as fetchHiddenFolderStatusApi,
  fetchVaultStatus as fetchVaultStatusApi,
  registerVaultPin as registerVaultPinApi,
  unlockHiddenFolder as unlockHiddenFolderApi,
  unlockVaultWithPin as unlockVaultWithPinApi,
} from "@/api/filesApi.js";
import {
  getSecretFolderTokensHeader,
  getSecretVaultToken,
} from "./secretSessionHeaders.js";
import { useSecretFolderStore } from "./useSecretFolderStore.js";

vi.mock("@/api/filesApi.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchVaultStatus: vi.fn(),
    registerVaultPin: vi.fn(),
    unlockVaultWithPin: vi.fn(),
    lockVaultSession: vi.fn().mockResolvedValue({ unlocked: false }),
    changeVaultPin: vi.fn(),
    fetchHiddenFolderStatus: vi.fn(),
    unlockHiddenFolder: vi.fn(),
    lockHiddenFolderSession: vi.fn().mockResolvedValue({ unlocked: false }),
    createFolder: vi.fn(),
    configureHiddenFolder: vi.fn(),
  };
});

describe("useSecretFolderStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    useSecretFolderStore().resetSecretSession();
  });

  it("registers a 4-digit PIN on first vault entry and unlocks vault space", async () => {
    fetchVaultStatusApi.mockResolvedValueOnce({ pinRegistered: false, unlocked: false });
    registerVaultPinApi.mockResolvedValueOnce({ pinRegistered: true, unlocked: true, unlockToken: "vault-jwt-1" });

    const store = useSecretFolderStore();
    const accessPromise = store.openVaultAccess();

    await vi.waitFor(() => {
      expect(store.pinModal.open).toBe(true);
    });
    expect(store.pinModal.mode).toBe("vault-register");

    await expect(store.submitPinModal({ pin: "123", confirmPin: "123" })).resolves.toBe(false);
    expect(store.pinModal.errorMessage).toContain("4자리");

    await expect(store.submitPinModal({ pin: "1234", confirmPin: "1234" })).resolves.toBe(true);
    await expect(accessPromise).resolves.toBe(true);

    expect(registerVaultPinApi).toHaveBeenCalledWith("1234");
    expect(store.vaultMode).toBe(true);
    expect(store.vaultUnlocked).toBe(true);
    expect(store.vaultPinRegistered).toBe(true);
    expect(getSecretVaultToken()).toBe("vault-jwt-1");

    store.exitVaultMode({ lockVault: true });
    expect(store.vaultMode).toBe(false);
    expect(store.vaultUnlocked).toBe(false);
    expect(getSecretVaultToken()).toBe("");
  });

  it("unlocks vault via ensureVaultUnlocked({ enterVault: false }) without switching vaultMode until openVaultAccess", async () => {
    fetchVaultStatusApi
      .mockResolvedValueOnce({ pinRegistered: true, unlocked: false })
      .mockResolvedValueOnce({ pinRegistered: true, unlocked: true });
    unlockVaultWithPinApi.mockResolvedValueOnce({ unlocked: true, unlockToken: "vault-bg-jwt" });

    const store = useSecretFolderStore();
    const ensurePromise = store.ensureVaultUnlocked({
      enterVault: false,
      title: "비밀 폴더로 옮기기",
      description: "PIN을 입력하세요.",
    });

    await vi.waitFor(() => {
      expect(store.pinModal.open).toBe(true);
    });
    expect(store.pinModal.mode).toBe("vault-unlock");

    await expect(store.submitPinModal({ pin: "2468" })).resolves.toBe(true);
    await expect(ensurePromise).resolves.toBe(true);

    expect(store.vaultUnlocked).toBe(true);
    expect(store.vaultMode).toBe(false);
    expect(getSecretVaultToken()).toBe("vault-bg-jwt");

    await expect(store.openVaultAccess()).resolves.toBe(true);
    expect(store.vaultMode).toBe(true);

    store.invalidateVaultUnlock();
    expect(store.vaultUnlocked).toBe(false);
    expect(getSecretVaultToken()).toBe("");
  });

  it("unlocks an existing vault with PIN and supports PIN change", async () => {
    fetchVaultStatusApi.mockResolvedValueOnce({ pinRegistered: true, unlocked: false });
    unlockVaultWithPinApi.mockResolvedValueOnce({ unlocked: true, unlockToken: "vault-jwt-2" });
    changeVaultPinApi.mockResolvedValueOnce({ unlockToken: "vault-jwt-3" });

    const store = useSecretFolderStore();
    const accessPromise = store.openVaultAccess();

    await vi.waitFor(() => {
      expect(store.pinModal.open).toBe(true);
    });
    expect(store.pinModal.mode).toBe("vault-unlock");

    await expect(store.submitPinModal({ pin: "4321" })).resolves.toBe(true);
    await expect(accessPromise).resolves.toBe(true);
    expect(unlockVaultWithPinApi).toHaveBeenCalledWith("4321");
    expect(getSecretVaultToken()).toBe("vault-jwt-2");

    const changePromise = store.openChangeVaultPinModal();
    await expect(store.submitPinModal({ currentPin: "4321", pin: "9999", confirmPin: "9999" })).resolves.toBe(true);
    await expect(changePromise).resolves.toBe(true);
    expect(changeVaultPinApi).toHaveBeenCalledWith("4321", "9999");
    expect(getSecretVaultToken()).toBe("vault-jwt-3");
  });

  it("handles hidden folders with optional PIN or first-entry PIN registration and clears tokens when hiding", async () => {
    const store = useSecretFolderStore();

    // Hidden folder without PIN opens directly
    await expect(
      store.ensureFolderUnlocked({ id: 77, name: "NoPinHidden", hiddenFolder: true, pinEnabled: false }),
    ).resolves.toBe(true);

    // Hidden folder with PIN enabled but not registered yet -> prompts folder-register
    fetchHiddenFolderStatusApi.mockResolvedValueOnce({ pinEnabled: true, pinRegistered: false, unlocked: false });
    unlockHiddenFolderApi.mockResolvedValueOnce({ unlocked: true, unlockToken: "folder-jwt-88" });

    const folderAccessPromise = store.ensureFolderUnlocked({
      id: 88,
      name: "PinHidden",
      hiddenFolder: true,
      pinEnabled: true,
      pinRegistered: false,
    });

    await vi.waitFor(() => {
      expect(store.pinModal.open).toBe(true);
    });
    expect(store.pinModal.mode).toBe("folder-register");

    await expect(store.submitPinModal({ pin: "5678", confirmPin: "5678" })).resolves.toBe(true);
    await expect(folderAccessPromise).resolves.toBe(true);
    expect(unlockHiddenFolderApi).toHaveBeenCalledWith(88, "5678");
    expect(store.isFolderUnlocked(88)).toBe(true);
    expect(getSecretFolderTokensHeader()).toBe("folder-jwt-88");

    // Hiding again clears unlocked folder tokens
    store.setShowHiddenFolders(true);
    expect(store.showHiddenFolders).toBe(true);
    store.setShowHiddenFolders(false);
    expect(store.showHiddenFolders).toBe(false);
    expect(store.isFolderUnlocked(88)).toBe(false);
    expect(getSecretFolderTokensHeader()).toBe("");
  });

  it("creates hidden folders with optional PIN via dialog", async () => {
    createFolderApi.mockResolvedValueOnce({ idx: 91, fileOriginName: "SecretNotes", hiddenFolder: true });
    configureHiddenFolderApi.mockResolvedValueOnce({ idx: 91, hiddenFolder: true, pinEnabled: true, unlockToken: "folder-91" });

    const store = useSecretFolderStore();
    const createPromise = store.openCreateHiddenFolderDialog(12);
    await expect(store.submitFolderDialog({
      folderName: "SecretNotes",
      hidden: true,
      pinEnabled: true,
      registerLater: true,
    })).resolves.toMatchObject({ idx: 91 });
    await expect(createPromise).resolves.toMatchObject({ idx: 91 });
    expect(createFolderApi).toHaveBeenCalledWith("SecretNotes", 12, expect.objectContaining({
      hidden: true,
      pinEnabled: true,
      pin: undefined,
      vaultMode: false,
      spaceType: "DRIVE",
    }));

    const configPromise = store.openConfigureHiddenFolderDialog({ id: 91, name: "SecretNotes", hiddenFolder: true, pinEnabled: false });
    await expect(store.submitFolderDialog({
      hidden: true,
      pinEnabled: true,
      pin: "1357",
      confirmPin: "1357",
    })).resolves.toMatchObject({ idx: 91 });
    await expect(configPromise).resolves.toMatchObject({ idx: 91 });
    expect(getSecretFolderTokensHeader()).toContain("folder-91");
  });

  it("defaults hidden=true with wasHidden=false when converting a normal folder to a secret folder", async () => {
    configureHiddenFolderApi.mockResolvedValueOnce({ idx: 44, hiddenFolder: true, pinEnabled: false });
    const store = useSecretFolderStore();

    const convertPromise = store.openConfigureHiddenFolderDialog({
      id: 44,
      name: "WorkDocs",
      hiddenFolder: false,
      pinEnabled: false,
    });
    expect(store.folderDialog.wasHidden).toBe(false);
    expect(store.folderDialog.hidden).toBe(true);

    await expect(store.submitFolderDialog({ hidden: true, pinEnabled: false })).resolves.toMatchObject({ idx: 44, hiddenFolder: true });
    await expect(convertPromise).resolves.toMatchObject({ idx: 44 });
    expect(configureHiddenFolderApi).toHaveBeenCalledWith(44, {
      hidden: true,
      pinEnabled: false,
      pin: undefined,
      currentPin: undefined,
    });
  });
});
