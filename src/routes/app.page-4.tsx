import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  FolderLock,
  KeyRound,
  Lock,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Unlock,
  Upload,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { useAuthState } from "@/lib/auth";
import {
  connectGoogleAccountForDrive,
  deleteVaultDocumentFromGoogleDrive,
  formatFileSize,
  getDriveAccessToken,
  getDriveConnectedEmail,
  isDriveConnected,
  hasVaultPassword,
  loadPersonalDetails,
  loadVaultDocuments,
  savePersonalDetails,
  saveVaultDocuments,
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
import { buildDocumentPreviewSvgDataUrl } from "@/lib/vault-specimen";

export const Route = createFileRoute("/app/page-4")({
  head: () => ({
    meta: [
      { title: "Vault — Xperter" },
      {
        name: "description",
        content: "Encrypted personal & government documents vault protected with secondary password.",
      },
      { property: "og:title", content: "Vault — Xperter" },
      {
        property: "og:description",
        content: "Encrypted personal & government documents vault protected with secondary password.",
      },
    ],
  }),
  component: VaultPage,
});

function VaultPage() {
  const { user } = useAuthState();

  // Secondary Vault Password states
  const [vaultHasPass, setVaultHasPass] = useState<boolean>(false);
  const [secondaryVerified, setSecondaryVerified] = useState<boolean>(false);
  const [setupPassInput, setSetupPassInput] = useState("");
  const [setupPassConfirm, setSetupPassConfirm] = useState("");
  const [showSetupPass, setShowSetupPass] = useState(false);
  const [changingVaultPass, setChangingVaultPass] = useState(false);

  // Auto-lock vault on refresh, window blur, or browser tab switch
  useEffect(() => {
    const handleLock = () => {
      setSecondaryVerified(false);
    };

    window.addEventListener("blur", handleLock);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        setSecondaryVerified(false);
      }
    });

    return () => {
      window.removeEventListener("blur", handleLock);
    };
  }, []);

  // Verification state for secure actions
  const [pendingSecureAction, setPendingSecureAction] = useState<{
    type: "view" | "download" | "upload" | "delete" | "unlock";
    doc?: StoredVaultDocument;
    uploadDef?: VaultDocumentDefinition;
    existingDoc?: StoredVaultDocument;
  } | null>(null);
  const [verifyPassInput, setVerifyPassInput] = useState("");
  const [showVerifyPass, setShowVerifyPass] = useState(false);

  const effectiveUid = user?.uid || "demo_local_user";
  const currentUsername = sanitizeUsernameId(user?.displayName || user?.email?.split("@")[0] || "user");

  const [vaultDocs, setVaultDocs] = useState<StoredVaultDocument[]>(() =>
    loadVaultDocuments(effectiveUid, currentUsername),
  );

  // Google Drive connection status
  const [driveConnected, setDriveConnected] = useState<boolean>(() => isDriveConnected());
  const [driveEmail, setDriveEmail] = useState<string | null>(() => getDriveConnectedEmail());

  useEffect(() => {
    setDriveConnected(isDriveConnected());
    setDriveEmail(getDriveConnectedEmail());
  }, []);

  // Personal details storage
  const [personalDetails, setPersonalDetails] = useState<PersonalDetailsRecord>(() =>
    loadPersonalDetails(effectiveUid),
  );

  const handleSavePersonalDetails = (e: React.FormEvent) => {
    e.preventDefault();
    savePersonalDetails(effectiveUid, personalDetails);
    toast.success("Personal identity details saved");
  };

  // Upload modal state
  const [activeUploadDef, setActiveUploadDef] = useState<VaultDocumentDefinition | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<string | null>(null);
  const [customDocTitle, setCustomDocTitle] = useState("");
  const [holderNameInput, setHolderNameInput] = useState(user?.displayName || "");
  const [documentNumberInput, setDocumentNumberInput] = useState("");
  const [isUploadingToVault, setIsUploadingToVault] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  // Document Viewer Modal State
  const [viewingDoc, setViewingDoc] = useState<StoredVaultDocument | null>(null);
  const [viewerZoom, setViewerZoom] = useState(1);

  // Document Delete Confirmation Modal State
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<StoredVaultDocument | null>(null);

  useEffect(() => {
    const exists = hasVaultPassword(effectiveUid);
    setVaultHasPass(exists);
    setVaultDocs(loadVaultDocuments(effectiveUid, currentUsername));
    setPersonalDetails(loadPersonalDetails(effectiveUid));
  }, [effectiveUid, currentUsername]);

  const driveFolderName = useMemo(
    () => formatVaultFolderName(currentUsername),
    [currentUsername],
  );

  // Handle setting/changing secondary password
  const handleSetVaultPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupPassInput || setupPassInput.length < 4) {
      toast.error("Secondary password must be at least 4 characters");
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
    toast.success("Secondary vault password saved & unlocked");
  };

  // Handle password verification prompt submission
  const handleSecondaryPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyVaultPassword(effectiveUid, verifyPassInput)) {
      toast.error("Incorrect secondary password");
      setVerifyPassInput("");
      return;
    }

    setSecondaryVerified(true);
    const action = pendingSecureAction;
    setPendingSecureAction(null);
    setVerifyPassInput("");

    if (!action || action.type === "unlock") {
      toast.success("Document Vault unlocked");
      return;
    }

    if (action.type === "view" && action.doc) {
      setViewingDoc(action.doc);
      setViewerZoom(1);
    } else if (action.type === "download" && action.doc) {
      triggerVaultDocumentDownload(action.doc);
      toast.success(`Downloaded ${action.doc.label}`);
    } else if (action.type === "upload" && action.uploadDef) {
      openDocumentUploadModal(action.uploadDef, action.existingDoc);
    } else if (action.type === "delete" && action.doc) {
      setConfirmDeleteDoc(action.doc);
    }
  };

  // Safe handlers that require secondary password
  const handleSecureView = (doc: StoredVaultDocument) => {
    if (!secondaryVerified) {
      if (!vaultHasPass) {
        toast.info("Please set a secondary password to protect your vault before viewing.");
        setChangingVaultPass(true);
      } else {
        setPendingSecureAction({ type: "view", doc });
        setVerifyPassInput("");
      }
      return;
    }
    setViewingDoc(doc);
    setViewerZoom(1);
  };

  const handleSecureDownload = (doc: StoredVaultDocument) => {
    if (!secondaryVerified) {
      if (!vaultHasPass) {
        toast.info("Please set a secondary password to protect your vault before downloading.");
        setChangingVaultPass(true);
      } else {
        setPendingSecureAction({ type: "download", doc });
        setVerifyPassInput("");
      }
      return;
    }
    triggerVaultDocumentDownload(doc);
    toast.success(`Downloaded ${doc.label}`);
  };

  const handleRequestDeleteDoc = (doc: StoredVaultDocument) => {
    if (!secondaryVerified) {
      if (!vaultHasPass) {
        toast.info("Please set a secondary password to manage your vault.");
        setChangingVaultPass(true);
      } else {
        setPendingSecureAction({ type: "delete", doc });
        setVerifyPassInput("");
      }
      return;
    }
    setConfirmDeleteDoc(doc);
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error("File size exceeds 25MB limit");
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setSelectedFilePreviewUrl(url);
    } else {
      setSelectedFilePreviewUrl(null);
    }
  };

  const openDocumentUploadModal = (def: VaultDocumentDefinition, existing?: StoredVaultDocument) => {
    if (!secondaryVerified) {
      if (!vaultHasPass) {
        toast.info("Please set a secondary password first to lock and protect your vault.");
        setChangingVaultPass(true);
      } else {
        setPendingSecureAction({ type: "upload", uploadDef: def, existingDoc: existing });
        setVerifyPassInput("");
      }
      return;
    }

    setActiveUploadDef(def);
    setSelectedFile(null);
    setSelectedFilePreviewUrl(null);
    setCustomDocTitle(existing?.label !== def.label ? existing?.label || "" : "");
    setHolderNameInput(existing?.holderName || user?.displayName || "");
    setDocumentNumberInput(existing?.documentNumber || "");
    setUploadProgress(0);
  };

  const closeUploadModal = () => {
    setActiveUploadDef(null);
    setSelectedFile(null);
    if (selectedFilePreviewUrl) {
      URL.revokeObjectURL(selectedFilePreviewUrl);
      setSelectedFilePreviewUrl(null);
    }
    setIsUploadingToVault(false);
  };

  const handleExecuteDocumentUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUploadDef) return;

    if (!selectedFile) {
      const existingDoc = vaultDocs.find((d) => d.docKey === activeUploadDef.key);
      if (!existingDoc) {
        toast.error("Please select a document file to upload.");
        return;
      }
    }

    if (!secondaryVerified) {
      toast.error("Document Vault is locked. Please unlock it with your secondary password.");
      return;
    }

    setIsUploadingToVault(true);
    setUploadProgress(15);
    const activeUser = currentUsername;
    const folderName = formatVaultFolderName(activeUser);

    try {
      const existingDoc = activeUploadDef.key === "private_doc"
        ? undefined
        : vaultDocs.find((d) => d.docKey === activeUploadDef.key);

      const resolvedTitle = customDocTitle.trim() || activeUploadDef.label;
      const resolvedHolder = holderNameInput.trim() || user?.displayName || "Self";
      const resolvedDocNumber =
        documentNumberInput.trim() ||
        `${activeUploadDef.prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

      const originalName = selectedFile?.name || existingDoc?.originalFileName || `${activeUploadDef.key}.pdf`;
      const naming = formatVaultDocumentFileName(
        activeUser,
        activeUploadDef.key,
        originalName,
        customDocTitle.trim() || undefined,
      );

      let dataUrl = existingDoc?.fileDataUrl || "";
      let previewUrl = existingDoc?.previewDataUrl || "";

      if (selectedFile) {
        setUploadProgress(35);
        if (selectedFile.type.startsWith("image/")) {
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });
          previewUrl = dataUrl;
        } else {
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });
          previewUrl = buildDocumentPreviewSvgDataUrl(
            resolvedTitle,
            resolvedDocNumber,
            resolvedHolder,
            selectedFile.type,
          );
        }
      }

      setUploadProgress(65);

      let driveFileId = existingDoc?.driveFileId;
      let driveWebViewLink = existingDoc?.driveWebViewLink;
      let syncedToDrive = Boolean(existingDoc?.syncedToDrive);

      const token = getDriveAccessToken();
      if (token && selectedFile) {
        try {
          const driveRes = await uploadVaultDocumentToGoogleDrive({
            username: activeUser,
            docKey: activeUploadDef.key,
            customTitle: customDocTitle.trim() || undefined,
            file: selectedFile,
            existingDriveFileId: existingDoc?.driveFileId,
            accessToken: token,
          });
          driveFileId = driveRes.driveFileId;
          driveWebViewLink = driveRes.webViewLink;
          syncedToDrive = true;
        } catch {
          syncedToDrive = false;
        }
      }

      setUploadProgress(90);

      const newRecord: StoredVaultDocument = {
        id: existingDoc?.id || `vdoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        docKey: activeUploadDef.key,
        label: resolvedTitle,
        category: activeUploadDef.category,
        originalFileName: originalName,
        renamedFileName: naming.fullFileName,
        fileDataUrl: dataUrl,
        previewDataUrl: previewUrl,
        mimeType: selectedFile?.type || existingDoc?.mimeType || "application/octet-stream",
        sizeFormatted: selectedFile ? formatFileSize(selectedFile.size) : existingDoc?.sizeFormatted || "Stored",
        uploadedAt: new Date().toISOString(),
        holderName: resolvedHolder,
        documentNumber: resolvedDocNumber,
        driveFileId,
        driveWebViewLink,
        syncedToDrive,
        notes: "",
      };

      const nextDocs = existingDoc
        ? vaultDocs.map((d) => (d.id === existingDoc.id ? newRecord : d))
        : [newRecord, ...vaultDocs];

      setVaultDocs(nextDocs);
      saveVaultDocuments(effectiveUid, nextDocs);

      setUploadProgress(100);
      toast.success(
        syncedToDrive
          ? `Uploaded & synced ${resolvedTitle} to Google Drive (${folderName})`
          : `Saved ${resolvedTitle} in encrypted local vault`,
      );
      closeUploadModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setIsUploadingToVault(false);
    }
  };

  const handleConfirmDeleteDoc = async () => {
    if (!confirmDeleteDoc) return;
    const target = confirmDeleteDoc;
    setConfirmDeleteDoc(null);

    const token = getDriveAccessToken();
    if (token && target.driveFileId) {
      try {
        await deleteVaultDocumentFromGoogleDrive(target.driveFileId);
      } catch {
        // Local deletion still proceeds
      }
    }

    const nextDocs = vaultDocs.filter((d) => d.id !== target.id);
    setVaultDocs(nextDocs);
    saveVaultDocuments(effectiveUid, nextDocs);
    toast.success(`Deleted ${target.label}`);
  };

  const visibleDocTypes = useMemo(() => {
    return VAULT_DOCUMENT_TYPES.filter((d) => d.key !== "private_doc");
  }, []);

  const customPrivateDocs = useMemo(
    () => vaultDocs.filter((d) => d.docKey === "private_doc"),
    [vaultDocs],
  );

  return (
    <div
      data-testid="vault-page-root"
      className="glass-scroll relative flex h-full w-full flex-col justify-start overflow-y-auto px-4 pb-10 pt-16 sm:px-6 sm:pt-16 lg:pl-20 lg:pr-8 lg:pt-8"
    >
      <div className="w-full max-w-7xl mx-auto space-y-6">
        {/* Top Header Card */}
        <GlassCard
          variant="panel"
          padding="md"
          className="frost-panel flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 sm:p-6"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="bg-pearl flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-glass-edge shadow-sm">
              {secondaryVerified ? (
                <Unlock className="h-5.5 w-5.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <FolderLock className="h-5.5 w-5.5 text-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                  Document Vault
                </h1>
                <span
                  data-testid="vault-lock-status-badge"
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                    secondaryVerified
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {secondaryVerified ? "Verified" : "Protected"}
                </span>
                {driveConnected && (
                  <span className="hidden sm:inline-flex rounded-full bg-glass border border-glass-edge px-2 py-0.5 text-[10px] text-muted-foreground">
                    Drive: {driveFolderName}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Encrypted Personal &amp; Government IDs (Aadhaar, Passport, PAN, Licenses)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap shrink-0">
            {!secondaryVerified ? (
              <button
                type="button"
                onClick={() => {
                  if (!vaultHasPass) {
                    setChangingVaultPass(true);
                  } else {
                    setPendingSecureAction({ type: "unlock" });
                    setVerifyPassInput("");
                  }
                }}
                data-testid="unlock-vault-btn"
                className="btn-ink liquid-press flex h-9.5 min-w-[8.5rem] items-center justify-center gap-2 rounded-full px-5 text-xs font-semibold shadow-sm"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span>Unlock Vault</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const privDef = VAULT_DOCUMENT_TYPES.find((d) => d.key === "private_doc");
                    if (privDef) openDocumentUploadModal(privDef);
                  }}
                  data-testid="add-private-doc-btn"
                  className="glass-pill liquid-press inline-flex h-9.5 items-center gap-1.5 rounded-full px-4 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChangingVaultPass(true);
                    setSetupPassInput("");
                    setSetupPassConfirm("");
                  }}
                  className="glass-pill liquid-press inline-flex h-9.5 items-center gap-1.5 rounded-full px-4 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Change Password</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSecondaryVerified(false);
                    toast.success("Document Vault locked");
                  }}
                  data-testid="lock-vault-btn"
                  className="glass-pill liquid-press flex h-9.5 min-w-[6rem] items-center justify-center gap-1.5 rounded-full px-4 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Lock</span>
                </button>
              </>
            )}
          </div>
        </GlassCard>

        {/* LOCKED STATE VIEW */}
        {!secondaryVerified && (
          <GlassCard
            variant="panel"
            padding="md"
            className="frost-panel flex flex-col items-center justify-center p-8 sm:p-12 text-center space-y-4"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-md">
              <Lock className="h-8 w-8" />
            </div>
            <div className="max-w-md space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Vault is Locked &amp; Encrypted
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your government IDs, tax certificates, passports, and private records are protected behind an independent secondary password with client-side encryption.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!vaultHasPass) {
                  setChangingVaultPass(true);
                } else {
                  setPendingSecureAction({ type: "unlock" });
                  setVerifyPassInput("");
                }
              }}
              className="btn-ink liquid-press inline-flex h-10 items-center justify-center gap-2 rounded-full px-6 text-xs font-semibold shadow-md"
            >
              <Unlock className="h-4 w-4" />
              <span>{vaultHasPass ? "Enter Password to Unlock" : "Setup Secondary Password"}</span>
            </button>
          </GlassCard>
        )}

        {/* UNLOCKED FULL VAULT INTERFACE */}
        {secondaryVerified && (
          <div className="space-y-6">
            {/* Document Slots Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleDocTypes.map((def) => {
                const stored = vaultDocs.find((doc) => doc.docKey === def.key);

                return (
                  <GlassCard
                    key={def.key}
                    variant="panel"
                    padding="md"
                    data-testid={`vault-doc-card-${def.key}`}
                    className={`frost-panel flex flex-col justify-between p-4.5 min-h-[160px] transition-all ${
                      stored ? "bg-glass-strong shadow-sm" : "bg-glass/30 hover:bg-glass/50"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-glass-edge ${
                              stored
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : "bg-pearl text-muted-foreground"
                            }`}
                          >
                            {stored ? (
                              <FileCheck2 className="h-4.5 w-4.5" />
                            ) : (
                              <FileText className="h-4.5 w-4.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold tracking-tight text-foreground truncate">
                              {def.label}
                            </h3>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {def.category === "government" ? "Govt Identity Proof" : "Financial Record"}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            stored
                              ? stored.syncedToDrive
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                              : "bg-glass border border-glass-edge text-muted-foreground"
                          }`}
                        >
                          {stored
                            ? stored.syncedToDrive
                              ? "Drive Synced"
                              : "Stored"
                            : "Empty"}
                        </span>
                      </div>

                      {stored ? (
                        <div className="mt-3 rounded-xl border border-glass-edge bg-glass/60 px-3 py-2 text-xs space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="shrink-0 text-muted-foreground">ID:</span>
                            <span className="truncate font-medium text-foreground tabular-nums">
                              {stored.documentNumber}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="shrink-0 text-muted-foreground">Holder:</span>
                            <span className="truncate font-medium text-foreground">
                              {stored.holderName}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/80 line-clamp-2">
                          {def.description}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-glass-edge pt-3">
                      {stored ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSecureView(stored)}
                            data-testid={`view-doc-btn-${def.key}`}
                            className="btn-ink liquid-press inline-flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSecureDownload(stored)}
                            data-testid={`download-doc-btn-${def.key}`}
                            className="glass-pill liquid-press inline-flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Download</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDocumentUploadModal(def, stored)}
                            className="glass-pill liquid-press rounded-full px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestDeleteDoc(stored)}
                            aria-label={`Delete ${def.label}`}
                            className="rounded-full p-1.5 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openDocumentUploadModal(def)}
                          data-testid={`upload-doc-btn-${def.key}`}
                          className="btn-ink liquid-press flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold shadow-sm"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span>Upload Document</span>
                        </button>
                      )}
                    </div>
                  </GlassCard>
                );
              })}

              {/* Custom Private Documents */}
              {customPrivateDocs.map((privDoc) => (
                <GlassCard
                  key={privDoc.id}
                  variant="panel"
                  padding="md"
                  className="frost-panel flex flex-col justify-between p-4.5 min-h-[160px] shadow-sm bg-glass-strong"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-glass-edge">
                          <FileCheck2 className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold tracking-tight text-foreground truncate">
                            {privDoc.label}
                          </h3>
                          <p className="text-[10px] text-muted-foreground">Private Document</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-glass border border-glass-edge px-2 py-0.5 text-[10px] font-medium text-foreground">
                        Private
                      </span>
                    </div>

                    <div className="mt-3 rounded-xl border border-glass-edge bg-glass/60 px-3 py-2 text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">ID:</span>
                        <span className="font-medium text-foreground">{privDoc.documentNumber}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Holder:</span>
                        <span className="truncate font-medium text-foreground">{privDoc.holderName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-glass-edge pt-3">
                    <button
                      type="button"
                      onClick={() => handleSecureView(privDoc)}
                      className="btn-ink liquid-press inline-flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSecureDownload(privDoc)}
                      className="glass-pill liquid-press inline-flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRequestDeleteDoc(privDoc)}
                      aria-label={`Delete ${privDoc.label}`}
                      className="rounded-full p-1.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>

            {/* Personal Details Form */}
            <GlassCard variant="panel" padding="md" className="frost-panel p-5">
              <form onSubmit={handleSavePersonalDetails} className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-glass-edge pb-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Personal Identity Details
                  </h3>
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Full Legal Name
                    </label>
                    <input
                      type="text"
                      value={personalDetails.fullName}
                      onChange={(e) =>
                        setPersonalDetails((p) => ({ ...p, fullName: e.target.value }))
                      }
                      placeholder="As per Government ID"
                      className="glass-input h-9 w-full rounded-xl px-3 text-xs outline-none"
                    />
                  </div>
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
                      placeholder="e.g. O+ / B+"
                      className="glass-input h-9 w-full rounded-xl px-3 text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      placeholder="Contact name & phone"
                      className="glass-input h-9 w-full rounded-xl px-3 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Permanent Address
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
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="btn-ink liquid-press rounded-full px-5 py-2 text-xs font-semibold shadow-sm"
                  >
                    Save Details
                  </button>
                </div>
              </form>
            </GlassCard>
          </div>
        )}
      </div>

      {/* SECONDARY PASSWORD SETUP / CHANGE MODAL */}
      <Dialog.Root open={changingVaultPass} onOpenChange={setChangingVaultPass}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[85]" />
          <Dialog.Content className="settings-popover glass fixed left-1/2 top-1/2 z-[90] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] p-5 text-foreground outline-none shadow-2xl border border-glass-edge">
            <div className="flex items-center justify-between pb-3 border-b border-glass-edge">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4.5 w-4.5 text-primary" />
                <Dialog.Title className="text-base font-semibold">
                  {vaultHasPass ? "Change Secondary Password" : "Set Secondary Password"}
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleSetVaultPassword} className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  New Secondary Password
                </label>
                <div className="glass-input flex h-10 items-center gap-2 rounded-xl px-3">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <input
                    type={showSetupPass ? "text" : "password"}
                    value={setupPassInput}
                    onChange={(e) => setSetupPassInput(e.target.value)}
                    placeholder="Min 4 characters"
                    className="w-full bg-transparent text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupPass((s) => !s)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {showSetupPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Confirm Password
                </label>
                <div className="glass-input flex h-10 items-center gap-2 rounded-xl px-3">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <input
                    type={showSetupPass ? "text" : "password"}
                    value={setupPassConfirm}
                    onChange={(e) => setSetupPassConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full bg-transparent text-xs outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setChangingVaultPass(false)}
                  className="glass-input h-9 flex-1 rounded-full text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-ink liquid-press h-9 flex-1 rounded-full text-xs font-medium"
                >
                  Save Password
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* SECONDARY PASSWORD VALIDATION MODAL */}
      <Dialog.Root
        open={Boolean(pendingSecureAction)}
        onOpenChange={(o) => !o && setPendingSecureAction(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[85]" />
          <Dialog.Content className="settings-popover glass fixed left-1/2 top-1/2 z-[90] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] p-5 text-foreground outline-none shadow-2xl border border-glass-edge">
            <div className="flex items-center justify-between pb-3 border-b border-glass-edge">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Lock className="h-4.5 w-4.5" />
                </div>
                <div>
                  <Dialog.Title className="text-base font-semibold text-foreground">
                    Security Verification
                  </Dialog.Title>
                  <p className="text-xs text-muted-foreground">Secondary Password Required</p>
                </div>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleSecondaryPasswordSubmit} className="mt-4 space-y-3.5">
              <p className="text-xs text-muted-foreground">
                {pendingSecureAction?.type === "view"
                  ? `Enter secondary password to view ${pendingSecureAction.doc?.label || "document"}.`
                  : pendingSecureAction?.type === "download"
                    ? `Enter secondary password to download ${pendingSecureAction.doc?.label || "document"}.`
                    : pendingSecureAction?.type === "upload"
                      ? `Enter secondary password to upload to ${pendingSecureAction.uploadDef?.label || "Document Vault"}.`
                      : "Enter secondary password to unlock the Document Vault for viewing and uploading files."}
              </p>

              <div className="glass-input flex h-11 items-center gap-2 rounded-xl px-3.5">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <input
                  type={showVerifyPass ? "text" : "password"}
                  value={verifyPassInput}
                  onChange={(e) => setVerifyPassInput(e.target.value)}
                  placeholder="Enter secondary password"
                  autoFocus
                  className="w-full bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowVerifyPass((s) => !s)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {showVerifyPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingSecureAction(null)}
                  className="glass-input h-10 flex-1 rounded-full text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-ink liquid-press h-10 flex-1 rounded-full text-xs font-medium"
                >
                  Verify &amp; Proceed
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* DOCUMENT PREVIEWER MODAL */}
      <Dialog.Root open={Boolean(viewingDoc)} onOpenChange={(o) => !o && setViewingDoc(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[80]" />
          <Dialog.Content
            data-testid="vault-document-viewer-modal"
            className="settings-popover glass fixed left-1/2 top-1/2 z-[85] max-h-[92dvh] w-[min(94vw,44rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[2.5rem] p-5 text-foreground outline-none sm:p-6"
          >
            {viewingDoc && (
              <>
                <div className="flex items-center justify-between border-b border-glass-edge pb-3">
                  <div>
                    <Dialog.Title className="text-base font-semibold text-foreground">
                      {viewingDoc.label}
                    </Dialog.Title>
                    <p className="text-xs text-muted-foreground">
                      ID: {viewingDoc.documentNumber} · {viewingDoc.holderName}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setViewerZoom((z) => Math.max(0.6, z - 0.2))}
                      className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-glass"
                      title="Zoom out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewerZoom(1)}
                      className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-glass"
                      title="Reset zoom"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewerZoom((z) => Math.min(2.5, z + 0.2))}
                      className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-glass"
                      title="Zoom in"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSecureDownload(viewingDoc)}
                      className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-glass"
                      title="Download file"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-glass"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                </div>

                <div className="mt-4 flex max-h-[60vh] items-center justify-center overflow-auto rounded-2xl border border-glass-edge bg-glass/40 p-4">
                  {viewingDoc.fileDataUrl && viewingDoc.mimeType.startsWith("image/") ? (
                    <img
                      src={viewingDoc.fileDataUrl}
                      alt={viewingDoc.label}
                      style={{
                        transform: `scale(${viewerZoom})`,
                        transformOrigin: "center center",
                      }}
                      className="max-h-[500px] w-auto rounded-xl object-contain shadow-md transition-transform duration-200"
                    />
                  ) : (
                    <img
                      src={viewingDoc.previewDataUrl}
                      alt={viewingDoc.label}
                      style={{
                        transform: `scale(${viewerZoom})`,
                        transformOrigin: "center center",
                      }}
                      className="max-h-[400px] w-auto rounded-xl object-contain shadow-md transition-transform duration-200"
                    />
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Drive: {driveFolderName}/{viewingDoc.renamedFileName}</span>
                  <span>Size: {viewingDoc.sizeFormatted}</span>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* UPLOAD / EDIT DOCUMENT MODAL */}
      <Dialog.Root open={Boolean(activeUploadDef)} onOpenChange={(o) => !o && setActiveUploadDef(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[85]" />
          <Dialog.Content
            data-testid="upload-vault-doc-modal"
            aria-describedby="upload-doc-desc"
            className="settings-popover glass fixed left-1/2 top-1/2 z-[90] max-h-[82dvh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] p-5 text-foreground outline-none sm:p-6"
          >
            {activeUploadDef && (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-glass-edge pb-3">
                  <div>
                    <Dialog.Title className="text-base font-semibold text-foreground">
                      {activeUploadDef.label}
                    </Dialog.Title>
                    <Dialog.Description id="upload-doc-desc" className="mt-0.5 text-[11px] text-muted-foreground">
                      {
                        formatVaultDocumentFileName(
                          currentUsername,
                          activeUploadDef.key,
                          selectedFile?.name,
                          customDocTitle || undefined,
                        ).fullFileName
                      }
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      onClick={closeUploadModal}
                      className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <form onSubmit={handleExecuteDocumentUpload} className="mt-4 space-y-3.5">
                  {activeUploadDef.key === "private_doc" && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Document Name
                      </label>
                      <input
                        type="text"
                        value={customDocTitle}
                        onChange={(e) => setCustomDocTitle(e.target.value)}
                        placeholder="e.g. Health Insurance, Rental Agreement"
                        required
                        className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Holder Full Name
                      </label>
                      <input
                        type="text"
                        value={holderNameInput}
                        onChange={(e) => setHolderNameInput(e.target.value)}
                        placeholder="Document Holder Name"
                        required
                        className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Document / ID Number
                      </label>
                      <input
                        type="text"
                        value={documentNumberInput}
                        onChange={(e) => setDocumentNumberInput(e.target.value)}
                        placeholder="ID or Certificate #"
                        required
                        className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">
                      Document File (Image or PDF)
                    </label>
                    <input
                      ref={uploadFileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleFileSelection}
                      className="hidden"
                    />

                    <div
                      onClick={() => uploadFileInputRef.current?.click()}
                      className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-glass-edge bg-glass/20 p-5 text-center transition-colors hover:bg-glass/40"
                    >
                      {selectedFilePreviewUrl ? (
                        <div className="space-y-2">
                          <img
                            src={selectedFilePreviewUrl}
                            alt="Document Preview"
                            className="max-h-32 rounded-lg object-contain shadow-sm mx-auto"
                          />
                          <p className="text-xs font-medium text-foreground">{selectedFile?.name}</p>
                        </div>
                      ) : selectedFile ? (
                        <div className="space-y-1">
                          <FileText className="h-8 w-8 text-primary mx-auto" />
                          <p className="text-xs font-medium text-foreground">{selectedFile.name}</p>
                          <p className="text-[10px] text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Upload className="h-7 w-7 text-muted-foreground mx-auto" />
                          <p className="text-xs font-medium text-foreground">Click to select ID scan or document</p>
                          <p className="text-[10px] text-muted-foreground">PDF, PNG, JPG up to 25MB</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {isUploadingToVault && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Encrypting &amp; storing…</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-glass">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeUploadModal}
                      disabled={isUploadingToVault}
                      className="glass-pill liquid-press h-10 flex-1 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isUploadingToVault}
                      className="btn-ink liquid-press h-10 flex-1 rounded-full text-xs font-semibold shadow-md"
                    >
                      {isUploadingToVault ? "Saving…" : "Save Document"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* CONFIRM DELETE DOCUMENT MODAL */}
      <Dialog.Root open={Boolean(confirmDeleteDoc)} onOpenChange={(o) => !o && setConfirmDeleteDoc(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[85]" />
          <Dialog.Content className="settings-popover glass fixed left-1/2 top-1/2 z-[90] w-[min(92vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] p-5 text-foreground outline-none shadow-2xl border border-glass-edge">
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <Trash2 className="h-6 w-6" />
              </div>
              <Dialog.Title className="text-base font-semibold">
                Delete {confirmDeleteDoc?.label}?
              </Dialog.Title>
              <p className="text-xs text-muted-foreground">
                Are you sure you want to remove <strong className="text-foreground">{confirmDeleteDoc?.renamedFileName}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteDoc(null)}
                  className="glass-input h-9 flex-1 rounded-full text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteDoc}
                  className="bg-destructive text-destructive-foreground liquid-press h-9 flex-1 rounded-full text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity"
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
