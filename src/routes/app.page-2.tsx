import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Camera,
  Check,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Folder,
  FolderLock,
  FolderUp,
  HardDrive,
  KeyRound,
  Lock,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Unlock,
  Upload,
  UserCheck,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { UniqueUsernameField } from "@/components/auth/UniqueUsernameField";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { playSettingsLiquidSound, triggerSettingsHaptic } from "@/components/SettingsControl";
import {
  checkUsernameAvailability,
  updateUserProfile,
  useAuthState,
  type UsernameAvailabilityStatus,
} from "@/lib/auth";
import {
  connectGoogleAccountForDrive,
  deleteVaultDocumentFromGoogleDrive,
  ensureDriveUserDocFolder,
  formatFileSize,
  getCustomCloudFolderName,
  getDriveAccessToken,
  getDriveConnectedEmail,
  hasVaultPassword,
  loadCloudFiles,
  loadPersonalDetails,
  loadVaultDocuments,
  renameDriveFolder,
  saveCloudFiles,
  savePersonalDetails,
  saveVaultDocuments,
  setCustomCloudFolderName,
  setVaultPassword,
  triggerVaultDocumentDownload,
  uploadGenericFileToGoogleDrive,
  uploadVaultDocumentToGoogleDrive,
  verifyVaultPassword,
  type CloudUploadedItem,
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

export const Route = createFileRoute("/app/page-2")({
  head: () => ({
    meta: [
      { title: "Profile — Lumen" },
      {
        name: "description",
        content: "Manage identity profile and password-protected personal document vault.",
      },
      { property: "og:title", content: "Profile — Lumen" },
      {
        property: "og:description",
        content: "Manage identity profile and password-protected personal document vault.",
      },
    ],
  }),
  component: ProfilePage,
});

function computeRealUserStats(uid: string) {
  if (typeof window === "undefined") {
    return { friendsCount: 0, postsCount: 0 };
  }
  let friendsCount = 0;
  let postsCount = 0;

  try {
    const directChatIds = new Set<string>();

    const rawChats = window.localStorage.getItem(`lumen.chats.${uid}`);
    if (rawChats) {
      const chats = JSON.parse(rawChats);
      if (Array.isArray(chats)) {
        for (const c of chats) {
          if (!c.isGroup && c.id) {
            directChatIds.add(c.id);
          }
        }
      }
    }

    const rawReqs = window.localStorage.getItem(`lumen.requests.${uid}`);
    if (rawReqs) {
      const reqs = JSON.parse(rawReqs);
      if (Array.isArray(reqs)) {
        for (const r of reqs) {
          if (r.status === "accepted") {
            const friendId = r.fromUid === uid ? r.toUid || r.toLumenId : r.fromUid || r.fromLumenId;
            if (friendId) directChatIds.add(friendId);
          }
        }
      }
    }

    const rawInboxFreq = window.localStorage.getItem("lumen.inbox.localFriendRequests");
    if (rawInboxFreq) {
      const inboxReqs = JSON.parse(rawInboxFreq);
      if (Array.isArray(inboxReqs)) {
        for (const r of inboxReqs) {
          if (r.status === "accepted") {
            const friendId = r.fromUid === uid ? r.toUid || r.toLumenId : r.fromUid || r.fromLumenId;
            if (friendId) directChatIds.add(friendId);
          }
        }
      }
    }

    friendsCount = directChatIds.size;
  } catch {
    friendsCount = 0;
  }

  try {
    const rawUserPosts = window.localStorage.getItem(`lumen.posts.${uid}`);
    if (rawUserPosts) {
      const userPosts = JSON.parse(rawUserPosts);
      if (Array.isArray(userPosts)) {
        postsCount += userPosts.length;
      }
    } else {
      const rawAllPosts = window.localStorage.getItem("lumen.posts");
      if (rawAllPosts) {
        const allPosts = JSON.parse(rawAllPosts);
        if (Array.isArray(allPosts)) {
          postsCount += allPosts.filter((p: any) => p?.authorUid === uid || p?.uid === uid).length;
        }
      }
    }

    const rawAnnouncements = window.localStorage.getItem("lumen.inbox.customAnnouncements");
    if (rawAnnouncements) {
      const announcements = JSON.parse(rawAnnouncements);
      if (Array.isArray(announcements)) {
        postsCount += announcements.filter(
          (a: any) => a?.authorUid === uid || a?.authorId === uid,
        ).length;
      }
    }
  } catch {
    postsCount = 0;
  }

  return { friendsCount, postsCount };
}

function ProfilePage() {
  const { user } = useAuthState();
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const effectiveUid = user?.uid || "usr_guest_profile";
  const currentUsername = user?.lumenId || "nagaraj_98";
  const currentDisplayName = user?.name || "Nagaraj P S";
  const currentEmail = user?.email || "user@lumen.app";

  // Profile states
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [editName, setEditName] = useState(currentDisplayName);
  const [editUsername, setEditUsername] = useState(currentUsername);
  const [editPhotoURL, setEditPhotoURL] = useState(user?.photoURL || "");
  const [editAbout, setEditAbout] = useState(() => {
    if (user?.about) return user.about;
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(`lumen.profile.about.${effectiveUid}`) || "";
    }
    return "";
  });
  const [availability, setAvailability] = useState<UsernameAvailabilityStatus | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setEditName(user.name);
      setEditUsername(user.lumenId);
      setEditPhotoURL(user.photoURL || "");
      setEditAbout(
        user.about ||
          (typeof window !== "undefined"
            ? window.localStorage.getItem(`lumen.profile.about.${user.uid}`) || ""
            : ""),
      );
    }
  }, [user?.uid, user?.name, user?.lumenId, user?.photoURL, user?.about]);

  // Secondary Vault Password states
  const [vaultHasPass, setVaultHasPass] = useState<boolean>(false);
  const [secondaryVerified, setSecondaryVerified] = useState<boolean>(false);
  const [vaultModalOpen, setVaultModalOpen] = useState<boolean>(false);
  const [cloudUploadModalOpen, setCloudUploadModalOpen] = useState<boolean>(false);
  const [renameFolderModalOpen, setRenameFolderModalOpen] = useState<boolean>(false);
  const [changingVaultPass, setChangingVaultPass] = useState(false);
  const [setupPassInput, setSetupPassInput] = useState("");
  const [setupPassConfirm, setSetupPassConfirm] = useState("");
  const [showSetupPass, setShowSetupPass] = useState(false);

  // Auto-lock vault on refresh, window blur, or browser tab switch
  useEffect(() => {
    setSecondaryVerified(false);
    setVaultModalOpen(false);

    const handleLock = () => {
      setSecondaryVerified(false);
      setVaultModalOpen(false);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setSecondaryVerified(false);
        setVaultModalOpen(false);
      }
    };

    window.addEventListener("blur", handleLock);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("blur", handleLock);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Secondary Password Verification Modal state (for View, Download, Upload & Unlock triggers)
  const [pendingSecureAction, setPendingSecureAction] = useState<{
    type: "view" | "download" | "upload" | "unlock";
    doc?: StoredVaultDocument;
    uploadDef?: VaultDocumentDefinition;
    existingDoc?: StoredVaultDocument;
  } | null>(null);
  const [verifyPassInput, setVerifyPassInput] = useState("");
  const [showVerifyPass, setShowVerifyPass] = useState(false);

  // Documents state
  const [personalDetails, setPersonalDetails] = useState<PersonalDetailsRecord>(() =>
    loadPersonalDetails(effectiveUid, currentDisplayName),
  );
  const [vaultDocs, setVaultDocs] = useState<StoredVaultDocument[]>(() =>
    loadVaultDocuments(effectiveUid, currentUsername),
  );

  // Real stats calculation (Friends and Posts)
  const realStats = useMemo(() => {
    return computeRealUserStats(effectiveUid);
  }, [effectiveUid, user?.uid]);

  // Google Drive & Cloud Uploading state
  const [driveConnected, setDriveConnected] = useState<boolean>(() =>
    Boolean(getDriveAccessToken()),
  );
  const [driveEmail, setDriveEmail] = useState<string | null>(() => getDriveConnectedEmail());
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [drivePopoverOpen, setDrivePopoverOpen] = useState(false);

  const [cloudFolderName, setCloudFolderName] = useState<string>(() =>
    getCustomCloudFolderName(effectiveUid, formatVaultFolderName(currentUsername)),
  );
  const [isEditingFolderName, setIsEditingFolderName] = useState<boolean>(false);
  const [renameFolderInput, setRenameFolderInput] = useState<string>("");
  const [cloudFiles, setCloudFiles] = useState<CloudUploadedItem[]>(() =>
    loadCloudFiles(effectiveUid),
  );
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [uploadingCloudFiles, setUploadingCloudFiles] = useState<boolean>(false);
  const cloudFileInputRef = useRef<HTMLInputElement>(null);
  const cloudFolderInputRef = useRef<HTMLInputElement>(null);

  // Cloud folder rename handler
  const handleRenameFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = renameFolderInput.trim();
    if (!clean) {
      toast.error("Folder name cannot be empty");
      return;
    }
    setCloudFolderName(clean);
    setCustomCloudFolderName(effectiveUid, clean);
    setIsEditingFolderName(false);
    setRenameFolderModalOpen(false);
    toast.success(`Cloud folder renamed to "${clean}"`);
  };

  // Generic cloud file and folder upload handler
  const handleCloudFilesUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setUploadingCloudFiles(true);
    try {
      const newItems: CloudUploadedItem[] = [];
      const token = getDriveAccessToken();

      for (const file of files) {
        const relPath = (file as any).webkitRelativePath || file.name;
        let driveFileId: string | undefined;
        let webViewLink: string | undefined;

        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = () => resolve("");
          reader.readAsDataURL(file);
        });

        if (driveConnected && token) {
          try {
            const driveResult = await uploadGenericFileToGoogleDrive({
              file,
              folderName: cloudFolderName,
              relativePath: relPath,
              accessToken: token,
            });
            driveFileId = driveResult.driveFileId;
            webViewLink = driveResult.webViewLink;
          } catch (driveErr) {
            console.warn("Drive sync failed for file:", file.name, driveErr);
          }
        }

        newItems.push({
          id: `cloud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          sizeBytes: file.size,
          sizeFormatted: formatFileSize(file.size),
          mimeType: file.type || "application/octet-stream",
          folderName: cloudFolderName,
          relativePath: relPath,
          driveFileId,
          webViewLink,
          uploadedAtIso: new Date().toISOString(),
          dataUrl,
          syncedToDrive: Boolean(driveFileId),
        });
      }

      const updated = [...newItems, ...cloudFiles];
      setCloudFiles(updated);
      saveCloudFiles(effectiveUid, updated);
      toast.success(
        `Uploaded ${files.length} item${files.length > 1 ? "s" : ""} to "${cloudFolderName}"`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cloud upload failed");
    } finally {
      setUploadingCloudFiles(false);
    }
  };

  const handleCloudDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleCloudFilesUpload(e.dataTransfer.files);
    }
  };

  const handleCloudFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleCloudFilesUpload(e.target.files);
      e.target.value = "";
    }
  };

  const handleCloudFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleCloudFilesUpload(e.target.files);
      e.target.value = "";
    }
  };

  const handleDeleteCloudItem = async (id: string) => {
    const item = cloudFiles.find((f) => f.id === id);
    if (!item) return;

    const next = cloudFiles.filter((f) => f.id !== id);
    setCloudFiles(next);
    saveCloudFiles(effectiveUid, next);

    if (item.driveFileId && driveConnected) {
      try {
        await deleteVaultDocumentFromGoogleDrive(item.driveFileId);
      } catch {
        // Ignore
      }
    }
    toast.success(`Removed ${item.name}`);
  };

  const handleDownloadCloudItem = (item: CloudUploadedItem) => {
    if (item.dataUrl) {
      const link = document.createElement("a");
      link.href = item.dataUrl;
      link.download = item.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (item.webViewLink) {
      window.open(item.webViewLink, "_blank");
    }
  };

  // Upload modal state
  const [activeUploadDef, setActiveUploadDef] = useState<VaultDocumentDefinition | null>(null);
  const [customDocTitle, setCustomDocTitle] = useState("");
  const [docNumberInput, setDocNumberInput] = useState("");
  const [docHolderInput, setDocHolderInput] = useState("");
  const [docIssueDate, setDocIssueDate] = useState("");
  const [docExpiryDate, setDocExpiryDate] = useState("");
  const [docNotes, setDocNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileDataUrl, setSelectedFileDataUrl] = useState<string>("");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [confirmOverwritePending, setConfirmOverwritePending] = useState<boolean>(false);

  // In-App Document Viewer Modal state
  const [viewingDoc, setViewingDoc] = useState<StoredVaultDocument | null>(null);
  const [viewerZoom, setViewerZoom] = useState<number>(1);

  // Delete modal state
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<StoredVaultDocument | null>(null);

  useEffect(() => {
    const exists = hasVaultPassword(effectiveUid);
    setVaultHasPass(exists);
    setPersonalDetails(loadPersonalDetails(effectiveUid, currentDisplayName));
    setVaultDocs(loadVaultDocuments(effectiveUid, currentUsername));
  }, [effectiveUid, currentDisplayName, currentUsername]);

  const driveFolderName = useMemo(
    () => formatVaultFolderName(editUsername || currentUsername),
    [editUsername, currentUsername],
  );

  // Avatar upload
  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Please select an image smaller than 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditPhotoURL(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Save Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = editName.trim();
    if (!cleanName) {
      toast.error("Please enter your display name");
      return;
    }

    setSavingProfile(true);
    try {
      const check = await checkUsernameAvailability(editUsername, effectiveUid, cleanName);
      setAvailability(check);
      if (!check.available) {
        toast.error(check.message);
        setSavingProfile(false);
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(`lumen.profile.about.${effectiveUid}`, editAbout.trim());
      }

      if (user) {
        await updateUserProfile({
          name: cleanName,
          lumenId: check.normalized,
          photoURL: editPhotoURL,
          about: editAbout.trim(),
        });
      }

      // Automatically update all stored vault document filenames to match the new `<username>_doc` prefix
      const updatedDocs = vaultDocs.map((item) => {
        const renamed = formatVaultDocumentFileName(
          check.normalized,
          item.docKey,
          item.originalFileName || item.renamedFileName,
          item.customTitle,
        );
        return {
          ...item,
          driveFolderName: formatVaultFolderName(check.normalized),
          baseFileName: renamed.baseName,
          renamedFileName: renamed.fullFileName,
        };
      });
      setVaultDocs(updatedDocs);
      saveVaultDocuments(effectiveUid, updatedDocs);

      toast.success(`Profile updated · ID: ${check.normalized}`);
      setIsEditingProfile(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  // Secondary Password Setup / Change
  const handleSetVaultPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (setupPassInput.trim().length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    if (setupPassConfirm !== setupPassInput) {
      toast.error("Password confirmation does not match");
      return;
    }
    setVaultPassword(effectiveUid, setupPassInput);
    setVaultHasPass(true);
    setSecondaryVerified(true);
    setVaultModalOpen(true);
    setChangingVaultPass(false);
    setSetupPassInput("");
    setSetupPassConfirm("");
    toast.success("Secondary vault password saved & unlocked");
  };

  // Secondary Password Verification Check
  const handleSecondaryPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyVaultPassword(effectiveUid, verifyPassInput)) {
      toast.error("Incorrect secondary password");
      return;
    }

    setSecondaryVerified(true);
    setVaultModalOpen(true);
    const action = pendingSecureAction;
    setPendingSecureAction(null);
    setVerifyPassInput("");
    toast.success("Document Vault unlocked");

    if (action) {
      if (action.type === "view" && action.doc) {
        setViewingDoc(action.doc);
        setViewerZoom(1);
      } else if (action.type === "download" && action.doc) {
        triggerVaultDocumentDownload(action.doc);
        toast.success(`Downloading ${action.doc.renamedFileName}`);
      } else if (action.type === "upload" && action.uploadDef) {
        setActiveUploadDef(action.uploadDef);
        setCustomDocTitle(action.existingDoc?.customTitle || "");
        setDocNumberInput(action.existingDoc?.documentNumber || "");
        setDocHolderInput(
          action.existingDoc?.holderName || personalDetails.fullName || editName || currentDisplayName,
        );
        setDocIssueDate(action.existingDoc?.issueDate || "");
        setDocExpiryDate(action.existingDoc?.expiryDate || "");
        setDocNotes(action.existingDoc?.notes || "");
        setSelectedFile(null);
        setSelectedFileDataUrl(action.existingDoc?.dataUrl || "");
        setConfirmOverwritePending(false);
      }
    }
  };

  // Secure View Action Trigger
  const handleSecureView = (doc: StoredVaultDocument) => {
    if (!secondaryVerified) {
      if (!vaultHasPass) {
        toast.info("Please set a secondary password to protect your vault before viewing.");
        setChangingVaultPass(true);
        return;
      }
      setPendingSecureAction({ type: "view", doc });
      setVerifyPassInput("");
      return;
    }
    setViewingDoc(doc);
    setViewerZoom(1);
  };

  // Secure Download Action Trigger
  const handleSecureDownload = (doc: StoredVaultDocument) => {
    if (!secondaryVerified) {
      if (!vaultHasPass) {
        toast.info("Please set a secondary password to protect your vault before downloading.");
        setChangingVaultPass(true);
        return;
      }
      setPendingSecureAction({ type: "download", doc });
      setVerifyPassInput("");
      return;
    }
    triggerVaultDocumentDownload(doc);
    toast.success(`Downloading ${doc.renamedFileName}`);
  };

  // Delete Action Trigger with lock guard
  const handleRequestDeleteDoc = (doc: StoredVaultDocument) => {
    if (!secondaryVerified) {
      if (!vaultHasPass) {
        toast.info("Please set a secondary password to manage your vault.");
        setChangingVaultPass(true);
        return;
      }
      setPendingSecureAction({ type: "unlock" });
      setVerifyPassInput("");
      return;
    }
    setConfirmDeleteDoc(doc);
  };

  // Google Drive Authentication & Folder Creation
  const handleConnectGoogleDrive = async () => {
    setSyncingDrive(true);
    try {
      const res = await connectGoogleAccountForDrive();
      setDriveConnected(true);
      setDriveEmail(res.email);
      const activeUser = sanitizeUsernameId(editUsername || currentUsername);
      const folder = await ensureDriveUserDocFolder(activeUser, res.accessToken);
      toast.success(`Connected to Google Drive · Folder: ${folder.folderName}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Google Drive connection was cancelled or failed",
      );
    } finally {
      setSyncingDrive(false);
    }
  };

  const openDocumentUploadModal = (def: VaultDocumentDefinition, existing?: StoredVaultDocument) => {
    if (!secondaryVerified) {
      if (!vaultHasPass) {
        toast.info("Please set a secondary password first to lock and protect your vault.");
        setChangingVaultPass(true);
        return;
      }
      setPendingSecureAction({ type: "upload", uploadDef: def, existingDoc: existing });
      setVerifyPassInput("");
      return;
    }

    setActiveUploadDef(def);
    setCustomDocTitle(existing?.customTitle || "");
    setDocNumberInput(existing?.documentNumber || "");
    setDocHolderInput(
      existing?.holderName || personalDetails.fullName || editName || currentDisplayName,
    );
    setDocIssueDate(existing?.issueDate || "");
    setDocExpiryDate(existing?.expiryDate || "");
    setDocNotes(existing?.notes || "");
    setSelectedFile(null);
    setSelectedFileDataUrl(existing?.dataUrl || "");
    setConfirmOverwritePending(false);
  };

  const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Document file must be under 8 MB");
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSelectedFileDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const executeSaveAndUploadDocument = async () => {
    if (!secondaryVerified) {
      toast.error("Document Vault is locked. Please unlock it with your secondary password.");
      return;
    }
    if (!activeUploadDef) return;
    const activeUser = sanitizeUsernameId(editUsername || currentUsername);
    const folderName = formatVaultFolderName(activeUser);
    const existingDoc =
      activeUploadDef.key === "private_doc"
        ? undefined
        : vaultDocs.find((d) => d.docKey === activeUploadDef.key);

    if (existingDoc && !confirmOverwritePending) {
      setConfirmOverwritePending(true);
      return;
    }

    setUploadingDoc(true);
    try {
      const origName = selectedFile?.name || `${activeUploadDef.fileSuffix}.svg`;
      const naming = formatVaultDocumentFileName(
        activeUser,
        activeUploadDef.key,
        origName,
        customDocTitle || undefined,
      );

      const finalHolder =
        docHolderInput.trim() || personalDetails.fullName || editName || "Account Holder";
      const finalDocNum = docNumberInput.trim() || "VERIFIED-DOC";

      const dataUrlToSave =
        selectedFileDataUrl ||
        buildDocumentPreviewSvgDataUrl({
          label:
            activeUploadDef.key === "private_doc" && customDocTitle.trim()
              ? customDocTitle.trim()
              : activeUploadDef.label,
          docKey: activeUploadDef.key,
          renamedFileName: naming.fullFileName,
          driveFolderName: folderName,
          holderName: finalHolder,
          documentNumber: finalDocNum,
          issueDate: docIssueDate,
          expiryDate: docExpiryDate,
        });

      let driveFileId = existingDoc?.driveFileId;
      let driveWebViewLink = existingDoc?.driveWebViewLink;
      let syncedToDrive = false;

      const token = getDriveAccessToken();
      if (token) {
        const fileToUpload =
          selectedFile ||
          new File(
            [
              decodeURIComponent(
                dataUrlToSave.replace(/^data:image\/svg\+xml;utf8,/, ""),
              ),
            ],
            `${naming.baseName}.svg`,
            { type: "image/svg+xml" },
          );

        const driveRes = await uploadVaultDocumentToGoogleDrive({
          username: activeUser,
          docKey: activeUploadDef.key,
          ...(customDocTitle.trim() ? { customTitle: customDocTitle.trim() } : {}),
          file: fileToUpload,
          ...(existingDoc?.driveFileId ? { existingDriveFileId: existingDoc.driveFileId } : {}),
          accessToken: token,
        });

        driveFileId = driveRes.driveFileId;
        driveWebViewLink = driveRes.webViewLink;
        syncedToDrive = true;
      }

      const sizeBytes = selectedFile?.size || dataUrlToSave.length;
      const newRecord: StoredVaultDocument = {
        id: existingDoc?.id || `vdoc_${activeUploadDef.key}_${Date.now()}`,
        docKey: activeUploadDef.key,
        label:
          activeUploadDef.key === "private_doc" && customDocTitle.trim()
            ? customDocTitle.trim()
            : activeUploadDef.label,
        ...(customDocTitle.trim() ? { customTitle: customDocTitle.trim() } : {}),
        renamedFileName: naming.fullFileName,
        baseFileName: naming.baseName,
        originalFileName: origName,
        driveFolderName: folderName,
        ...(driveFileId ? { driveFileId } : {}),
        ...(driveWebViewLink ? { driveWebViewLink } : {}),
        mimeType: selectedFile?.type || "image/svg+xml",
        sizeBytes,
        sizeFormatted: formatFileSize(sizeBytes),
        documentNumber: finalDocNum,
        holderName: finalHolder,
        ...(docIssueDate ? { issueDate: docIssueDate } : {}),
        ...(docExpiryDate ? { expiryDate: docExpiryDate } : {}),
        ...(docNotes ? { notes: docNotes } : {}),
        uploadedAtIso: new Date().toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        syncedToDrive,
      };

      const nextDocs = existingDoc
        ? vaultDocs.map((d) => (d.id === existingDoc.id ? newRecord : d))
        : [newRecord, ...vaultDocs];

      setVaultDocs(nextDocs);
      saveVaultDocuments(effectiveUid, nextDocs);
      setActiveUploadDef(null);
      setConfirmOverwritePending(false);

      toast.success(
        syncedToDrive
          ? `Synced to Drive: ${naming.fullFileName}`
          : `Saved: ${naming.fullFileName}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save document");
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleConfirmDeleteDocument = async () => {
    if (!confirmDeleteDoc) return;
    const target = confirmDeleteDoc;
    try {
      if (target.driveFileId && getDriveAccessToken()) {
        await deleteVaultDocumentFromGoogleDrive(target.driveFileId);
      }
    } catch {
      // Ignore Drive deletion failure if already gone
    }
    const nextDocs = vaultDocs.filter((d) => d.id !== target.id);
    setVaultDocs(nextDocs);
    saveVaultDocuments(effectiveUid, nextDocs);
    setConfirmDeleteDoc(null);
    if (viewingDoc?.id === target.id) {
      setViewingDoc(null);
    }
    toast.success(`Removed ${target.renamedFileName}`);
  };

  const handleSavePersonalDetails = (e: React.FormEvent) => {
    e.preventDefault();
    savePersonalDetails(effectiveUid, personalDetails);
    toast.success("Personal details saved");
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
      data-testid="profile-page-root"
      className="glass-scroll flex h-full w-full flex-col overflow-y-auto pl-13 pr-13 py-3 sm:pl-16 sm:pr-16 sm:py-4"
    >
      <div className="mx-auto w-full max-w-4xl space-y-6 pb-12">
        {/* Profile Component (WhatsApp & Instagram Inspired) */}
        <GlassCard variant="panel" padding="md" className="frost-panel relative overflow-visible space-y-6">
          {/* Hero Section: Avatar & Real Instagram/WhatsApp Counters Strip */}
          <div className="flex flex-col items-center pt-2">
            {/* Circular Avatar with Camera overlay (Camera ONLY appears when in edit section) */}
            <div className="relative">
              <div className="rounded-full p-1 bg-gradient-to-tr from-primary/40 via-emerald-500/25 to-primary/50 shadow-md">
                {editPhotoURL ? (
                  <img
                    src={editPhotoURL}
                    alt={editName}
                    referrerPolicy="no-referrer"
                    className="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover border-2 border-glass-edge"
                  />
                ) : (
                  <div className="btn-ink flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full text-2xl font-bold shadow-sm">
                    {(editName?.[0] || "U").toUpperCase()}
                  </div>
                )}
              </div>

              {/* Camera Icon Button: ONLY in edit section */}
              {isEditingProfile && (
                <button
                  type="button"
                  onClick={() => avatarFileInputRef.current?.click()}
                  aria-label="Upload profile photo"
                  title="Change photo"
                  className="btn-ink liquid-press absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background shadow-md hover:scale-105 transition-transform"
                >
                  <Camera className="h-4 w-4" />
                </button>
              )}

              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFileSelect}
                className="hidden"
              />
            </div>

            {/* In Edit Section: Reset photo chip if custom photo exists */}
            {isEditingProfile && editPhotoURL && (
              <button
                type="button"
                onClick={() => setEditPhotoURL("")}
                className="mt-2 text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                Reset photo
              </button>
            )}

            {/* Heading Display Name & Handle */}
            <div className="mt-3 text-center">
              <h1 className="text-lg font-bold text-foreground tracking-tight sm:text-xl">
                {editName || "User"}
              </h1>
              <p className="font-mono text-xs text-muted-foreground">
                @{editUsername || "username"}
              </p>
              {/* Clean About display in view mode */}
              {!isEditingProfile && editAbout.trim() && (
                <div className="mt-2 text-xs text-foreground/80 max-w-sm px-3.5 py-1 rounded-xl border border-glass-edge/40 bg-glass/20 italic">
                  "{editAbout}"
                </div>
              )}
            </div>

            {/* Real Counters Strip: Friends & Posts (Real calculated numbers, no fake datas) */}
            <div className="mt-4 flex items-center justify-center gap-8 rounded-2xl border border-glass-edge bg-glass/40 px-8 py-2.5 text-center shadow-xs">
              <div>
                <span className="block text-base font-bold text-foreground font-mono">
                  {realStats.friendsCount}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">Friends</span>
              </div>
              <div className="h-6 w-px bg-glass-edge" />
              <div>
                <span className="block text-base font-bold text-foreground font-mono">
                  {realStats.postsCount}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">Posts</span>
              </div>
            </div>
          </div>

          {/* Form / Details Section */}
          {isEditingProfile ? (
            /* WhatsApp-Style Form Fields (Edit mode) */
            <form onSubmit={handleSaveProfile} className="space-y-4 pt-1">
              <div className="space-y-3.5 rounded-2xl border border-glass-edge bg-glass/30 p-4">
                {/* Name Field */}
                <div className="space-y-1">
                  <label
                    htmlFor="profile-display-name"
                    className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Name</span>
                  </label>
                  <div className="relative">
                    <input
                      id="profile-display-name"
                      data-testid="profile-name-input"
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Your full display name"
                      className="glass-input h-10 w-full rounded-xl pl-3.5 pr-9 text-xs outline-none focus:ring-1 focus:ring-primary/40 font-sans"
                    />
                    <Pencil className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    This name will be visible to your contacts and team members.
                  </p>
                </div>

                {/* About Field */}
                <div className="space-y-1">
                  <label
                    htmlFor="profile-about"
                    className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>About</span>
                  </label>
                  <div className="relative">
                    <input
                      id="profile-about"
                      data-testid="profile-about-input"
                      type="text"
                      value={editAbout}
                      onChange={(e) => setEditAbout(e.target.value)}
                      placeholder="e.g. 🌊 Be CLaSsIc"
                      className="glass-input h-10 w-full rounded-xl pl-3.5 pr-9 text-xs outline-none focus:ring-1 focus:ring-primary/40 font-sans"
                    />
                    <Pencil className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Your personal status and bio description.
                  </p>
                </div>

                {/* Username ID Field */}
                <div className="space-y-1 pt-1">
                  <UniqueUsernameField
                    value={editUsername}
                    onChange={setEditUsername}
                    currentUid={effectiveUid}
                    seedHint={editName || currentEmail.split("@")[0] || "lumen"}
                    onAvailabilityChange={setAvailability}
                    compact
                  />
                </div>

                {/* Account Email (WhatsApp Phone/Account item) */}
                <div className="flex items-center justify-between rounded-xl border border-glass-edge bg-glass/40 px-3.5 py-2.5 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="block text-[11px] text-muted-foreground">Account Email</span>
                      <span className="font-mono text-xs text-foreground truncate max-w-[220px]">
                        {currentEmail}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(currentEmail);
                      toast.success("Email copied to clipboard");
                    }}
                    title="Copy email"
                    className="glass-pill liquid-press rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  data-testid="save-profile-btn"
                  disabled={savingProfile || availability?.available === false}
                  className="btn-ink liquid-press flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-xs font-semibold disabled:opacity-50 shadow-md"
                >
                  <Check className="h-4 w-4" />
                  <span>{savingProfile ? "Saving…" : "Save Changes"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="glass-pill liquid-press rounded-full px-5 h-10 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            /* View Mode: Clean identity summary cards & Edit button */
            <div className="space-y-4 pt-1">
              <div className="space-y-2.5 rounded-2xl border border-glass-edge bg-glass/30 p-4">
                <div className="flex items-center justify-between border-b border-glass-edge/50 pb-2.5 text-xs">
                  <span className="text-muted-foreground">Username ID</span>
                  <span className="font-mono font-medium text-foreground">@{editUsername || currentUsername}</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <span className="text-muted-foreground">Account Email</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-foreground">{currentEmail}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(currentEmail);
                        toast.success("Email copied to clipboard");
                      }}
                      title="Copy email"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Instagram-style Edit Profile Pill Button */}
              <button
                type="button"
                onClick={() => setIsEditingProfile(true)}
                className="btn-ink liquid-press flex h-9.5 w-full items-center justify-center gap-2 rounded-full text-xs font-semibold shadow-sm"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit Profile</span>
              </button>
            </div>
          )}
        </GlassCard>

        {/* Two-Column Grid: Cloud Uploading (Left) & Document Vault (Right) Side-by-Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* LEFT: Cloud Uploading Card */}
          <GlassCard variant="panel" padding="md" className="frost-panel flex flex-col justify-between space-y-4">
            {/* Header: Title "Cloud Uploading", status & icon */}
            <div className="flex items-center gap-3">
              <div className="bg-pearl flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-glass-edge">
                <CloudUpload className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-foreground tracking-tight">Cloud Uploading</h2>
                <p className="font-mono text-xs text-muted-foreground truncate">
                  {driveConnected ? `Connected · ${driveEmail || "Google Drive"}` : "Sync with Google Drive"}
                </p>
              </div>
            </div>

            {/* Action Buttons: 1st Upload, right side Connect, right side Rename side-by-side with spacious arrangement */}
            <div className="flex items-center gap-2.5 sm:gap-3 pt-1">
              <button
                type="button"
                onClick={() => setCloudUploadModalOpen(true)}
                data-testid="open-cloud-upload-btn"
                className="btn-ink liquid-press flex h-9.5 flex-1 items-center justify-center gap-1.5 rounded-full px-3 sm:px-4 text-xs font-semibold shadow-sm"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Upload</span>
              </button>

              <button
                type="button"
                onClick={handleConnectGoogleDrive}
                disabled={syncingDrive}
                data-testid="connect-google-drive-btn"
                className="glass-pill liquid-press flex h-9.5 flex-1 items-center justify-center gap-1.5 rounded-full px-3 sm:px-4 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge"
              >
                <HardDrive className={`h-3.5 w-3.5 ${syncingDrive ? "animate-spin" : ""}`} />
                <span>{syncingDrive ? "Connecting…" : driveConnected ? "Sync" : "Connect"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRenameFolderInput(cloudFolderName);
                  setRenameFolderModalOpen(true);
                }}
                data-testid="rename-cloud-folder-btn"
                className="glass-pill liquid-press flex h-9.5 flex-1 items-center justify-center gap-1.5 rounded-full px-3 sm:px-4 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Rename</span>
              </button>
            </div>
          </GlassCard>

          {/* RIGHT: Document Vault Card */}
          <GlassCard variant="panel" padding="md" className="frost-panel flex flex-col justify-between space-y-4">
            {/* Header: Document Vault, status badge & icon */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-pearl flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-glass-edge">
                  {secondaryVerified ? (
                    <Unlock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <FolderLock className="h-5 w-5 text-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">Document Vault</h2>
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
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Encrypted Personal & Government IDs
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons: Unlock Vault (or Open Vault and Lock) side-by-side with spacious arrangement */}
            <div className="flex items-center gap-2.5 sm:gap-3 pt-1">
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
                  className="btn-ink liquid-press flex h-9.5 flex-1 items-center justify-center gap-2 rounded-full px-4 text-xs font-semibold shadow-sm"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  <span>Unlock Vault</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setVaultModalOpen(true)}
                    data-testid="open-vault-modal-btn"
                    className="btn-ink liquid-press flex h-9.5 flex-1 items-center justify-center gap-2 rounded-full px-4 text-xs font-semibold shadow-sm"
                  >
                    <FolderLock className="h-3.5 w-3.5" />
                    <span>Open Vault</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSecondaryVerified(false);
                      setVaultModalOpen(false);
                      toast.success("Document Vault locked");
                    }}
                    data-testid="lock-vault-btn"
                    className="glass-pill liquid-press flex h-9.5 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>Lock</span>
                  </button>
                </>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* CLOUD UPLOADING POPUP MODAL (Settings animation, centered in card/screen) */}
      <Dialog.Root open={cloudUploadModalOpen} onOpenChange={setCloudUploadModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[75]" />
          <Dialog.Content className="settings-popover glass fixed left-1/2 top-1/2 z-[80] w-[min(94vw,38rem)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] p-6 text-foreground outline-none shadow-2xl border border-glass-edge space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-glass-edge pb-3">
              <div className="flex items-center gap-3">
                <div className="bg-pearl flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-glass-edge">
                  <CloudUpload className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Dialog.Title className="text-base font-bold text-foreground tracking-tight">
                    Cloud Uploading
                  </Dialog.Title>
                  <p className="font-mono text-xs text-muted-foreground">
                    {driveConnected ? `Connected · ${driveEmail || "Google Drive"}` : "Sync with Google Drive"}
                  </p>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-glass"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {/* Uploading Section: Drag and Drop Zone & Action Buttons (Screenshot 1 & 2 content) */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
              }}
              onDrop={handleCloudDrop}
              className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 ${
                isDraggingOver
                  ? "border-primary bg-primary/10 scale-[1.01]"
                  : "border-glass-edge bg-glass/20 hover:border-foreground/30 hover:bg-glass/30"
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary mb-3">
                <CloudUpload className={`h-6 w-6 ${uploadingCloudFiles ? "animate-bounce" : ""}`} />
              </div>

              <p className="text-sm font-semibold text-foreground">
                Drag & drop files or folder here
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Upload documents, images, archives, or entire directories to your{" "}
                <span className="font-sans font-semibold text-foreground">{cloudFolderName}</span> cloud folder.
              </p>

              {/* Buttons: Select Files & Select Folder */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => cloudFileInputRef.current?.click()}
                  disabled={uploadingCloudFiles}
                  className="btn-ink liquid-press flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold shadow-sm"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Select Files</span>
                </button>

                <button
                  type="button"
                  onClick={() => cloudFolderInputRef.current?.click()}
                  disabled={uploadingCloudFiles}
                  className="glass-pill liquid-press flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-foreground hover:bg-glass-strong"
                >
                  <FolderUp className="h-3.5 w-3.5" />
                  <span>Select Folder</span>
                </button>

                <input
                  ref={cloudFileInputRef}
                  type="file"
                  multiple
                  onChange={handleCloudFileInputChange}
                  className="hidden"
                />
                <input
                  ref={cloudFolderInputRef}
                  type="file"
                  // @ts-expect-error webkitdirectory is standard in HTML5 directory picker
                  webkitdirectory=""
                  directory=""
                  multiple
                  onChange={handleCloudFolderInputChange}
                  className="hidden"
                />
              </div>

              {uploadingCloudFiles && (
                <div className="mt-4 flex items-center gap-2 text-xs font-sans text-primary animate-pulse">
                  <CloudUpload className="h-4 w-4 animate-spin" />
                  <span>Uploading to cloud storage…</span>
                </div>
              )}
            </div>

            {/* Cloud Uploaded Files List */}
            {cloudFiles.length > 0 && (
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Uploaded Cloud Items ({cloudFiles.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCloudFiles([]);
                      saveCloudFiles(effectiveUid, []);
                      toast.success("Cloud upload list cleared");
                    }}
                    className="hover:text-destructive text-[11px]"
                  >
                    Clear List
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {cloudFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-glass-edge bg-glass/30 p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{file.name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground truncate">
                            {file.relativePath && file.relativePath !== file.name
                              ? `${file.relativePath} · `
                              : ""}
                            {file.sizeFormatted} · {file.folderName}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            title="Open in Google Drive"
                            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {file.dataUrl && (
                          <button
                            type="button"
                            onClick={() => handleDownloadCloudItem(file)}
                            title="Download file"
                            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteCloudItem(file.id)}
                          title="Delete file"
                          className="rounded-full p-1.5 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* RENAME CLOUD FOLDER POPUP MODAL (Settings animation) */}
      <Dialog.Root open={renameFolderModalOpen} onOpenChange={setRenameFolderModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[85]" />
          <Dialog.Content className="settings-popover glass fixed left-1/2 top-1/2 z-[90] w-[min(90vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] p-5 text-foreground outline-none shadow-2xl border border-glass-edge space-y-4">
            <div className="flex items-center justify-between border-b border-glass-edge pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Pencil className="h-4.5 w-4.5" />
                </div>
                <div>
                  <Dialog.Title className="text-base font-semibold text-foreground">
                    Rename Cloud Folder
                  </Dialog.Title>
                  <p className="text-xs text-muted-foreground">Change your cloud upload directory</p>
                </div>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleRenameFolderSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">
                  Folder Name
                </label>
                <div className="glass-input flex h-10 items-center gap-2 rounded-xl px-3">
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                  <input
                    type="text"
                    value={renameFolderInput}
                    onChange={(e) => setRenameFolderInput(e.target.value)}
                    placeholder="e.g. nagaraj_98_doc"
                    className="w-full bg-transparent text-xs font-sans font-semibold outline-none"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRenameFolderModalOpen(false)}
                  className="glass-input h-9 flex-1 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-ink liquid-press h-9 flex-1 rounded-full text-xs font-semibold shadow-sm"
                >
                  Save Folder
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* DOCUMENT VAULT HUGE POPUP MODAL (Unlocked via password, settings animation) */}
      <Dialog.Root open={vaultModalOpen && secondaryVerified} onOpenChange={setVaultModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[75]" />
          <Dialog.Content className="settings-popover glass fixed left-1/2 top-1/2 z-[80] w-[min(96vw,68rem)] max-h-[88vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2.5rem] p-6 sm:p-7 text-foreground outline-none shadow-2xl border border-glass-edge space-y-6">
            {/* Header: Document Vault (NO driveFolderName below title!) */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-glass-edge pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-pearl flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-glass-edge">
                  <Unlock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Dialog.Title className="text-base font-semibold text-foreground">
                      Document Vault
                    </Dialog.Title>
                    <span
                      data-testid="vault-lock-status-badge"
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    >
                      Verified
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Secure identity documents & personal records
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const privDef = VAULT_DOCUMENT_TYPES.find((d) => d.key === "private_doc");
                    if (privDef) openDocumentUploadModal(privDef);
                  }}
                  data-testid="add-private-doc-btn"
                  className="glass-pill liquid-press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground hover:bg-glass-strong"
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
                  className="glass-pill liquid-press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground hover:bg-glass-strong"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Change Password</span>
                </button>

                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-glass"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            {/* Document Slots Grid - Responsive 3-Column Balanced Card Layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleDocTypes
                .filter((d) => d.key !== "private_doc")
                .map((def) => {
                  const stored = vaultDocs.find((doc) => doc.docKey === def.key);

                  return (
                    <div
                      key={def.key}
                      data-testid={`vault-doc-card-${def.key}`}
                      className={`flex flex-col justify-between rounded-2xl border border-glass-edge p-4.5 min-h-[160px] transition-all ${
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
                              <h3 className="text-sm font-semibold tracking-tight text-foreground truncate">{def.label}</h3>
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
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">ID:</span>
                              <span className="font-mono font-medium text-foreground tabular-nums">
                                {stored.documentNumber}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Holder:</span>
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
                    </div>
                  );
                })}

              {/* Custom Private Documents */}
              {customPrivateDocs.map((privDoc) => (
                <div
                  key={privDoc.id}
                  className="flex flex-col justify-between rounded-2xl border border-glass-edge bg-glass-strong p-4.5 min-h-[160px] shadow-sm"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-glass-edge">
                          <FileCheck2 className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold tracking-tight text-foreground truncate">{privDoc.label}</h3>
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
                        <span className="font-mono font-medium text-foreground">
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

                  <div className="mt-3.5 flex items-center gap-1.5 border-t border-glass-edge pt-3">
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
                </div>
              ))}
            </div>

            {/* Personal Details Form inside Vault modal */}
            <form
              onSubmit={handleSavePersonalDetails}
              className="rounded-2xl border border-glass-edge bg-glass/30 p-4 space-y-3.5"
            >
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
                    className="glass-input h-9 w-full rounded-xl px-3 font-mono text-xs outline-none"
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
                    className="glass-input h-9 w-full rounded-xl px-3 font-mono text-xs outline-none"
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
                  className="btn-ink liquid-press rounded-full px-4 py-1.5 text-xs font-medium"
                >
                  Save Details
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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

      {/* SECONDARY PASSWORD VALIDATION MODAL (FOR VIEW & DOWNLOAD) */}
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
            data-testid="in-app-document-viewer"
            aria-describedby="doc-viewer-desc"
            className="settings-popover glass fixed left-1/2 top-1/2 z-[85] flex max-h-[86dvh] w-[min(94vw,48rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[2rem] p-5 text-foreground outline-none shadow-2xl border border-glass-edge sm:p-6"
          >
            {viewingDoc && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-glass-edge pb-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <Dialog.Title className="text-base font-semibold text-foreground sm:text-lg">
                        {viewingDoc.label}
                      </Dialog.Title>
                      <span className="rounded-full bg-glass px-2.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
                        {viewingDoc.renamedFileName}
                      </span>
                    </div>
                    <Dialog.Description id="doc-viewer-desc" className="mt-0.5 text-xs text-muted-foreground">
                      Holder: <strong className="text-foreground">{viewingDoc.holderName}</strong> · ID:{" "}
                      <strong className="font-mono text-foreground">{viewingDoc.documentNumber}</strong>
                    </Dialog.Description>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setViewerZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))}
                      aria-label="Zoom out"
                      title="Zoom out"
                      className="glass-pill flex h-8 w-8 items-center justify-center rounded-full text-foreground"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground px-1">
                      {Math.round(viewerZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewerZoom((z) => Math.min(2, +(z + 0.2).toFixed(2)))}
                      aria-label="Zoom in"
                      title="Zoom in"
                      className="glass-pill flex h-8 w-8 items-center justify-center rounded-full text-foreground"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSecureDownload(viewingDoc)}
                      data-testid="viewer-download-btn"
                      className="btn-ink liquid-press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download</span>
                    </button>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Close viewer"
                        className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                </div>

                {/* Preview Canvas */}
                <div className="glass-scroll mt-4 flex min-h-[300px] flex-1 items-center justify-center overflow-auto rounded-2xl border border-glass-edge bg-black/30 p-4">
                  {viewingDoc.mimeType === "application/pdf" ? (
                    <iframe
                      src={viewingDoc.dataUrl}
                      title={viewingDoc.renamedFileName}
                      className="h-[400px] w-full rounded-xl border-0"
                    />
                  ) : (
                    <img
                      src={viewingDoc.dataUrl}
                      alt={viewingDoc.renamedFileName}
                      style={{
                        transform: `scale(${viewerZoom})`,
                        transformOrigin: "center center",
                      }}
                      className="max-h-[400px] w-auto rounded-xl object-contain shadow-md transition-transform duration-200"
                    />
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground font-mono">
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
                    <Dialog.Description id="upload-doc-desc" className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {
                        formatVaultDocumentFileName(
                          editUsername || currentUsername,
                          activeUploadDef.key,
                          selectedFile?.name,
                          customDocTitle || undefined,
                        ).fullFileName
                      }
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button type="button" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="mt-4 space-y-3.5">
                  {activeUploadDef.key === "private_doc" && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">Document Title</label>
                      <input
                        type="text"
                        value={customDocTitle}
                        onChange={(e) => setCustomDocTitle(e.target.value)}
                        placeholder="e.g. Degree, Insurance"
                        className="glass-input h-9 w-full rounded-xl px-3 text-xs outline-none"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">Document / ID Number</label>
                      <input
                        type="text"
                        value={docNumberInput}
                        onChange={(e) => setDocNumberInput(e.target.value)}
                        placeholder={activeUploadDef.idPlaceholder}
                        className="glass-input h-9 w-full rounded-xl px-3 font-mono text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">Document Holder Name</label>
                      <input
                        type="text"
                        value={docHolderInput}
                        onChange={(e) => setDocHolderInput(e.target.value)}
                        placeholder="Full Name"
                        className="glass-input h-9 w-full rounded-xl px-3 text-xs outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Upload File (PDF / Image)</label>
                    <input
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/svg+xml"
                      onChange={handleDocFileChange}
                      className="glass-input w-full rounded-xl px-3 py-2 text-xs outline-none file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary-foreground"
                    />
                  </div>

                  {confirmOverwritePending && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                      Document already exists. Click Confirm Overwrite to replace.
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveUploadDef(null)}
                      className="glass-input h-9 rounded-full px-4 text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={executeSaveAndUploadDocument}
                      disabled={uploadingDoc}
                      data-testid="confirm-save-doc-btn"
                      className="btn-ink liquid-press inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-medium"
                    >
                      <CloudUpload className="h-3.5 w-3.5" />
                      <span>
                        {uploadingDoc
                          ? "Saving…"
                          : confirmOverwritePending
                            ? "Confirm Overwrite"
                            : "Save Document"}
                      </span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* DELETE CONFIRMATION MODAL */}
      <Dialog.Root open={Boolean(confirmDeleteDoc)} onOpenChange={(o) => !o && setConfirmDeleteDoc(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[85]" />
          <Dialog.Content className="settings-popover glass fixed left-1/2 top-1/2 z-[90] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] p-5 text-foreground outline-none">
            <Dialog.Title className="text-base font-semibold text-foreground">Delete Document?</Dialog.Title>
            <Dialog.Description className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Are you sure you want to permanently remove{" "}
              <strong className="font-mono text-foreground">{confirmDeleteDoc?.renamedFileName}</strong>?
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteDoc(null)}
                className="glass-input h-8.5 rounded-full px-3.5 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDocument}
                className="h-8.5 rounded-full bg-destructive px-3.5 text-xs font-medium text-destructive-foreground"
              >
                Delete
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
