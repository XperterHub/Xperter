import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  FileUp,
  FolderLock,
  KeyRound,
  LayoutGrid,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Unlock,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { CustomDocumentViewer } from "@/components/vault/CustomDocumentViewer";
import { useAuthState } from "@/lib/auth";
import {
  deleteVaultBlobDataUrl,
  deleteVaultDocumentFromGoogleDrive,
  formatFileSize,
  getDriveAccessToken,
  hydrateVaultDocumentsSafely,
  isDriveConnected,
  hasVaultPassword,
  loadPersonalDetails,
  loadVaultDocuments,
  persistVaultDocumentsSafely,
  savePersonalDetails,
  setVaultPassword,
  triggerVaultDocumentDownload,
  uploadVaultDocumentToGoogleDrive,
  verifyVaultPassword,
  type PersonalDetailsRecord,
  type StoredVaultDocument,
} from "@/lib/google-drive-vault";
import {
  formatVaultDocumentFileName,
  formatVaultFolderName,
  sanitizeUsernameId,
  VAULT_DOCUMENT_TYPES,
  type VaultDocKey,
  type VaultDocumentDefinition,
} from "@/lib/username-id";

export const Route = createFileRoute("/app/page-4")({
  head: () => ({
    meta: [
      { title: "Vault — Xperter" },
      {
        name: "description",
        content: "Protected document vault for personal and government IDs.",
      },
      { property: "og:title", content: "Vault — Xperter" },
      {
        property: "og:description",
        content: "Protected document vault for personal and government IDs.",
      },
    ],
  }),
  component: VaultPage,
});

const DOC_NUMBER_PREFIX: Record<VaultDocKey, string> = {
  aadharcard: "UID",
  voterid: "EPIC",
  pancard: "PAN",
  passbook: "ACC",
  drivinglicense: "DL",
  passport: "PP",
  rationcard: "RC",
  private_doc: "DOC",
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected file"));
    reader.readAsDataURL(file);
  });
}

