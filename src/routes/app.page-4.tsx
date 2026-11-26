import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  CheckCircle2,
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
  X,
  FileUp,
  LayoutGrid,
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
import { CustomDocumentViewer } from "@/components/vault/CustomDocumentViewer";

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
  const effectiveUid = user?.uid || "demo_local_user";
  const currentUsername = sanitizeUsernameId(
    user?.displayName || user?.email?.split("@")[0] || "user",
  );

  const sessionLockKey = `xperter.vault.session.${effectiveUid}`;

  // Secondary Vault Password states
  const [vaultHasPass, setVaultHasPass] = useState<boolean>(false);
  const [secondaryVerified, setSecondaryVerified] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage?.getItem(sessionLockKey) === "unlocked";
    } catch {
      return false;
    }
  });

  const [setupPassInput, setSetupPassInput] = useState("");
  const [setupPassConfirm, setSetupPassConfirm] = useState("");
  const [showSetupPass, setShowSetupPass] = useState(false);
  const [changingVaultPass, setChangingVaultPass] = useState(false);

  // Unified Inline Unlock form state
  const [inlineUnlockPass, setInlineUnlockPass] = useState("");
  const [showInlineUnlockPass, setShowInlineUnlockPass] = useState(false);

  // Active view tab when unlocked: "view" (View Documents) or "add" (Add Document)
  const [activeTab, setActiveTab] = useState<"view" | "add">("view");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "government" | "financial" | "private">("all");

  // Lock state lifecycle:
  // - Auto-lock ONLY when navigating away to another route or closing the tab/website.
  // - NEVER lock on window blur (so opening the OS file upload picker never locks the vault!).
  useEffect(() => {
    return () => {
      // Cleanup on page unmount / navigation away
      try {
        window.sessionStorage?.removeItem(sessionLockKey);
      } catch {}
    };
  }, [sessionLockKey]);

  // Handle explicit locking
  const handleLockVault = () => {
    setSecondaryVerified(false);
    try {
      window.sessionStorage?.removeItem(sessionLockKey);
    } catch {}
    toast.success("Document Vault locked");
  };

  // Verification state for secure actions (modal prompt fallback)
  const [pendingSecureAction, setPendingSecureAction] = useState<{
    type: "view" | "download" | "upload" | "delete" | "unlock";
    doc?: StoredVaultDocument;
    uploadDef?: VaultDocumentDefinition;
    existingDoc?: StoredVaultDocument;
  } | null>(null);
  const [verifyPassInput, setVerifyPassInput] = useState("");
  const [showVerifyPass, setShowVerifyPass] = useState(false);

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

  // Dedicated "Add Document" Studio State
  const [addSelectedKey, setAddSelectedKey] = useState<VaultDocKey>("aadharcard");
  const [addCustomTitle, setAddCustomTitle] = useState("");
  const [addHolderName, setAddHolderName] = useState(user?.displayName || "Self");
  const [addDocNumber, setAddDocNumber] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addFilePreviewUrl, setAddFilePreviewUrl] = useState<string | null>(null);
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // Modal Upload State (for quick "Replace" from card)
  const [activeUploadDef, setActiveUploadDef] = useState<VaultDocumentDefinition | null>(null);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalFilePreviewUrl, setModalFilePreviewUrl] = useState<string | null>(null);
  const [modalCustomTitle, setModalCustomTitle] = useState("");
  const [modalHolderName, setModalHolderName] = useState(user?.displayName || "");
  const [modalDocNumber, setModalDocNumber] = useState("");
  const [isModalUploading, setIsModalUploading] = useState(false);
  const [modalUploadProgress, setModalUploadProgress] = useState(0);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Custom Document Viewer State
  const [viewingDoc, setViewingDoc] = useState<StoredVaultDocument | null>(null);

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

  // Set / Change secondary password handler
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
    try {
      window.sessionStorage?.setItem(sessionLockKey, "unlocked");
    } catch {}
    setChangingVaultPass(false);
    setSetupPassInput("");
    setSetupPassConfirm("");
    toast.success("Secondary vault password saved & unlocked");
  };

  // Inline unlock submission on the merged card
  const handleInlineUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyVaultPassword(effectiveUid, inlineUnlockPass)) {
      toast.error("Incorrect secondary password");
      setInlineUnlockPass("");
      return;
    }

    setSecondaryVerified(true);
    try {
      window.sessionStorage?.setItem(sessionLockKey, "unlocked");
    } catch {}
    setInlineUnlockPass("");
    toast.success("Document Vault unlocked");
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
    try {
      window.sessionStorage?.setItem(sessionLockKey, "unlocked");
    } catch {}
    const action = pendingSecureAction;
    setPendingSecureAction(null);
    setVerifyPassInput("");

    if (!action || action.type === "unlock") {
      toast.success("Document Vault unlocked");
      return;
    }

    if (action.type === "view" && action.doc) {
      setViewingDoc(action.doc);
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

  // File selection for Add Document Studio
  const handleAddFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error("File size exceeds 25MB limit");
      return;
    }

    setAddFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setAddFilePreviewUrl(url);
    } else {
      setAddFilePreviewUrl(null);
    }
  };

  // Quick switch from empty card to Add Document tab
  const handleQuickAddDocType = (docKey: VaultDocKey) => {
    setAddSelectedKey(docKey);
    const def = VAULT_DOCUMENT_TYPES.find((d) => d.key === docKey);
    if (def) {
      setAddDocNumber("");
    }
    setActiveTab("add");
  };

  // Save Document in Add Document Studio
  const handleExecuteAddDocumentStudio = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!secondaryVerified) {
      toast.error("Document Vault is locked. Please unlock it with your secondary password.");
      return;
    }

    const currentDef = VAULT_DOCUMENT_TYPES.find((d) => d.key === addSelectedKey);
    if (!currentDef) return;

    if (!addFile) {
      toast.error("Please select a document file (Image or PDF) to save.");
      return;
    }

    setIsSavingDoc(true);
    setSaveProgress(15);
    const activeUser = currentUsername;
    const folderName = formatVaultFolderName(activeUser);

    try {
      const existingDoc =
        addSelectedKey === "private_doc"
          ? undefined
          : vaultDocs.find((d) => d.docKey === addSelectedKey);

      const resolvedTitle =
        addSelectedKey === "private_doc" && addCustomTitle.trim()
          ? addCustomTitle.trim()
          : currentDef.label;
      const resolvedHolder = addHolderName.trim() || user?.displayName || "Self";
      const resolvedDocNumber =
        addDocNumber.trim() ||
        `${currentDef.prefix || "DOC"}-${Math.floor(1000 + Math.random() * 9000)}`;

      const originalName = addFile.name;
      const naming = formatVaultDocumentFileName(
        activeUser,
        currentDef.key,
        originalName,
        addCustomTitle.trim() || undefined,
      );

      setSaveProgress(35);
      let dataUrl = "";
      let previewUrl = "";

      if (addFile.type.startsWith("image/")) {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(addFile);
        });
        previewUrl = dataUrl;
      } else {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(addFile);
        });
        previewUrl = buildDocumentPreviewSvgDataUrl(
          resolvedTitle,
          resolvedDocNumber,
          resolvedHolder,
          addFile.type,
        );
      }

      setSaveProgress(65);
      let driveFileId: string | undefined = existingDoc?.driveFileId;
      let driveWebViewLink: string | undefined = existingDoc?.driveWebViewLink;
      let syncedToDrive = false;

      const token = getDriveAccessToken();
      if (token) {
        try {
          const driveRes = await uploadVaultDocumentToGoogleDrive({
            username: activeUser,
            docKey: currentDef.key,
            customTitle: addCustomTitle.trim() || undefined,
            file: addFile,
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

      setSaveProgress(90);

      const newRecord: StoredVaultDocument = {
        id: existingDoc?.id || `vdoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        docKey: currentDef.key,
        label: resolvedTitle,
        category: currentDef.category,
        originalFileName: originalName,
        renamedFileName: naming.fullFileName,
        fileDataUrl: dataUrl,
        previewDataUrl: previewUrl,
        mimeType: addFile.type || "application/octet-stream",
        sizeFormatted: formatFileSize(addFile.size),
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

      setSaveProgress(100);
      toast.success(
        syncedToDrive
          ? `Saved & synced ${resolvedTitle} to Google Drive (${folderName})`
          : `Saved ${resolvedTitle} in encrypted vault`,
      );

      // Reset form and switch to View Documents tab
      setAddFile(null);
      if (addFilePreviewUrl) {
        URL.revokeObjectURL(addFilePreviewUrl);
        setAddFilePreviewUrl(null);
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

  // Quick Replace Modal handlers
  const openDocumentUploadModal = (def: VaultDocumentDefinition, existing?: StoredVaultDocument) => {
    setActiveUploadDef(def);
    setModalFile(null);
    setModalFilePreviewUrl(null);
    setModalCustomTitle(existing?.label !== def.label ? existing?.label || "" : "");
    setModalHolderName(existing?.holderName || user?.displayName || "");
    setModalDocNumber(existing?.documentNumber || "");
    setModalUploadProgress(0);
  };

  const closeUploadModal = () => {
    setActiveUploadDef(null);
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
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File size exceeds 25MB limit");
      return;
    }
    setModalFile(file);
    if (file.type.startsWith("image/")) {
      setModalFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setModalFilePreviewUrl(null);
    }
  };

  const handleExecuteModalUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUploadDef) return;

    if (!secondaryVerified) {
      toast.error("Document Vault is locked. Please unlock it with your secondary password.");
      return;
    }

    setIsModalUploading(true);
    setModalUploadProgress(20);
    const activeUser = currentUsername;

    try {
      const existingDoc = activeUploadDef.key === "private_doc"
        ? undefined
        : vaultDocs.find((d) => d.docKey === activeUploadDef.key);

      const resolvedTitle = modalCustomTitle.trim() || activeUploadDef.label;
      const resolvedHolder = modalHolderName.trim() || user?.displayName || "Self";
      const resolvedDocNumber = modalDocNumber.trim() || existingDoc?.documentNumber || "DOC-001";
      const originalName = modalFile?.name || existingDoc?.originalFileName || `${activeUploadDef.key}.pdf`;
      const naming = formatVaultDocumentFileName(
        activeUser,
        activeUploadDef.key,
        originalName,
        modalCustomTitle.trim() || undefined,
      );

      let dataUrl = existingDoc?.fileDataUrl || "";
      let previewUrl = existingDoc?.previewDataUrl || "";

      if (modalFile) {
        setModalUploadProgress(40);
        if (modalFile.type.startsWith("image/")) {
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(modalFile);
          });
          previewUrl = dataUrl;
        } else {
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(modalFile);
          });
          previewUrl = buildDocumentPreviewSvgDataUrl(
            resolvedTitle,
            resolvedDocNumber,
            resolvedHolder,
            modalFile.type,
          );
        }
      }

      setModalUploadProgress(70);
      let driveFileId = existingDoc?.driveFileId;
      let driveWebViewLink = existingDoc?.driveWebViewLink;
      let syncedToDrive = Boolean(existingDoc?.syncedToDrive);

      const token = getDriveAccessToken();
      if (token && modalFile) {
        try {
          const driveRes = await uploadVaultDocumentToGoogleDrive({
            username: activeUser,
            docKey: activeUploadDef.key,
            customTitle: modalCustomTitle.trim() || undefined,
            file: modalFile,
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

      setModalUploadProgress(90);
      const newRecord: StoredVaultDocument = {
        id: existingDoc?.id || `vdoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        docKey: activeUploadDef.key,
        label: resolvedTitle,
        category: activeUploadDef.category,
        originalFileName: originalName,
        renamedFileName: naming.fullFileName,
        fileDataUrl: dataUrl,
        previewDataUrl: previewUrl,
        mimeType: modalFile?.type || existingDoc?.mimeType || "application/octet-stream",
        sizeFormatted: modalFile ? formatFileSize(modalFile.size) : existingDoc?.sizeFormatted || "Stored",
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

      setModalUploadProgress(100);
      toast.success(`Updated ${resolvedTitle}`);
      closeUploadModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update document");
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
        await deleteVaultDocumentFromGoogleDrive(target.driveFileId);
      } catch {}
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

  const filteredStandardDocs = useMemo(() => {
    if (categoryFilter === "all") return visibleDocTypes;
    return visibleDocTypes.filter((d) => d.category === categoryFilter);
  }, [categoryFilter, visibleDocTypes]);

  const showPrivateDocs = categoryFilter === "all" || categoryFilter === "private";

  return (
    <div
      data-testid="vault-page-root"
      className="glass-scroll relative flex h-full w-full flex-col justify-start overflow-y-auto px-4 pb-10 pt-16 sm:px-6 sm:pt-16 lg:pl-20 lg:pr-8 lg:pt-8"
    >
      <div className="w-full max-w-7xl mx-auto space-y-6">
        {/* ========================================================================= */}
        {/* LOCKED STATE: SINGLE MERGED HERO CARD (NO DUPLICATE BUTTONS)              */}
        {/* ========================================================================= */}
        {!secondaryVerified ? (
          <GlassCard
            variant="panel"
            padding="md"
            className="frost-panel flex flex-col items-center justify-center p-6 sm:p-10 text-center space-y-6 max-w-xl mx-auto animate-liquid"
          >
            {/* Header Badge */}
            <div className="flex items-center gap-2.5">
              <div className="bg-pearl flex h-10 w-10 items-center justify-center rounded-2xl border border-glass-edge shadow-sm text-amber-500">
                <FolderLock className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h1 className="text-base font-semibold tracking-tight text-foreground">
                  Document Vault
                </h1>
                <div className="flex items-center gap-2">
                  <span
                    data-testid="vault-lock-status-badge"
                    className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold"
                  >
                    Protected
                  </span>
                  {driveConnected && (
                    <span className="text-[10px] text-muted-foreground">
                      Drive: {driveFolderName}/
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Ambient Lock Glyph */}
            <div className="flex h-18 w-18 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-500 border border-amber-500/25 shadow-lg">
              <Lock className="h-9 w-9 animate-pulse" />
            </div>

            <div className="space-y-1.5 max-w-sm">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                Vault is Locked &amp; Encrypted
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Client-side encrypted vault for sovereign IDs, Aadhaar, PAN, Passport, and private records.
              </p>
            </div>

            {/* Single Primary Action: Inline Password Unlock or Setup */}
            {vaultHasPass ? (
              <form onSubmit={handleInlineUnlock} className="w-full max-w-xs space-y-3">
                <div className="glass-input flex h-11 items-center gap-2 rounded-2xl px-3.5 border border-glass-edge">
                  <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    type={showInlineUnlockPass ? "text" : "password"}
                    value={inlineUnlockPass}
                    onChange={(e) => setInlineUnlockPass(e.target.value)}
                    placeholder="Enter secondary password"
                    autoFocus
                    className="w-full bg-transparent text-xs sm:text-sm outline-none text-foreground placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInlineUnlockPass((s) => !s)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                  >
                    {showInlineUnlockPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="submit"
                  data-testid="unlock-vault-btn"
                  className="btn-ink liquid-press flex h-11 w-full items-center justify-center gap-2 rounded-full text-xs font-semibold shadow-md cursor-pointer"
                >
                  <Unlock className="h-4 w-4" />
                  <span>Unlock Vault</span>
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setChangingVaultPass(true)}
                data-testid="unlock-vault-btn"
                className="btn-ink liquid-press inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-xs font-semibold shadow-md cursor-pointer"
              >
                <KeyRound className="h-4 w-4" />
                <span>Setup Secondary Password</span>
              </button>
            )}
          </GlassCard>
        ) : (
          /* ========================================================================= */
          /* UNLOCKED STATE: TOP HEADER + SEPARATE VIEW & ADD TABS                     */
          /* ========================================================================= */
          <div className="space-y-6">
            {/* Top Header Card */}
            <GlassCard
              variant="panel"
              padding="md"
              className="frost-panel flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6"
            >
              {/* Left: Branding & Status */}
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="bg-pearl flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-glass-edge shadow-sm text-emerald-500">
                  <Unlock className="h-5.5 w-5.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                      Document Vault
                    </h1>
                    <span
                      data-testid="vault-lock-status-badge"
                      className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 text-[10px] font-semibold border border-emerald-500/30"
                    >
                      Verified &amp; Unlocked
                    </span>
                    {driveConnected && (
                      <span className="hidden sm:inline-flex rounded-full bg-glass border border-glass-edge px-2 py-0.5 text-[10px] text-muted-foreground">
                        Drive: {driveFolderName}/
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Client-side encrypted personal &amp; government ID records
                  </p>
                </div>
              </div>

              {/* Right: Tab Switcher & Security Controls */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                {/* Segmented Tab Controls: Separate View & Add */}
                <div className="inline-flex rounded-full bg-glass/60 border border-glass-edge p-1 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setActiveTab("view")}
                    className={`liquid-press inline-flex h-8.5 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all cursor-pointer ${
                      activeTab === "view"
                        ? "btn-ink shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>View Documents ({vaultDocs.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("add")}
                    data-testid="add-private-doc-btn"
                    className={`liquid-press inline-flex h-8.5 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all cursor-pointer ${
                      activeTab === "add"
                        ? "btn-ink shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    <span>Add Document</span>
                  </button>
                </div>

                {/* Change Password */}
                <button
                  type="button"
                  onClick={() => {
                    setChangingVaultPass(true);
                    setSetupPassInput("");
                    setSetupPassConfirm("");
                  }}
                  title="Change secondary password"
                  className="glass-pill liquid-press inline-flex h-9.5 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="hidden sm:inline">Change Password</span>
                </button>

                {/* Lock Vault */}
                <button
                  type="button"
                  onClick={handleLockVault}
                  data-testid="lock-vault-btn"
                  title="Lock Document Vault"
                  className="glass-pill liquid-press flex h-9.5 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Lock</span>
                </button>
              </div>
            </GlassCard>

            {/* ===================================================================== */}
            {/* TAB 1: VIEW DOCUMENTS VIEW                                            */}
            {/* ===================================================================== */}
            {activeTab === "view" && (
              <div className="space-y-6">
                {/* Category Filter Pills */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(
                      [
                        { id: "all", label: "All Documents" },
                        { id: "government", label: "Government IDs" },
                        { id: "financial", label: "Financial Records" },
                        { id: "private", label: "Private Documents" },
                      ] as const
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryFilter(cat.id)}
                        className={`liquid-press rounded-full px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                          categoryFilter === cat.id
                            ? "bg-foreground text-background shadow-sm"
                            : "bg-glass/50 hover:bg-glass border border-glass-edge text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab("add")}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Upload New Document</span>
                  </button>
                </div>

                {/* Documents Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredStandardDocs.map((def) => {
                    const stored = vaultDocs.find((doc) => doc.docKey === def.key);

                    return (
                      <GlassCard
                        key={def.key}
                        variant="panel"
                        padding="md"
                        data-testid={`vault-doc-card-${def.key}`}
                        className={`frost-panel flex flex-col justify-between p-4.5 min-h-[170px] transition-all ${
                          stored ? "bg-glass-strong shadow-sm" : "bg-glass/30 hover:bg-glass/50"
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
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
                                  {def.category === "government"
                                    ? "Govt Identity"
                                    : "Financial Record"}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                stored
                                  ? stored.syncedToDrive
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                    : "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
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
                                className="btn-ink liquid-press inline-flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>View</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSecureDownload(stored)}
                                data-testid={`download-doc-btn-${def.key}`}
                                className="glass-pill liquid-press inline-flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge cursor-pointer"
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span>Download</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openDocumentUploadModal(def, stored)}
                                className="glass-pill liquid-press rounded-full px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                Replace
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRequestDeleteDoc(stored)}
                                aria-label={`Delete ${def.label}`}
                                className="rounded-full p-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleQuickAddDocType(def.key)}
                              data-testid={`upload-doc-btn-${def.key}`}
                              className="btn-ink liquid-press flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold shadow-sm cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Add {def.shortLabel}</span>
                            </button>
                          )}
                        </div>
                      </GlassCard>
                    );
                  })}

                  {/* Custom Private Documents */}
                  {showPrivateDocs &&
                    customPrivateDocs.map((privDoc) => (
                      <GlassCard
                        key={privDoc.id}
                        variant="panel"
                        padding="md"
                        className="frost-panel flex flex-col justify-between p-4.5 min-h-[170px] shadow-sm bg-glass-strong"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
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
                              <span className="font-medium text-foreground tabular-nums">
                                {privDoc.documentNumber}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Holder:</span>
                              <span className="truncate font-medium text-foreground">
                                {privDoc.holderName}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-glass-edge pt-3">
                          <button
                            type="button"
                            onClick={() => handleSecureView(privDoc)}
                            className="btn-ink liquid-press inline-flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSecureDownload(privDoc)}
                            className="glass-pill liquid-press inline-flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Download</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestDeleteDoc(privDoc)}
                            aria-label={`Delete ${privDoc.label}`}
                            className="rounded-full p-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </GlassCard>
                    ))}
                </div>

                {/* Personal Identity Details Section */}
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
                        className="btn-ink liquid-press rounded-full px-5 py-2 text-xs font-semibold shadow-sm cursor-pointer"
                      >
                        Save Details
                      </button>
                    </div>
                  </form>
                </GlassCard>
              </div>
            )}

            {/* ===================================================================== */}
            {/* TAB 2: DEDICATED ADD DOCUMENT STUDIO                                  */}
            {/* ===================================================================== */}
            {activeTab === "add" && (
              <GlassCard
                variant="panel"
                padding="md"
                className="frost-panel p-6 sm:p-8 space-y-6 max-w-3xl mx-auto animate-liquid"
              >
                <div className="border-b border-glass-edge pb-4">
                  <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                    Add Document to Vault
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Select the document type, provide holder details, and attach the scan or PDF.
                  </p>
                </div>

                <form onSubmit={handleExecuteAddDocumentStudio} className="space-y-5">
                  {/* Step 1: Select Document Type */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-foreground">
                      1. Select Document Type
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                            className={`liquid-press flex flex-col items-start p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? "bg-glass-strong border-primary/60 shadow-md ring-1 ring-primary/30"
                                : "bg-glass/40 border-glass-edge hover:bg-glass/60 text-muted-foreground"
                            }`}
                          >
                            <div className="flex w-full items-center justify-between">
                              <span
                                className={`text-xs font-semibold ${
                                  isSelected ? "text-foreground" : "text-foreground/80"
                                }`}
                              >
                                {t.shortLabel}
                              </span>
                              {isSelected && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-1 truncate w-full">
                              {t.category}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: Details */}
                  <div className="space-y-3 pt-1">
                    <label className="block text-xs font-medium text-foreground">
                      2. Document Holder &amp; Identification
                    </label>

                    {addSelectedKey === "private_doc" && (
                      <div>
                        <label className="mb-1 block text-[11px] text-muted-foreground">
                          Custom Document Title
                        </label>
                        <input
                          type="text"
                          value={addCustomTitle}
                          onChange={(e) => setAddCustomTitle(e.target.value)}
                          placeholder="e.g. Health Insurance, Birth Certificate"
                          required
                          className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[11px] text-muted-foreground">
                          Holder Full Name
                        </label>
                        <input
                          type="text"
                          value={addHolderName}
                          onChange={(e) => setAddHolderName(e.target.value)}
                          placeholder="Legal Name on ID"
                          required
                          className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-muted-foreground">
                          Document / ID Number
                        </label>
                        <input
                          type="text"
                          value={addDocNumber}
                          onChange={(e) => setAddDocNumber(e.target.value)}
                          placeholder={
                            VAULT_DOCUMENT_TYPES.find((t) => t.key === addSelectedKey)
                              ?.idPlaceholder || "ID Number"
                          }
                          required
                          className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Attach File */}
                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-medium text-foreground">
                      3. Document File (Image or PDF)
                    </label>
                    <input
                      ref={addFileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleAddFileSelection}
                      className="hidden"
                    />

                    <div
                      onClick={() => addFileInputRef.current?.click()}
                      className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-glass-edge bg-glass/20 p-6 text-center transition-colors hover:bg-glass/40"
                    >
                      {addFilePreviewUrl ? (
                        <div className="space-y-2">
                          <img
                            src={addFilePreviewUrl}
                            alt="Preview"
                            className="max-h-36 rounded-xl object-contain shadow-md mx-auto"
                          />
                          <p className="text-xs font-medium text-foreground">{addFile?.name}</p>
                          <span className="text-[10px] text-muted-foreground">
                            {formatFileSize(addFile?.size || 0)} · Click to change file
                          </span>
                        </div>
                      ) : addFile ? (
                        <div className="space-y-1">
                          <FileText className="h-9 w-9 text-primary mx-auto" />
                          <p className="text-xs font-medium text-foreground">{addFile.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatFileSize(addFile.size)} · Ready to encrypt &amp; store
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                          <p className="text-xs font-medium text-foreground">
                            Click to browse or drop document scan
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            PDF, PNG, JPG, WebP up to 25MB
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Indicator */}
                  {isSavingDoc && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Encrypting &amp; storing in vault…</span>
                        <span>{saveProgress}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-glass">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-primary transition-all duration-300"
                          style={{ width: `${saveProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Submit / Cancel Actions */}
                  <div className="flex items-center gap-3 pt-3 border-t border-glass-edge">
                    <button
                      type="button"
                      onClick={() => setActiveTab("view")}
                      disabled={isSavingDoc}
                      className="glass-pill liquid-press h-10 flex-1 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingDoc}
                      className="btn-ink liquid-press h-10 flex-1 rounded-full text-xs font-semibold shadow-md cursor-pointer"
                    >
                      {isSavingDoc ? "Saving to Vault…" : "Save Document to Vault"}
                    </button>
                  </div>
                </form>
              </GlassCard>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* CUSTOM THEMED DOCUMENT VIEWER                                             */}
      {/* ========================================================================= */}
      <CustomDocumentViewer
        document={viewingDoc}
        isOpen={Boolean(viewingDoc)}
        onClose={() => setViewingDoc(null)}
        onDownload={handleSecureDownload}
        driveFolderName={driveFolderName}
      />

      {/* ========================================================================= */}
      {/* QUICK REPLACE MODAL                                                       */}
      {/* ========================================================================= */}
      <Dialog.Root open={Boolean(activeUploadDef)} onOpenChange={(o) => !o && closeUploadModal()}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[85]" />
          <Dialog.Content
            data-testid="upload-vault-doc-modal"
            aria-describedby="upload-doc-desc"
            className="settings-popover glass fixed left-1/2 top-1/2 z-[90] max-h-[85dvh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] p-5 text-foreground outline-none border border-glass-edge shadow-2xl sm:p-6"
          >
            {activeUploadDef && (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-glass-edge pb-3">
                  <div>
                    <Dialog.Title className="text-base font-semibold text-foreground">
                      Replace {activeUploadDef.label}
                    </Dialog.Title>
                    <Dialog.Description id="upload-doc-desc" className="mt-0.5 text-[11px] text-muted-foreground">
                      Upload a new scan or PDF to update this document in your vault.
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

                <form onSubmit={handleExecuteModalUpload} className="mt-4 space-y-3.5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Holder Full Name
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
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        Document / ID Number
                      </label>
                      <input
                        type="text"
                        value={modalDocNumber}
                        onChange={(e) => setModalDocNumber(e.target.value)}
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
                      ref={modalFileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleModalFileSelection}
                      className="hidden"
                    />

                    <div
                      onClick={() => modalFileInputRef.current?.click()}
                      className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-glass-edge bg-glass/20 p-5 text-center transition-colors hover:bg-glass/40"
                    >
                      {modalFilePreviewUrl ? (
                        <div className="space-y-2">
                          <img
                            src={modalFilePreviewUrl}
                            alt="Preview"
                            className="max-h-32 rounded-lg object-contain shadow-sm mx-auto"
                          />
                          <p className="text-xs font-medium text-foreground">{modalFile?.name}</p>
                        </div>
                      ) : modalFile ? (
                        <div className="space-y-1">
                          <FileText className="h-8 w-8 text-primary mx-auto" />
                          <p className="text-xs font-medium text-foreground">{modalFile.name}</p>
                          <p className="text-[10px] text-muted-foreground">{formatFileSize(modalFile.size)}</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Upload className="h-7 w-7 text-muted-foreground mx-auto" />
                          <p className="text-xs font-medium text-foreground">Click to select new document file</p>
                          <p className="text-[10px] text-muted-foreground">PDF, PNG, JPG up to 25MB</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {isModalUploading && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Encrypting &amp; storing…</span>
                        <span>{modalUploadProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-glass">
                        <div
                          className="h-full bg-primary transition-all duration-300"
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
                      className="glass-pill liquid-press h-10 flex-1 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isModalUploading}
                      className="btn-ink liquid-press h-10 flex-1 rounded-full text-xs font-semibold shadow-md cursor-pointer"
                    >
                      {isModalUploading ? "Saving…" : "Update Document"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ========================================================================= */}
      {/* SECONDARY PASSWORD SETUP / CHANGE MODAL                                   */}
      {/* ========================================================================= */}
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
                  className="btn-ink liquid-press h-9 flex-1 rounded-full text-xs font-medium cursor-pointer"
                >
                  Save Password
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ========================================================================= */}
      {/* SECONDARY PASSWORD VALIDATION MODAL                                       */}
      {/* ========================================================================= */}
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
                  className="btn-ink liquid-press h-10 flex-1 rounded-full text-xs font-medium cursor-pointer"
                >
                  Verify &amp; Proceed
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ========================================================================= */}
      {/* CONFIRM DELETE DOCUMENT MODAL                                             */}
      {/* ========================================================================= */}
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
                  className="bg-destructive text-destructive-foreground liquid-press h-9 flex-1 rounded-full text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
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