function VaultPage() {
  const { user } = useAuthState();
  const effectiveUid = user?.uid || "demo_local_user";
  const currentUsername = sanitizeUsernameId(
    user?.name || user?.email?.split("@")[0] || "user",
  );
  const driveFolderName = useMemo(
    () => formatVaultFolderName(currentUsername),
    [currentUsername],
  );

  // Vault lock state stays strictly scoped to active /app/page-4 mount.
  // Locks on: explicit Lock button, leaving /app/page-4, page reload, or closing website.
  // Never locks on OS file picker blur, window focus changes, uploads, or tab switches.
  const [vaultHasPass, setVaultHasPass] = useState<boolean>(() =>
    hasVaultPassword(effectiveUid),
  );
  const [secondaryVerified, setSecondaryVerified] = useState<boolean>(false);

  // Inline unlock / first-time setup form state
  const [inlineUnlockPass, setInlineUnlockPass] = useState("");
  const [showInlinePass, setShowInlinePass] = useState(false);
  const [setupPassInput, setSetupPassInput] = useState("");
  const [setupPassConfirm, setSetupPassConfirm] = useState("");
  const [showSetupPass, setShowSetupPass] = useState(false);
  const [changingVaultPass, setChangingVaultPass] = useState(false);

  // Active unlocked view mode
  const [activeTab, setActiveTab] = useState<"view" | "add">("view");
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | "government" | "financial" | "private"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Vault documents + Google Drive connectivity
  const [vaultDocs, setVaultDocs] = useState<StoredVaultDocument[]>(() =>
    loadVaultDocuments(effectiveUid, currentUsername),
  );
  const [driveConnected, setDriveConnected] = useState<boolean>(() => isDriveConnected());

  // Personal info modal state
  const [personalDetailsOpen, setPersonalDetailsOpen] = useState(false);
  const [personalDetails, setPersonalDetails] = useState<PersonalDetailsRecord>(() =>
    loadPersonalDetails(effectiveUid, user?.name || ""),
  );

  // Add Document Studio state
  const [addSelectedKey, setAddSelectedKey] = useState<VaultDocKey>("aadharcard");
  const [addCustomTitle, setAddCustomTitle] = useState("");
  const [addHolderName, setAddHolderName] = useState(user?.name || "");
  const [addDocNumber, setAddDocNumber] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addFilePreviewUrl, setAddFilePreviewUrl] = useState<string | null>(null);
  const [isDraggingOverAdd, setIsDraggingOverAdd] = useState(false);
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // Quick Replace Modal state
  const [activeUploadDef, setActiveUploadDef] = useState<VaultDocumentDefinition | null>(null);
  const [replacingDoc, setReplacingDoc] = useState<StoredVaultDocument | null>(null);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalFilePreviewUrl, setModalFilePreviewUrl] = useState<string | null>(null);
  const [modalCustomTitle, setModalCustomTitle] = useState("");
  const [modalHolderName, setModalHolderName] = useState(user?.name || "");
  const [modalDocNumber, setModalDocNumber] = useState("");
  const [isModalUploading, setIsModalUploading] = useState(false);
  const [modalUploadProgress, setModalUploadProgress] = useState(0);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Custom Document Viewer & Delete Confirmation
  const [viewingDoc, setViewingDoc] = useState<StoredVaultDocument | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<StoredVaultDocument | null>(null);

  // Hydrate stored docs (including large IndexedDB blobs) cleanly
  useEffect(() => {
    let active = true;
    setVaultHasPass(hasVaultPassword(effectiveUid));
    setDriveConnected(isDriveConnected());
    setPersonalDetails(loadPersonalDetails(effectiveUid, user?.name || ""));
    if (!addHolderName && user?.name) {
      setAddHolderName(user.name);
    }

    void hydrateVaultDocumentsSafely(effectiveUid, currentUsername).then((docs) => {
      if (active) {
        setVaultDocs(docs);
      }
    });

    return () => {
      active = false;
    };
  }, [effectiveUid, currentUsername, user?.name]);

  // Revoke transient object URL previews cleanly
  useEffect(() => {
    return () => {
      if (addFilePreviewUrl) URL.revokeObjectURL(addFilePreviewUrl);
    };
  }, [addFilePreviewUrl]);

  useEffect(() => {
    return () => {
      if (modalFilePreviewUrl) URL.revokeObjectURL(modalFilePreviewUrl);
    };
  }, [modalFilePreviewUrl]);

  // Lock handlers
  const handleLockVault = () => {
    setSecondaryVerified(false);
    setViewingDoc(null);
    setActiveUploadDef(null);
    setChangingVaultPass(false);
    setPersonalDetailsOpen(false);
    toast.success("Vault locked");
  };

  const handleInlineUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyVaultPassword(effectiveUid, inlineUnlockPass)) {
      toast.error("Incorrect password");
      setInlineUnlockPass("");
      return;
    }
    setSecondaryVerified(true);
    setInlineUnlockPass("");
    toast.success("Vault unlocked");
  };

  const handleSetVaultPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupPassInput || setupPassInput.length < 4) {
      toast.error("Use at least 4 characters");
      return;
    }
    if (setupPassInput !== setupPassConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    setVaultPassword(effectiveUid, setupPassInput);
    setVaultHasPass(true);
    setSecondaryVerified(true);
    setChangingVaultPass(false);
    setSetupPassInput("");
    setSetupPassConfirm("");
    toast.success("Vault password saved");
  };

  // Document categorization & filtering for View tab
  const categoryByDocKey = useMemo(() => {
    const map = new Map<VaultDocKey, VaultDocumentDefinition>();
    for (const def of VAULT_DOCUMENT_TYPES) {
      map.set(def.key, def);
    }
    return map;
  }, []);

  const filteredVaultDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return vaultDocs.filter((docItem) => {
      const def = categoryByDocKey.get(docItem.docKey);
      const cat = def?.category || "private";
      if (categoryFilter !== "all" && cat !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        docItem.label.toLowerCase().includes(q) ||
        docItem.documentNumber.toLowerCase().includes(q) ||
        docItem.holderName.toLowerCase().includes(q) ||
        docItem.renamedFileName.toLowerCase().includes(q)
      );
    });
  }, [vaultDocs, categoryFilter, searchQuery, categoryByDocKey]);

  const unaddedStandardDefs = useMemo(() => {
    const existingKeys = new Set(vaultDocs.map((d) => d.docKey));
    return VAULT_DOCUMENT_TYPES.filter(
      (def) => def.key !== "private_doc" && !existingKeys.has(def.key),
    );
  }, [vaultDocs]);

  // Add Document Studio file handlers
  const handleSelectAddFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File exceeds 50MB browser limit");
      return;
    }
    if (addFilePreviewUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(addFilePreviewUrl);
    }
    setAddFile(file);
    setAddFilePreviewUrl(
      file.type.startsWith("image/") && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : null,
    );
  };

  const handleQuickAddDocType = (docKey: VaultDocKey) => {
    setAddSelectedKey(docKey);
    if (docKey !== "private_doc") {
      setAddCustomTitle("");
    }
    setActiveTab("add");
  };

  const handleSaveNewDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secondaryVerified) return;

    const currentDef = VAULT_DOCUMENT_TYPES.find((d) => d.key === addSelectedKey);
    if (!currentDef) return;

    if (!addFile) {
      toast.error("Select an image or PDF file");
      return;
    }

    setIsSavingDoc(true);
    setSaveProgress(20);

    try {
      const existingDoc =
        addSelectedKey === "private_doc"
          ? undefined
          : vaultDocs.find((d) => d.docKey === addSelectedKey);

      const trimmedTitle = addCustomTitle.trim();
      const resolvedTitle =
        addSelectedKey === "private_doc" && trimmedTitle ? trimmedTitle : currentDef.label;
      const resolvedHolder = addHolderName.trim() || user?.name || "Self";
      const resolvedDocNumber =
        addDocNumber.trim() ||
        `${DOC_NUMBER_PREFIX[currentDef.key]}-${Math.floor(1000 + Math.random() * 9000)}`;

      const originalName = addFile.name;
      const naming = formatVaultDocumentFileName(
        currentUsername,
        currentDef.key,
        originalName,
        trimmedTitle || undefined,
      );

      setSaveProgress(45);
      const dataUrl = await readFileAsDataUrl(addFile);

      setSaveProgress(70);
      let driveFileId = existingDoc?.driveFileId;
      let driveWebViewLink = existingDoc?.driveWebViewLink;
      let syncedToDrive = false;

      const token = getDriveAccessToken();
      if (token) {
        try {
          const driveRes = await uploadVaultDocumentToGoogleDrive({
            username: currentUsername,
            docKey: currentDef.key,
            file: addFile,
            accessToken: token,
            ...(trimmedTitle ? { customTitle: trimmedTitle } : {}),
            ...(existingDoc?.driveFileId ? { existingDriveFileId: existingDoc.driveFileId } : {}),
          });
          driveFileId = driveRes.driveFileId;
          driveWebViewLink = driveRes.webViewLink;
          syncedToDrive = true;
        } catch {
          syncedToDrive = false;
        }
      }

      setSaveProgress(90);
      const newRecord: StoredVaultDocument = {
        id: existingDoc?.id || `vdoc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        docKey: currentDef.key,
        label: resolvedTitle,
        renamedFileName: naming.fullFileName,
        baseFileName: naming.baseName,
        originalFileName: originalName,
        driveFolderName,
        mimeType: addFile.type || "application/octet-stream",
        sizeBytes: addFile.size,
        sizeFormatted: formatFileSize(addFile.size),
        dataUrl,
        documentNumber: resolvedDocNumber,
        holderName: resolvedHolder,
        uploadedAtIso: new Date().toISOString(),
        syncedToDrive,
        ...(trimmedTitle ? { customTitle: trimmedTitle } : {}),
        ...(driveFileId ? { driveFileId } : {}),
        ...(driveWebViewLink ? { driveWebViewLink } : {}),
      };

      const nextDocs = existingDoc
        ? vaultDocs.map((d) => (d.id === existingDoc.id ? newRecord : d))
        : [newRecord, ...vaultDocs];

      setVaultDocs(nextDocs);
      await persistVaultDocumentsSafely(effectiveUid, nextDocs);

      setSaveProgress(100);
      toast.success(
        syncedToDrive
          ? `Saved & synced to ${driveFolderName}/`
          : `Saved ${resolvedTitle}`,
      );

      setAddFile(null);
      if (addFilePreviewUrl) {
        URL.revokeObjectURL(addFilePreviewUrl);
        setAddFilePreviewUrl(null);
      }
      if (addFileInputRef.current) {
        addFileInputRef.current.value = "";
      }
      setAddDocNumber("");
      setAddCustomTitle("");
      setActiveTab("view");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save document");
    } finally {
      setIsSavingDoc(false);
    }
  };

  // Replace / Edit Modal handlers
  const openReplaceModal = (docItem: StoredVaultDocument) => {
    const def = categoryByDocKey.get(docItem.docKey) || VAULT_DOCUMENT_TYPES[VAULT_DOCUMENT_TYPES.length - 1]!;
    setActiveUploadDef(def);
    setReplacingDoc(docItem);
    setModalFile(null);
    setModalFilePreviewUrl(null);
    setModalCustomTitle(docItem.customTitle || (docItem.label !== def.label ? docItem.label : ""));
    setModalHolderName(docItem.holderName || user?.name || "");
    setModalDocNumber(docItem.documentNumber || "");
    setModalUploadProgress(0);
  };

  const closeUploadModal = () => {
    setActiveUploadDef(null);
    setReplacingDoc(null);
    setModalFile(null);
    if (modalFilePreviewUrl) {
      URL.revokeObjectURL(modalFilePreviewUrl);
      setModalFilePreviewUrl(null);
    }
    setIsModalUploading(false);
  };

  const handleModalFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File exceeds 50MB browser limit");
      return;
    }
    if (modalFilePreviewUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(modalFilePreviewUrl);
    }
    setModalFile(file);
    setModalFilePreviewUrl(
      file.type.startsWith("image/") && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : null,
    );
  };

  const handleExecuteReplace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUploadDef || !replacingDoc || !secondaryVerified) return;

    setIsModalUploading(true);
    setModalUploadProgress(25);

    try {
      const trimmedTitle = modalCustomTitle.trim();
      const resolvedTitle =
        activeUploadDef.key === "private_doc" && trimmedTitle
          ? trimmedTitle
          : activeUploadDef.label;
      const resolvedHolder = modalHolderName.trim() || user?.name || "Self";
      const resolvedDocNumber = modalDocNumber.trim() || replacingDoc.documentNumber;
      const originalName = modalFile?.name || replacingDoc.originalFileName;
      const naming = formatVaultDocumentFileName(
        currentUsername,
        activeUploadDef.key,
        originalName,
        trimmedTitle || undefined,
      );

      let nextDataUrl = replacingDoc.dataUrl;
      if (modalFile) {
        setModalUploadProgress(50);
        nextDataUrl = await readFileAsDataUrl(modalFile);
      }

      setModalUploadProgress(75);
      let driveFileId = replacingDoc.driveFileId;
      let driveWebViewLink = replacingDoc.driveWebViewLink;
      let syncedToDrive = replacingDoc.syncedToDrive;

      const token = getDriveAccessToken();
      if (token && modalFile) {
        try {
          const driveRes = await uploadVaultDocumentToGoogleDrive({
            username: currentUsername,
            docKey: activeUploadDef.key,
            file: modalFile,
            accessToken: token,
            ...(trimmedTitle ? { customTitle: trimmedTitle } : {}),
            ...(replacingDoc.driveFileId ? { existingDriveFileId: replacingDoc.driveFileId } : {}),
          });
          driveFileId = driveRes.driveFileId;
          driveWebViewLink = driveRes.webViewLink;
          syncedToDrive = true;
        } catch {
          syncedToDrive = false;
        }
      }

      const updatedRecord: StoredVaultDocument = {
        ...replacingDoc,
        label: resolvedTitle,
        originalFileName: originalName,
        baseFileName: naming.baseName,
        renamedFileName: naming.fullFileName,
        driveFolderName,
        dataUrl: nextDataUrl,
        mimeType: modalFile?.type || replacingDoc.mimeType,
        sizeBytes: modalFile ? modalFile.size : replacingDoc.sizeBytes,
        sizeFormatted: modalFile ? formatFileSize(modalFile.size) : replacingDoc.sizeFormatted,
        uploadedAtIso: new Date().toISOString(),
        holderName: resolvedHolder,
        documentNumber: resolvedDocNumber,
        syncedToDrive,
        ...(trimmedTitle ? { customTitle: trimmedTitle } : {}),
        ...(driveFileId ? { driveFileId } : {}),
        ...(driveWebViewLink ? { driveWebViewLink } : {}),
      };

      const nextDocs = vaultDocs.map((d) =>
        d.id === replacingDoc.id ? updatedRecord : d,
      );
      setVaultDocs(nextDocs);
      await persistVaultDocumentsSafely(effectiveUid, nextDocs);

      setModalUploadProgress(100);
      toast.success(`Updated ${resolvedTitle}`);
      closeUploadModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsModalUploading(false);
    }
  };

  const handleConfirmDeleteDoc = async () => {
    if (!confirmDeleteDoc) return;
    const target = confirmDeleteDoc;
    setConfirmDeleteDoc(null);

    const token = getDriveAccessToken();
    if (token && target.driveFileId) {
      try {
        await deleteVaultDocumentFromGoogleDrive(target.driveFileId, token);
      } catch {
        // Proceed with local removal even if remote token expired
      }
    }

    const nextDocs = vaultDocs.filter((d) => d.id !== target.id);
    setVaultDocs(nextDocs);
    await deleteVaultBlobDataUrl(target.id);
    await persistVaultDocumentsSafely(effectiveUid, nextDocs);
    toast.success(`Removed ${target.label}`);
  };

  const handleSavePersonalDetails = (e: React.FormEvent) => {
    e.preventDefault();
    savePersonalDetails(effectiveUid, personalDetails);
    setPersonalDetailsOpen(false);
    toast.success("Personal info saved");
  };

  return (
    <div
      data-testid="vault-page-root"
      className="glass-scroll relative flex h-full w-full flex-col overflow-y-auto px-4 pb-10 pt-16 sm:px-6 sm:pt-16 md:px-8 md:pt-16 lg:px-10 lg:pl-20 lg:py-8"
    >
      {/* ===================================================================== */}
      {/* LOCKED VIEW: SINGLE CENTERED ADAPTIVE CARD                            */}
      {/* ===================================================================== */}
      {!secondaryVerified ? (
        <div className="my-auto mx-auto w-full max-w-[25rem] py-4">
          <GlassCard
            variant="panel"
            padding="none"
            className="frost-panel box-lens-open flex flex-col items-center space-y-6 p-6 text-center sm:p-8"
          >
            {/* Brand + Status Header */}
            <div className="flex flex-col items-center space-y-3">
              <div className="bg-pearl flex h-14 w-14 items-center justify-center rounded-2xl border border-glass-edge text-amber-500 shadow-sm">
                <FolderLock className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight text-foreground">
                    Document Vault
                  </h1>
                  <span
                    data-testid="vault-lock-status-badge"
                    className="rounded-full border border-amber-500/25 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                  >
                    Protected
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {vaultHasPass ? "Enter password to unlock" : "Create a vault password"}
                </p>
              </div>
            </div>

            {/* Inline Unlock OR Inline First-Time Setup */}
            {vaultHasPass ? (
              <form onSubmit={handleInlineUnlock} className="w-full space-y-3">
                <div className="glass-input flex h-11 items-center gap-2.5 rounded-2xl border border-glass-edge px-3.5">
                  <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type={showInlinePass ? "text" : "password"}
                    value={inlineUnlockPass}
                    onChange={(e) => setInlineUnlockPass(e.target.value)}
                    placeholder="Vault password"
                    autoFocus
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInlinePass((s) => !s)}
                    aria-label={showInlinePass ? "Hide password" : "Show password"}
                    className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    {showInlinePass ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <button
                  type="submit"
                  data-testid="unlock-vault-btn"
                  className="btn-ink liquid-press flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-xs font-semibold shadow-md"
                >
                  <Unlock className="h-4 w-4" />
                  <span>Unlock Vault</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleSetVaultPassword} className="w-full space-y-3">
                <div className="glass-input flex h-11 items-center gap-2.5 rounded-2xl border border-glass-edge px-3.5">
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type={showSetupPass ? "text" : "password"}
                    value={setupPassInput}
                    onChange={(e) => setSetupPassInput(e.target.value)}
                    placeholder="New password (min 4 chars)"
                    autoFocus
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupPass((s) => !s)}
                    aria-label={showSetupPass ? "Hide password" : "Show password"}
                    className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    {showSetupPass ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="glass-input flex h-11 items-center gap-2.5 rounded-2xl border border-glass-edge px-3.5">
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type={showSetupPass ? "text" : "password"}
                    value={setupPassConfirm}
                    onChange={(e) => setSetupPassConfirm(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="unlock-vault-btn"
                  className="btn-ink liquid-press flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-xs font-semibold shadow-md"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>Set Password &amp; Unlock</span>
                </button>
              </form>
            )}
          </GlassCard>
        </div>
      ) : (
        /* =================================================================== */
        /* UNLOCKED VIEW: CLEAN ADAPTIVE HEADER + SEPARATE VIEW & ADD          */
        /* =================================================================== */
        <div className="mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-5 pb-6">
          {/* Header Bar */}
          <GlassCard
            variant="panel"
            padding="none"
            className="frost-panel box-lens-open flex flex-col justify-between gap-3.5 p-4 sm:p-5 lg:flex-row lg:items-center"
          >
            {/* Left: Identity & Status */}
            <div className="flex min-w-0 items-center gap-3">
              <div className="bg-pearl flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-glass-edge text-emerald-500 shadow-sm">
                <Unlock className="h-5 w-5" />
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                  Document Vault
                </h1>
                <span
                  data-testid="vault-lock-status-badge"
                  className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  Unlocked
                </span>
                {driveConnected && (
                  <span className="hidden rounded-full border border-glass-edge bg-glass px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                    {driveFolderName}/
                  </span>
                )}
              </div>
            </div>

            {/* Right: Separate View / Add Tabs + Vault Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-glass-edge bg-glass/60 p-1 shadow-inner">
                <button
                  type="button"
                  onClick={() => setActiveTab("view")}
                  className={`liquid-press inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all ${
                    activeTab === "view"
                      ? "btn-ink shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>View ({vaultDocs.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("add")}
                  data-testid="add-private-doc-btn"
                  className={`liquid-press inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all ${
                    activeTab === "add"
                      ? "btn-ink shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileUp className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPersonalDetailsOpen(true)}
                title="Personal Info"
                className="glass liquid-press inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-glass-edge px-3 text-xs font-medium text-foreground hover:bg-glass-strong"
              >
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Info</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChangingVaultPass(true);
                  setSetupPassInput("");
                  setSetupPassConfirm("");
                }}
                title="Change Password"
                className="glass liquid-press inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-glass-edge px-3 text-xs font-medium text-foreground hover:bg-glass-strong"
              >
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Password</span>
              </button>

              <button
                type="button"
                onClick={handleLockVault}
                data-testid="lock-vault-btn"
                title="Lock Vault"
                className="glass liquid-press inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-glass-edge px-3.5 text-xs font-medium text-foreground hover:bg-glass-strong"
              >
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Lock</span>
              </button>
            </div>
          </GlassCard>

          {/* ================================================================= */}
          {/* TAB 1: VIEW DOCUMENTS                                             */}
          {/* ================================================================= */}
          {activeTab === "view" && (
            <div className="flex flex-1 flex-col gap-5">
              {/* Filter + Search Row */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: "all", label: "All" },
                      { id: "government", label: "Govt IDs" },
                      { id: "financial", label: "Financial" },
                      { id: "private", label: "Private" },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`liquid-press cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                        categoryFilter === cat.id
                          ? "bg-foreground text-background shadow-sm"
                          : "border border-glass-edge bg-glass/50 text-muted-foreground hover:bg-glass hover:text-foreground"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {vaultDocs.length > 0 && (
                  <div className="glass-input flex h-9 w-full items-center gap-2 rounded-full border border-glass-edge px-3 sm:w-56">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                )}
              </div>

              {/* Saved Documents Grid OR Minimal Empty State */}
              {filteredVaultDocs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredVaultDocs.map((docItem, idx) => {
                    const isImageThumb = Boolean(
                      docItem.mimeType?.startsWith("image/") &&
                        docItem.dataUrl?.startsWith("data:image/"),
                    );
                    const def = categoryByDocKey.get(docItem.docKey);
                    const catLabel =
                      def?.category === "government"
                        ? "Govt ID"
                        : def?.category === "financial"
                          ? "Financial"
                          : "Private";

                    return (
                      <GlassCard
                        key={docItem.id}
                        variant="panel"
                        padding="none"
                        data-testid={`vault-doc-card-${docItem.docKey}`}
                        style={{ "--box-delay": `${Math.min(idx, 6) * 45}ms` } as CSSProperties}
                        className="frost-panel box-lens-open flex flex-col justify-between gap-3.5 p-4 shadow-sm"
                      >
                        <div className="space-y-3">
                          {/* Title Row */}
                          <div className="flex items-start justify-between gap-2.5">
                            <button
                              type="button"
                              onClick={() => setViewingDoc(docItem)}
                              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left group"
                            >
                              {isImageThumb ? (
                                <img
                                  src={docItem.dataUrl}
                                  alt={docItem.label}
                                  className="h-10 w-10 shrink-0 rounded-xl border border-glass-edge object-cover shadow-xs"
                                />
                              ) : (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-glass-edge bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                  <FileCheck2 className="h-5 w-5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-semibold tracking-tight text-foreground group-hover:underline">
                                  {docItem.label}
                                </h3>
                                <p className="text-[11px] text-muted-foreground">
                                  {catLabel} · {docItem.sizeFormatted}
                                </p>
                              </div>
                            </button>

                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                docItem.syncedToDrive
                                  ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : "border border-glass-edge bg-glass text-muted-foreground"
                              }`}
                            >
                              {docItem.syncedToDrive ? "Drive" : "Local"}
                            </span>
                          </div>

                          {/* Simple Info Box */}
                          <div className="space-y-1 rounded-xl border border-glass-edge bg-glass/50 px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="shrink-0 text-muted-foreground">ID</span>
                              <span className="truncate font-mono font-medium text-foreground tabular-nums">
                                {docItem.documentNumber}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="shrink-0 text-muted-foreground">Holder</span>
                              <span className="truncate font-medium text-foreground">
                                {docItem.holderName}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 border-t border-glass-edge pt-3">
                          <button
                            type="button"
                            onClick={() => setViewingDoc(docItem)}
                            data-testid={`view-doc-btn-${docItem.docKey}`}
                            className="btn-ink liquid-press inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full text-xs font-semibold"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              triggerVaultDocumentDownload(docItem);
                              toast.success(`Downloaded ${docItem.label}`);
                            }}
                            data-testid={`download-doc-btn-${docItem.docKey}`}
                            aria-label={`Download ${docItem.label}`}
                            title="Download"
                            className="glass liquid-press flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-glass-edge text-foreground hover:bg-glass-strong"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openReplaceModal(docItem)}
                            aria-label={`Replace ${docItem.label}`}
                            title="Replace"
                            className="glass liquid-press flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-glass-edge text-muted-foreground hover:bg-glass-strong hover:text-foreground"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDoc(docItem)}
                            aria-label={`Delete ${docItem.label}`}
                            title="Delete"
                            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              ) : (
                <GlassCard
                  variant="panel"
                  padding="none"
                  className="frost-panel box-lens-open my-auto flex flex-col items-center justify-center space-y-4 p-8 text-center sm:p-10"
                >
                  <div className="bg-pearl flex h-12 w-12 items-center justify-center rounded-2xl border border-glass-edge text-muted-foreground">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold text-foreground">
                      {vaultDocs.length === 0 ? "No documents stored" : "No matching documents"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {vaultDocs.length === 0 ? "Add an ID or PDF to start" : "Try another filter"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("add")}
                    className="btn-ink liquid-press inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-5 text-xs font-semibold shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Document</span>
                  </button>
                </GlassCard>
              )}

              {/* Compact Quick-Add Shelf for un-added IDs */}
              {unaddedStandardDefs.length > 0 && (
                <GlassCard
                  variant="panel"
                  padding="none"
                  style={{ "--box-delay": "90ms" } as CSSProperties}
                  className="frost-panel box-lens-open flex flex-wrap items-center gap-2 p-3.5 sm:px-4"
                >
                  <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Quick Add
                  </span>
                  {unaddedStandardDefs.map((def) => (
                    <button
                      key={def.key}
                      type="button"
                      onClick={() => handleQuickAddDocType(def.key)}
                      data-testid={`upload-doc-btn-${def.key}`}
                      className="glass liquid-press inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-glass-edge px-3 text-[11px] font-medium text-foreground hover:bg-glass-strong"
                    >
                      <Plus className="h-3 w-3 text-muted-foreground" />
                      <span>{def.shortLabel}</span>
                    </button>
                  ))}
                </GlassCard>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: ADD DOCUMENT                                               */}
          {/* ================================================================= */}
          {activeTab === "add" && (
            <GlassCard
              variant="panel"
              padding="none"
              className="frost-panel box-lens-open mx-auto w-full max-w-2xl space-y-5 p-5 sm:p-7"
            >
              <div className="flex items-center justify-between border-b border-glass-edge pb-3.5">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Add Document
                </h2>
                <span className="rounded-full border border-glass-edge bg-glass/60 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {driveConnected ? `Sync: ${driveFolderName}/` : "Local Vault"}
                </span>
              </div>

              <form onSubmit={handleSaveNewDocument} className="space-y-4">
                {/* Document Type Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Document Type
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {VAULT_DOCUMENT_TYPES.map((t) => {
                      const isSelected = addSelectedKey === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => {
                            setAddSelectedKey(t.key);
                            if (t.key !== "private_doc") {
                              setAddCustomTitle("");
                            }
                          }}
                          className={`liquid-press cursor-pointer rounded-xl border px-3 py-2 text-left text-xs font-medium transition-all ${
                            isSelected
                              ? "btn-ink border-transparent shadow-sm"
                              : "border-glass-edge bg-glass/40 text-foreground/85 hover:bg-glass/70"
                          }`}
                        >
                          <span className="block truncate">{t.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Title for Private Document */}
                {addSelectedKey === "private_doc" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Title
                    </label>
                    <input
                      type="text"
                      value={addCustomTitle}
                      onChange={(e) => setAddCustomTitle(e.target.value)}
                      placeholder="e.g. Health Insurance, Degree"
                      required
                      className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                    />
                  </div>
                )}

                {/* Holder Name & Document ID */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Holder Name
                    </label>
                    <input
                      type="text"
                      value={addHolderName}
                      onChange={(e) => setAddHolderName(e.target.value)}
                      placeholder="Full Name"
                      required
                      className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Document Number
                    </label>
                    <input
                      type="text"
                      value={addDocNumber}
                      onChange={(e) => setAddDocNumber(e.target.value)}
                      placeholder={
                        categoryByDocKey.get(addSelectedKey)?.idPlaceholder || "ID Number"
                      }
                      required
                      className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                    />
                  </div>
                </div>

                {/* File Dropzone */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">
                    File (Image or PDF)
                  </label>
                  <input
                    ref={addFileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => handleSelectAddFile(e.target.files?.[0])}
                    className="hidden"
                  />

                  <div
                    onClick={() => addFileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingOverAdd(true);
                    }}
                    onDragLeave={() => setIsDraggingOverAdd(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingOverAdd(false);
                      handleSelectAddFile(e.dataTransfer.files?.[0]);
                    }}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
                      isDraggingOverAdd
                        ? "border-primary bg-glass/60"
                        : "border-glass-edge bg-glass/25 hover:bg-glass/45"
                    }`}
                  >
                    {addFilePreviewUrl ? (
                      <div className="space-y-2">
                        <img
                          src={addFilePreviewUrl}
                          alt="Preview"
                          className="mx-auto max-h-32 rounded-xl object-contain shadow-sm"
                        />
                        <p className="text-xs font-medium text-foreground">{addFile?.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatFileSize(addFile?.size || 0)}
                        </p>
                      </div>
                    ) : addFile ? (
                      <div className="space-y-1">
                        <FileText className="mx-auto h-8 w-8 text-primary" />
                        <p className="text-xs font-medium text-foreground">{addFile.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatFileSize(addFile.size)}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload className="mx-auto h-7 w-7 text-muted-foreground" />
                        <p className="text-xs font-medium text-foreground">
                          Drop file or click to browse
                        </p>
                        <p className="text-[11px] text-muted-foreground">PDF, PNG, JPG, WebP</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress Indicator */}
                {isSavingDoc && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Saving…</span>
                      <span>{saveProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-glass">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${saveProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 border-t border-glass-edge pt-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab("view")}
                    disabled={isSavingDoc}
                    className="glass liquid-press h-10 flex-1 cursor-pointer rounded-full border border-glass-edge text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingDoc}
                    className="btn-ink liquid-press h-10 flex-1 cursor-pointer rounded-full text-xs font-semibold shadow-md disabled:opacity-50"
                  >
                    {isSavingDoc ? "Saving…" : "Save Document"}
                  </button>
                </div>
              </form>
            </GlassCard>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* CUSTOM WEBSITE-THEMED DOCUMENT VIEWER                                 */}
      {/* ===================================================================== */}
      <CustomDocumentViewer
        document={viewingDoc}
        isOpen={Boolean(viewingDoc)}
        onClose={() => setViewingDoc(null)}
        onDownload={(docItem) => {
          triggerVaultDocumentDownload(docItem);
          toast.success(`Downloaded ${docItem.label}`);
        }}
        driveFolderName={driveFolderName}
      />

      {/* ===================================================================== */}
      {/* PERSONAL IDENTITY INFO MODAL                                          */}
      {/* ===================================================================== */}
      <Dialog.Root open={personalDetailsOpen} onOpenChange={setPersonalDetailsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[85]" />
          <Dialog.Content className="settings-popover glass fixed left-1/2 top-1/2 z-[90] max-h-[88dvh] w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.75rem] border border-glass-edge p-5 text-foreground shadow-2xl outline-none sm:p-6">
            <div className="flex items-center justify-between border-b border-glass-edge pb-3">
              <div>
                <Dialog.Title className="text-base font-semibold">Personal Info</Dialog.Title>
                <Dialog.Description className="text-[11px] text-muted-foreground">
                  Quick identity details
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleSavePersonalDetails} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Full Name
                </label>
                <input
                  type="text"
                  value={personalDetails.fullName}
                  onChange={(e) =>
                    setPersonalDetails((p) => ({ ...p, fullName: e.target.value }))
                  }
                  placeholder="Legal name"
                  className="glass-input h-9 w-full rounded-xl px-3 text-xs outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={personalDetails.dateOfBirth}
                    onChange={(e) =>
                      setPersonalDetails((p) => ({ ...p, dateOfBirth: e.target.value }))
                    }
                    className="glass-input h-9 w-full rounded-xl px-3 text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Blood Group
                  </label>
                  <input
                    type="text"
                    value={personalDetails.bloodGroup}
                    onChange={(e) =>
                      setPersonalDetails((p) => ({ ...p, bloodGroup: e.target.value }))
                    }
                    placeholder="O+"
                    className="glass-input h-9 w-full rounded-xl px-3 text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Emergency Contact
                </label>
                <input
                  type="text"
                  value={personalDetails.emergencyContactName}
                  onChange={(e) =>
                    setPersonalDetails((p) => ({
                      ...p,
                      emergencyContactName: e.target.value,
                    }))
                  }
                  placeholder="Name & number"
                  className="glass-input h-9 w-full rounded-xl px-3 text-xs outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Address
                </label>
                <input
                  type="text"
                  value={personalDetails.residentialAddress}
                  onChange={(e) =>
                    setPersonalDetails((p) => ({
                      ...p,
                      residentialAddress: e.target.value,
                    }))
                  }
                  placeholder="Residential address"
                  className="glass-input h-9 w-full rounded-xl px-3 text-xs outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPersonalDetailsOpen(false)}
                  className="glass h-9 flex-1 cursor-pointer rounded-full border border-glass-edge text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-ink liquid-press h-9 flex-1 cursor-pointer rounded-full text-xs font-semibold"
                >
                  Save
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ===================================================================== */}
      {/* QUICK REPLACE MODAL                                                   */}
      {/* ===================================================================== */}
      <Dialog.Root
        open={Boolean(activeUploadDef)}
        onOpenChange={(open) => !open && closeUploadModal()}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[85]" />
          <Dialog.Content
            data-testid="upload-vault-doc-modal"
            className="settings-popover glass fixed left-1/2 top-1/2 z-[90] max-h-[86dvh] w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.75rem] border border-glass-edge p-5 text-foreground shadow-2xl outline-none sm:p-6"
          >
            {activeUploadDef && (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-glass-edge pb-3">
                  <div>
                    <Dialog.Title className="text-base font-semibold">
                      Update {activeUploadDef.shortLabel}
                    </Dialog.Title>
                    <Dialog.Description className="text-[11px] text-muted-foreground">
                      Replace details or upload a new file
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      onClick={closeUploadModal}
                      aria-label="Close"
                      className="cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <form onSubmit={handleExecuteReplace} className="mt-4 space-y-3.5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Holder Name
                      </label>
                      <input
                        type="text"
                        value={modalHolderName}
                        onChange={(e) => setModalHolderName(e.target.value)}
                        placeholder="Holder Name"
                        required
                        className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Document Number
                      </label>
                      <input
                        type="text"
                        value={modalDocNumber}
                        onChange={(e) => setModalDocNumber(e.target.value)}
                        placeholder="ID Number"
                        required
                        className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      New File (Optional)
                    </label>
                    <input
                      ref={modalFileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleModalFileSelection}
                      className="hidden"
                    />
                    <div
                      onClick={() => modalFileInputRef.current?.click()}
                      className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-glass-edge bg-glass/20 p-4 text-center hover:bg-glass/40"
                    >
                      {modalFilePreviewUrl ? (
                        <div className="space-y-1.5">
                          <img
                            src={modalFilePreviewUrl}
                            alt="Preview"
                            className="mx-auto max-h-28 rounded-lg object-contain"
                          />
                          <p className="text-xs font-medium">{modalFile?.name}</p>
                        </div>
                      ) : modalFile ? (
                        <div className="space-y-1">
                          <FileText className="mx-auto h-7 w-7 text-primary" />
                          <p className="text-xs font-medium">{modalFile.name}</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                          <p className="text-xs font-medium">Choose image or PDF</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {isModalUploading && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Updating…</span>
                        <span>{modalUploadProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-glass">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${modalUploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeUploadModal}
                      disabled={isModalUploading}
                      className="glass h-9 flex-1 cursor-pointer rounded-full border border-glass-edge text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isModalUploading}
                      className="btn-ink liquid-press h-9 flex-1 cursor-pointer rounded-full text-xs font-semibold shadow-sm"
                    >
                      {isModalUploading ? "Saving…" : "Update"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ===================================================================== */}
      {/* CHANGE SECONDARY PASSWORD MODAL                                       */}
      {/* ===================================================================== */}
      <Dialog.Root open={changingVaultPass} onOpenChange={setChangingVaultPass}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[85]" />
          <Dialog.Content className="settings-popover glass fixed left-1/2 top-1/2 z-[90] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-glass-edge p-5 text-foreground shadow-2xl outline-none">
            <div className="flex items-center justify-between border-b border-glass-edge pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <Dialog.Title className="text-base font-semibold">Change Password</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Set a new password for Document Vault.
            </Dialog.Description>

            <form onSubmit={handleSetVaultPassword} className="mt-4 space-y-3">
              <div className="glass-input flex h-10 items-center gap-2 rounded-xl px-3">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <input
                  type={showSetupPass ? "text" : "password"}
                  value={setupPassInput}
                  onChange={(e) => setSetupPassInput(e.target.value)}
                  placeholder="New password (min 4 chars)"
                  className="w-full bg-transparent text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowSetupPass((s) => !s)}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  {showSetupPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="glass-input flex h-10 items-center gap-2 rounded-xl px-3">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <input
                  type={showSetupPass ? "text" : "password"}
                  value={setupPassConfirm}
                  onChange={(e) => setSetupPassConfirm(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full bg-transparent text-xs outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setChangingVaultPass(false)}
                  className="glass h-9 flex-1 cursor-pointer rounded-full border border-glass-edge text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-ink liquid-press h-9 flex-1 cursor-pointer rounded-full text-xs font-semibold"
                >
                  Save
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ===================================================================== */}
      {/* DELETE CONFIRMATION MODAL                                             */}
      {/* ===================================================================== */}
      <Dialog.Root
        open={Boolean(confirmDeleteDoc)}
        onOpenChange={(open) => !open && setConfirmDeleteDoc(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[85]" />
          <Dialog.Content className="settings-popover glass fixed left-1/2 top-1/2 z-[90] w-[min(92vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-glass-edge p-5 text-foreground shadow-2xl outline-none">
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <Trash2 className="h-5 w-5" />
              </div>
              <Dialog.Title className="text-base font-semibold">
                Remove {confirmDeleteDoc?.label}?
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                {confirmDeleteDoc?.renamedFileName}
              </Dialog.Description>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteDoc(null)}
                  className="glass h-9 flex-1 cursor-pointer rounded-full border border-glass-edge text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteDoc}
                  className="liquid-press h-9 flex-1 cursor-pointer rounded-full bg-destructive text-xs font-semibold text-destructive-foreground shadow-sm hover:opacity-90"
                >
                  Delete
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
