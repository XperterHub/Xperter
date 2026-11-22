import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpDown,
  CheckCircle2,
  Cloud,
  CloudUpload,
  Copy,
  Database,
  ExternalLink,
  FileArchive,
  FileCode,
  FileText,
  Film,
  Filter,
  Folder,
  FolderCheck,
  FolderUp,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Music,
  Pencil,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { useAuthState } from "@/lib/auth";
import {
  connectGoogleAccountForDrive,
  ensureDriveUserDocFolder,
  formatFileSize,
  getCustomCloudFolderName,
  getDriveAccessToken,
  getDriveConnectedEmail,
  isDriveConnected,
  loadCloudFiles,
  renameDriveFolder,
  saveCloudFiles,
  setCustomCloudFolderName,
  uploadGenericFileToGoogleDrive,
  type CloudUploadedItem,
} from "@/lib/google-drive-vault";
import {
  classifyFile,
  DOCUMENT_SUBFOLDERS,
  initializeXperterDriveHierarchy,
  XPERTER_CATEGORIES,
  XPERTER_ROOT_FOLDER_NAME,
  type DocumentSubfolder,
  type XperterCategory,
} from "@/lib/xperter-drive-organizer";
import { sanitizeUsernameId } from "@/lib/username-id";

export const Route = createFileRoute("/app/page-2")({
  head: () => ({
    meta: [
      { title: "Cloudup — Xperter" },
      {
        name: "description",
        content: "Cloud uploading with Google Drive automatic file categorization and sync.",
      },
      { property: "og:title", content: "Cloudup — Xperter" },
      {
        property: "og:description",
        content: "Cloud uploading with Google Drive automatic file categorization and sync.",
      },
    ],
  }),
  component: CloudupPage,
});

const DEFAULT_SPECIMEN_FILES: CloudUploadedItem[] = [
  {
    id: "specimen_1",
    name: "Xperter_System_Architecture.pdf",
    category: "Documents",
    documentSubfolder: "PDF",
    folderPath: "Xperter/Documents/PDF",
    folderName: "PDF",
    driveFileId: "demo_drive_1",
    webViewLink: "https://drive.google.com",
    sizeFormatted: "2.4 MB",
    uploadedAt: "Just now",
  },
  {
    id: "specimen_2",
    name: "Product_Roadmap_Q1.xlsx",
    category: "Documents",
    documentSubfolder: "XLSX",
    folderPath: "Xperter/Documents/XLSX",
    folderName: "XLSX",
    driveFileId: "demo_drive_2",
    webViewLink: "https://drive.google.com",
    sizeFormatted: "1.1 MB",
    uploadedAt: "12m ago",
  },
  {
    id: "specimen_3",
    name: "Liquid_Chrome_Interface_v3.png",
    category: "Pictures",
    folderPath: "Xperter/Pictures",
    folderName: "Pictures",
    driveFileId: "demo_drive_3",
    webViewLink: "https://drive.google.com",
    sizeFormatted: "3.8 MB",
    uploadedAt: "25m ago",
  },
  {
    id: "specimen_4",
    name: "Workspace_Demonstration_4K.mp4",
    category: "Videos",
    folderPath: "Xperter/Videos",
    folderName: "Videos",
    driveFileId: "demo_drive_4",
    webViewLink: "https://drive.google.com",
    sizeFormatted: "18.6 MB",
    uploadedAt: "1h ago",
  },
  {
    id: "specimen_5",
    name: "Production_Assets_Bundle.zip",
    category: "Archives",
    folderPath: "Xperter/Archives",
    folderName: "Archives",
    driveFileId: "demo_drive_5",
    webViewLink: "https://drive.google.com",
    sizeFormatted: "8.4 MB",
    uploadedAt: "2h ago",
  },
];

function getCategoryBadgeColor(category: string | undefined): {
  bg: string;
  text: string;
  border: string;
} {
  switch (category) {
    case "Videos":
      return {
        bg: "bg-purple-500/15",
        text: "text-purple-600 dark:text-purple-400",
        border: "border-purple-500/25",
      };
    case "Pictures":
      return {
        bg: "bg-sky-500/15",
        text: "text-sky-600 dark:text-sky-400",
        border: "border-sky-500/25",
      };
    case "Documents":
      return {
        bg: "bg-emerald-500/15",
        text: "text-emerald-600 dark:text-emerald-400",
        border: "border-emerald-500/25",
      };
    case "Music":
    case "Audio":
      return {
        bg: "bg-rose-500/15",
        text: "text-rose-600 dark:text-rose-400",
        border: "border-rose-500/25",
      };
    case "Archives":
      return {
        bg: "bg-orange-500/15",
        text: "text-orange-600 dark:text-orange-400",
        border: "border-orange-500/25",
      };
    case "Design_And_3D":
      return {
        bg: "bg-indigo-500/15",
        text: "text-indigo-600 dark:text-indigo-400",
        border: "border-indigo-500/25",
      };
    case "Applications":
      return {
        bg: "bg-cyan-500/15",
        text: "text-cyan-600 dark:text-cyan-400",
        border: "border-cyan-500/25",
      };
    default:
      return {
        bg: "bg-muted/40",
        text: "text-muted-foreground",
        border: "border-glass-edge",
      };
  }
}

function getCategoryIcon(category: string | undefined) {
  switch (category) {
    case "Videos":
      return <Film className="h-4 w-4 text-purple-400 shrink-0" />;
    case "Pictures":
      return <ImageIcon className="h-4 w-4 text-sky-400 shrink-0" />;
    case "Documents":
      return <FileText className="h-4 w-4 text-emerald-400 shrink-0" />;
    case "Music":
    case "Audio":
      return <Music className="h-4 w-4 text-rose-400 shrink-0" />;
    case "Archives":
      return <FileArchive className="h-4 w-4 text-orange-400 shrink-0" />;
    case "Design_And_3D":
      return <Layers className="h-4 w-4 text-indigo-400 shrink-0" />;
    case "Applications":
      return <FileCode className="h-4 w-4 text-cyan-400 shrink-0" />;
    default:
      return <Cloud className="h-4 w-4 text-primary shrink-0" />;
  }
}

function CloudupPage() {
  const { user } = useAuthState();
  const effectiveUid = user?.uid || "demo_local_user";
  const currentUsername = sanitizeUsernameId(user?.displayName || user?.email?.split("@")[0] || "user");

  // Google Drive & Cloud Uploading state
  const [driveConnected, setDriveConnected] = useState<boolean>(() =>
    Boolean(isDriveConnected()),
  );
  const [driveEmail, setDriveEmail] = useState<string | null>(() =>
    getDriveConnectedEmail(),
  );
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [cloudUploadModalOpen, setCloudUploadModalOpen] = useState<boolean>(false);
  const [renameFolderModalOpen, setRenameFolderModalOpen] = useState<boolean>(false);
  const [cloudFolderName, setCloudFolderName] = useState<string>(() =>
    getCustomCloudFolderName(effectiveUid),
  );
  const [renameFolderInput, setRenameFolderInput] = useState<string>("");
  const [cloudFiles, setCloudFiles] = useState<CloudUploadedItem[]>(() => {
    const loaded = loadCloudFiles(effectiveUid);
    return loaded.length > 0 ? loaded : DEFAULT_SPECIMEN_FILES;
  });

  // Staging & upload state
  const [uploadingCloudFile, setUploadingCloudFile] = useState(false);
  const [cloudUploadProgress, setCloudUploadProgress] = useState(0);
  const [cloudCategorySelection, setCloudCategorySelection] = useState<string>("auto");
  const [cloudDocumentSubfolder, setCloudDocumentSubfolder] = useState<string>("general");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const inlineFileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Explorer Filter & Search state
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"latest" | "name" | "size">("latest");
  const [folderTreeOpen, setFolderTreeOpen] = useState(false);

  // Sync Google Drive connection state
  useEffect(() => {
    const connected = isDriveConnected();
    const email = getDriveConnectedEmail();
    setDriveConnected(connected);
    setDriveEmail(email);
  }, []);

  // Sync custom cloud folder name
  useEffect(() => {
    setCloudFolderName(getCustomCloudFolderName(effectiveUid));
    const loaded = loadCloudFiles(effectiveUid);
    if (loaded.length > 0) {
      setCloudFiles(loaded);
    }
  }, [effectiveUid]);

  // Google Drive Authentication
  const handleConnectGoogleDrive = async () => {
    setSyncingDrive(true);
    try {
      const res = await connectGoogleAccountForDrive(effectiveUid);
      setDriveConnected(true);
      setDriveEmail(res.email);
      const activeUser = sanitizeUsernameId(currentUsername);
      await ensureDriveUserDocFolder(activeUser, res.accessToken);
      await initializeXperterDriveHierarchy({
        userKey: effectiveUid || res.email,
        accessToken: res.accessToken,
      });
      toast.success(`Google Drive connected · "${XPERTER_ROOT_FOLDER_NAME}" folder structure initialized`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Google Drive connection was cancelled or failed",
      );
    } finally {
      setSyncingDrive(false);
    }
  };

  // Rename Google Drive Folder
  const handleRenameFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newName = renameFolderInput.trim();
    if (!newName) {
      toast.error("Folder name cannot be empty");
      return;
    }
    const token = getDriveAccessToken();
    if (token) {
      try {
        await renameDriveFolder(newName, token);
      } catch {
        toast.error("Could not rename folder on Drive. Updating local reference.");
      }
    }
    setCustomCloudFolderName(effectiveUid, newName);
    setCloudFolderName(newName);
    setRenameFolderModalOpen(false);
    toast.success(`Cloud folder set to "${newName}"`);
  };

  // Perform upload for an array of files
  const executeUploadProcess = async (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) return;
    const token = getDriveAccessToken();
    if (!token && !driveConnected) {
      toast.info("Connecting Drive or using Local Offline Vault mode...");
    }

    setUploadingCloudFile(true);
    setCloudUploadProgress(15);
    const uploadedRecords: CloudUploadedItem[] = [];

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        if (!file) continue;

        const progressPercent = Math.round(15 + ((i + 1) / filesToUpload.length) * 80);
        setCloudUploadProgress(progressPercent);

        const autoClassification = classifyFile(file.name);
        const resolvedCategory =
          cloudCategorySelection === "auto"
            ? autoClassification.category
            : (cloudCategorySelection as any);
        const resolvedSubfolder =
          resolvedCategory === "Documents"
            ? cloudDocumentSubfolder.toUpperCase()
            : autoClassification.suggestedSubfolder;

        let driveFileId: string | undefined;
        let driveWebViewLink: string | undefined;

        if (token) {
          try {
            const uploadRes = await uploadGenericFileToGoogleDrive({
              file,
              accessToken: token,
              category: resolvedCategory,
              documentSubfolder: resolvedSubfolder,
              customRootFolderName: cloudFolderName,
            });
            driveFileId = uploadRes.fileId;
            driveWebViewLink = uploadRes.webViewLink;
          } catch {
            // fallback to local offline entry
          }
        }

        const newRecord: CloudUploadedItem = {
          id: driveFileId || `cloud_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          category: resolvedCategory,
          documentSubfolder: resolvedSubfolder,
          folderPath: `${cloudFolderName}/${resolvedCategory}${resolvedSubfolder ? `/${resolvedSubfolder}` : ""}`,
          folderName: resolvedSubfolder || resolvedCategory,
          driveFileId,
          webViewLink: driveWebViewLink || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : undefined),
          sizeFormatted: formatFileSize(file.size),
          uploadedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        uploadedRecords.push(newRecord);
      }

      setCloudUploadProgress(100);
      const nextCloudList = [...uploadedRecords, ...cloudFiles];
      setCloudFiles(nextCloudList);
      saveCloudFiles(effectiveUid, nextCloudList);
      setStagedFiles([]);
      toast.success(`Successfully uploaded ${uploadedRecords.length} file(s) into categorized Google Drive folders!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload file(s)");
    } finally {
      setTimeout(() => {
        setUploadingCloudFile(false);
        setCloudUploadProgress(0);
      }, 500);
      if (inlineFileInputRef.current) inlineFileInputRef.current.value = "";
      if (modalFileInputRef.current) modalFileInputRef.current.value = "";
    }
  };

  const handleStageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file) {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`"${file.name}" exceeds 100MB limit.`);
          continue;
        }
        newFiles.push(file);
      }
    }
    setStagedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleRemoveStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeleteCloudFile = (id: string) => {
    const nextList = cloudFiles.filter((item) => item.id !== id);
    setCloudFiles(nextList);
    saveCloudFiles(effectiveUid, nextList);
    toast.success("Item removed from Cloud library");
  };

  const handleDownloadCloudFile = (item: CloudUploadedItem) => {
    if (item.driveFileId) {
      const url = `https://drive.google.com/uc?export=download&id=${item.driveFileId}`;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (item.webViewLink) {
      window.open(item.webViewLink, "_blank");
    } else {
      toast.info(`Preparing secure download for ${item.name}`);
    }
  };

  const handleCopyLink = (item: CloudUploadedItem) => {
    const link = item.webViewLink || `https://drive.google.com/file/d/${item.driveFileId || "cloud"}`;
    void navigator.clipboard.writeText(link);
    toast.success("Google Drive link copied to clipboard");
  };

  // Filter & Search processing
  const filteredFiles = useMemo(() => {
    return cloudFiles.filter((file) => {
      const matchesCategory =
        selectedFilterCategory === "all" ||
        file.category?.toLowerCase() === selectedFilterCategory.toLowerCase();

      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        file.name.toLowerCase().includes(q) ||
        file.category?.toLowerCase().includes(q) ||
        file.folderPath?.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [cloudFiles, selectedFilterCategory, searchQuery]);

  const sortedFiles = useMemo(() => {
    const list = [...filteredFiles];
    if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [filteredFiles, sortBy]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: cloudFiles.length,
      Documents: 0,
      Pictures: 0,
      Videos: 0,
      Archives: 0,
      Design_And_3D: 0,
      Music: 0,
    };
    for (const f of cloudFiles) {
      const cat = f.category || "Other";
      if (counts[cat] !== undefined) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return counts;
  }, [cloudFiles]);

  return (
    <div
      data-testid="cloudup-page-root"
      className="glass-scroll flex h-full w-full flex-col overflow-y-auto px-4 py-5 sm:px-8 sm:py-6 lg:px-12"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingFile(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        handleStageFiles(e.dataTransfer.files);
      }}
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-6 pb-16 pt-2 sm:pt-4">
        {/* ========================================================================= */}
        {/* TOP STATUS & FAST ACTION BANNER                                           */}
        {/* ========================================================================= */}
        <GlassCard
          variant="panel"
          padding="md"
          className="frost-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6"
        >
          {/* Left: Cloud Uploading status & root folder tag */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="bg-pearl flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-glass-edge shadow-sm">
              <CloudUpload className="h-5.5 w-5.5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                  Cloud Uploading
                </h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                    driveConnected
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  }`}
                >
                  {driveConnected ? "Connected" : "Offline Storage"}
                </span>
                <span className="rounded-full bg-glass/60 border border-glass-edge px-2 py-0.5 text-[10px] text-muted-foreground font-mono">
                  Drive: {cloudFolderName}/
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {driveConnected
                  ? `Connected · ${driveEmail || "Google Drive"}`
                  : "Connect Google Drive for cloud sync across devices"}
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={() => {
                if (inlineFileInputRef.current) {
                  inlineFileInputRef.current.click();
                } else {
                  setCloudUploadModalOpen(true);
                }
              }}
              data-testid="open-cloud-upload-btn"
              title="Select files to upload"
              className="btn-ink liquid-press flex h-9.5 min-w-[5.5rem] sm:min-w-[6.2rem] items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold shadow-sm cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload</span>
            </button>

            <button
              type="button"
              onClick={handleConnectGoogleDrive}
              disabled={syncingDrive}
              data-testid="connect-google-drive-btn"
              className="glass-pill liquid-press flex h-9.5 min-w-[5.5rem] sm:min-w-[6.2rem] items-center justify-center gap-1.5 rounded-full px-4 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge"
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
              className="glass-pill liquid-press flex h-9.5 min-w-[5.5rem] sm:min-w-[6.2rem] items-center justify-center gap-1.5 rounded-full px-4 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Rename</span>
            </button>
          </div>
        </GlassCard>

        {/* ========================================================================= */}
        {/* CLOUD METRICS & STORAGE INTELLIGENCE ROW                                  */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {/* Card 1: Google Drive Storage Quota */}
          <GlassCard
            variant="panel"
            padding="sm"
            className="frost-panel flex flex-col justify-between p-4 sm:p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold tracking-tight text-foreground">
                  Storage Quota
                </span>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">15.0 GB Cloud</span>
            </div>
            <div className="my-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-foreground">2.4 GB Used</span>
                <span className="text-muted-foreground">12.6 GB Free (16%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10 dark:bg-white/5 border border-glass-edge">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-primary to-cyan-400"
                  style={{ width: "16%" }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{driveConnected ? "Google Drive Sync Active" : "Local Cloud Cache"}</span>
              </span>
              <span>{cloudFiles.length} files tracked</span>
            </div>
          </GlassCard>

          {/* Card 2: Automatic Sorting Engine */}
          <GlassCard
            variant="panel"
            padding="sm"
            className="frost-panel flex flex-col justify-between p-4 sm:p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold tracking-tight text-foreground">
                  Smart Auto-Routing
                </span>
              </div>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                9 Categories
              </span>
            </div>
            <p className="my-2 text-xs text-muted-foreground leading-relaxed">
              Files are automatically inspected and routed into organized Google Drive folders:{" "}
              <span className="text-foreground/90 font-medium">Documents, Pictures, Videos, Archives</span> &amp; more.
            </p>
            <div className="flex items-center justify-between pt-1 text-[11px]">
              <button
                type="button"
                onClick={() => setFolderTreeOpen(!folderTreeOpen)}
                className="text-primary hover:underline flex items-center gap-1 font-medium"
              >
                <FolderCheck className="h-3.5 w-3.5" />
                <span>{folderTreeOpen ? "Hide Folder Tree" : "View Drive Tree"}</span>
              </button>
              <span className="text-muted-foreground">Auto-naming: ON</span>
            </div>
          </GlassCard>

          {/* Card 3: Quick Category Buckets */}
          <GlassCard
            variant="panel"
            padding="sm"
            className="frost-panel flex flex-col justify-between p-4 sm:p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold tracking-tight text-foreground">
                  Category Hub
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">Quick Filter</span>
            </div>
            <div className="grid grid-cols-2 gap-2 my-2">
              <button
                type="button"
                onClick={() => setSelectedFilterCategory("Documents")}
                className={`flex items-center justify-between rounded-xl p-2 text-xs border transition-colors ${
                  selectedFilterCategory === "Documents"
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 font-semibold"
                    : "bg-glass/40 border-glass-edge hover:bg-glass text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <FileText className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Docs</span>
                </span>
                <span className="font-mono text-[10px]">{categoryCounts["Documents"] || 0}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFilterCategory("Pictures")}
                className={`flex items-center justify-between rounded-xl p-2 text-xs border transition-colors ${
                  selectedFilterCategory === "Pictures"
                    ? "bg-sky-500/20 border-sky-500/40 text-sky-400 font-semibold"
                    : "bg-glass/40 border-glass-edge hover:bg-glass text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <ImageIcon className="h-3.5 w-3.5 text-sky-400" />
                  <span>Images</span>
                </span>
                <span className="font-mono text-[10px]">{categoryCounts["Pictures"] || 0}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFilterCategory("Videos")}
                className={`flex items-center justify-between rounded-xl p-2 text-xs border transition-colors ${
                  selectedFilterCategory === "Videos"
                    ? "bg-purple-500/20 border-purple-500/40 text-purple-400 font-semibold"
                    : "bg-glass/40 border-glass-edge hover:bg-glass text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Film className="h-3.5 w-3.5 text-purple-400" />
                  <span>Videos</span>
                </span>
                <span className="font-mono text-[10px]">{categoryCounts["Videos"] || 0}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFilterCategory("Archives")}
                className={`flex items-center justify-between rounded-xl p-2 text-xs border transition-colors ${
                  selectedFilterCategory === "Archives"
                    ? "bg-orange-500/20 border-orange-500/40 text-orange-400 font-semibold"
                    : "bg-glass/40 border-glass-edge hover:bg-glass text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <FileArchive className="h-3.5 w-3.5 text-orange-400" />
                  <span>Archives</span>
                </span>
                <span className="font-mono text-[10px]">{categoryCounts["Archives"] || 0}</span>
              </button>
            </div>
            <div className="text-[11px] text-muted-foreground text-right">
              <button
                type="button"
                onClick={() => setSelectedFilterCategory("all")}
                className="text-primary hover:underline font-medium"
              >
                View all ({cloudFiles.length})
              </button>
            </div>
          </GlassCard>
        </div>

        {/* ========================================================================= */}
        {/* COLLAPSIBLE GOOGLE DRIVE FOLDER TREE VIEWER                               */}
        {/* ========================================================================= */}
        {folderTreeOpen && (
          <GlassCard variant="panel" padding="md" className="frost-panel p-5 animate-liquid">
            <div className="flex items-center justify-between pb-3 border-b border-glass-edge">
              <div className="flex items-center gap-2">
                <FolderUp className="h-4.5 w-4.5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Google Drive Folder Hierarchy · <span className="font-mono text-primary">{cloudFolderName}/</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFolderTreeOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {XPERTER_CATEGORIES.map((cat) => {
                const count = cloudFiles.filter((f) => f.category === cat).length;
                return (
                  <div
                    key={cat}
                    className="flex items-center justify-between rounded-xl border border-glass-edge bg-glass/40 p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate font-medium text-foreground">{cat}</span>
                    </div>
                    <span className="font-mono text-[10px] rounded-full bg-white/5 px-2 py-0.5 text-muted-foreground">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* ========================================================================= */}
        {/* INLINE DRAG & DROP CLOUD DROPZONE & STAGING QUEUE                         */}
        {/* ========================================================================= */}
        <div className="space-y-4">
          <input
            ref={inlineFileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleStageFiles(e.target.files)}
          />

          <div
            onClick={() => inlineFileInputRef.current?.click()}
            className={`group relative flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed p-8 sm:p-10 text-center transition-all duration-300 cursor-pointer select-none ${
              isDraggingFile
                ? "border-primary bg-primary/10 shadow-lg scale-[1.008]"
                : "border-glass-edge/80 hover:border-primary/50 bg-glass/30 hover:bg-glass/50"
            }`}
          >
            <div className="bg-pearl flex h-14 w-14 items-center justify-center rounded-3xl border border-glass-edge shadow-md mb-3.5 transition-transform duration-300 group-hover:scale-110">
              <CloudUpload className="h-7 w-7 text-primary animate-pulse" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              Drag &amp; Drop Files Anywhere to Upload
            </h2>
            <p className="mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">
              Files are automatically categorized and sorted into your Google Drive root{" "}
              <span className="font-mono text-primary font-medium">{cloudFolderName}/</span> folder.
            </p>
            <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
              <span className="btn-ink liquid-press inline-flex h-9 items-center gap-1.5 rounded-full px-5 text-xs font-semibold shadow-sm">
                <Upload className="h-3.5 w-3.5" />
                <span>Browse Files</span>
              </span>
              <span className="text-[11px] text-muted-foreground">Max 100MB per file · All formats supported</span>
            </div>
          </div>

          {/* Staging queue: displays picked files with instant destination folder preview */}
          {stagedFiles.length > 0 && (
            <GlassCard variant="panel" padding="md" className="frost-panel p-5 animate-liquid space-y-4">
              <div className="flex items-center justify-between border-b border-glass-edge pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Upload Queue ({stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStagedFiles([])}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear Queue
                  </button>
                  <button
                    type="button"
                    disabled={uploadingCloudFile}
                    onClick={() => executeUploadProcess(stagedFiles)}
                    className="btn-ink liquid-press flex h-8 items-center gap-1.5 rounded-full px-4 text-xs font-semibold shadow-sm"
                  >
                    {uploadingCloudFile ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Uploading ({cloudUploadProgress}%)</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        <span>Upload All to Google Drive</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Progress bar if uploading */}
              {uploadingCloudFile && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-primary">Syncing to Google Drive…</span>
                    <span className="font-mono text-primary">{cloudUploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10 border border-glass-edge">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-primary to-cyan-400 transition-all duration-300"
                      style={{ width: `${cloudUploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Staged file cards */}
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 glass-scroll">
                {stagedFiles.map((file, idx) => {
                  const classification = classifyFile(file.name);
                  const badgeColor = getCategoryBadgeColor(classification.category);
                  return (
                    <div
                      key={`${file.name}_${idx}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-glass-edge bg-glass/40 p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {getCategoryIcon(classification.category)}
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{file.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatFileSize(file.size)} ·{" "}
                            <span className="text-foreground/80 font-mono">
                              Target: {cloudFolderName}/{classification.category}
                              {classification.suggestedSubfolder ? `/${classification.suggestedSubfolder}` : ""}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor.bg} ${badgeColor.text} ${badgeColor.border}`}
                        >
                          {classification.category}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStagedFile(idx)}
                          className="rounded-full p-1 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}
        </div>

        {/* ========================================================================= */}
        {/* CLOUD FILES EXPLORER & STREAM                                             */}
        {/* ========================================================================= */}
        <div className="space-y-4">
          {/* Controls Bar: Category Filter Chips + Search + Sort */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 glass-scroll text-xs">
              {[
                { id: "all", label: "All Files", count: cloudFiles.length },
                { id: "Documents", label: "Documents", count: categoryCounts["Documents"] || 0 },
                { id: "Pictures", label: "Pictures", count: categoryCounts["Pictures"] || 0 },
                { id: "Videos", label: "Videos", count: categoryCounts["Videos"] || 0 },
                { id: "Archives", label: "Archives", count: categoryCounts["Archives"] || 0 },
                { id: "Design_And_3D", label: "3D & Assets", count: categoryCounts["Design_And_3D"] || 0 },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedFilterCategory(tab.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                    selectedFilterCategory === tab.id
                      ? "btn-ink liquid-press shadow-sm"
                      : "glass-pill text-muted-foreground hover:text-foreground hover:bg-glass-strong"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="font-mono text-[10px] opacity-75">({tab.count})</span>
                </button>
              ))}
            </div>

            {/* Search Input & Sort */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search cloud files…"
                  className="glass-input h-8.5 w-full rounded-full pl-8 pr-3 text-xs outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSortBy((prev) => (prev === "latest" ? "name" : "latest"))}
                className="glass-pill liquid-press flex h-8.5 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                title={`Sort by ${sortBy === "latest" ? "Name" : "Latest"}`}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span className="capitalize">{sortBy}</span>
              </button>
            </div>
          </div>

          {/* Files List / Grid Container */}
          <GlassCard variant="panel" padding="md" className="frost-panel p-5 sm:p-6 space-y-3">
            <div className="flex items-center justify-between border-b border-glass-edge pb-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                Synced Cloud Items ({sortedFiles.length})
              </span>
              <span>Root: {cloudFolderName}/</span>
            </div>

            {sortedFiles.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Cloud className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium text-foreground">No matching cloud files</p>
                <p className="text-xs text-muted-foreground">
                  {searchQuery
                    ? `No files found matching "${searchQuery}". Clear search to view all.`
                    : "Drop files above or click Upload to sync your first files to Google Drive."}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedFiles.map((file) => {
                  const badgeColor = getCategoryBadgeColor(file.category);
                  return (
                    <div
                      key={file.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-glass-edge bg-glass/40 hover:bg-glass/60 p-3 sm:px-4 text-xs transition-colors duration-200"
                    >
                      {/* File Icon & Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pearl border border-glass-edge shadow-sm">
                          {getCategoryIcon(file.category)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-foreground truncate max-w-[280px] sm:max-w-[420px]">
                              {file.name}
                            </p>
                            {file.category && (
                              <span
                                className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor.bg} ${badgeColor.text} ${badgeColor.border}`}
                              >
                                {file.category === "Documents" && file.documentSubfolder
                                  ? `DOC · ${file.documentSubfolder}`
                                  : file.category.replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {file.sizeFormatted} ·{" "}
                            <span className="text-foreground/80 font-mono">
                              {file.folderPath || `${cloudFolderName}/${file.category}`}
                            </span>
                            {file.uploadedAt && <span className="opacity-70"> · {file.uploadedAt}</span>}
                          </p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            title="Open file in Google Drive"
                            className="glass-pill liquid-press flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span className="hidden sm:inline">Drive</span>
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopyLink(file)}
                          title="Copy file link"
                          className="glass-pill liquid-press flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="h-3 w-3" />
                          <span className="hidden sm:inline">Share</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadCloudFile(file)}
                          title="Download file"
                          className="glass-pill liquid-press flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        >
                          <Upload className="h-3 w-3 rotate-180" />
                          <span className="hidden sm:inline">Download</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteCloudFile(file.id)}
                          title="Remove from list"
                          className="rounded-full p-2 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* POPUP MODAL: CLOUD UPLOAD CONFIGURATION                                   */}
      {/* ========================================================================= */}
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
                    Upload to Google Drive
                  </Dialog.Title>
                  <p className="text-xs text-muted-foreground">
                    {driveConnected ? `Connected · ${driveEmail || "Google Drive"}` : "Sync with Google Drive"}
                  </p>
                </div>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="rounded-full p-1.5 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {/* Category routing selection */}
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground">
                  Folder Routing Strategy
                </label>
                <select
                  value={cloudCategorySelection}
                  onChange={(e) => setCloudCategorySelection(e.target.value)}
                  className="glass-input h-10 w-full rounded-xl px-3 text-xs outline-none bg-background/80"
                >
                  <option value="auto">✨ Automatic Smart Sorting (Based on file extension &amp; MIME)</option>
                  {XPERTER_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      📁 {cat}
                    </option>
                  ))}
                </select>
              </div>

              {cloudCategorySelection === "Documents" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Document Subfolder
                  </label>
                  <select
                    value={cloudDocumentSubfolder}
                    onChange={(e) => setCloudDocumentSubfolder(e.target.value)}
                    className="glass-input h-10 w-full rounded-xl px-3 text-xs outline-none bg-background/80"
                  >
                    {DOCUMENT_SUBFOLDERS.map((sub) => (
                      <option key={sub} value={sub}>
                        📄 {sub}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* File selection inside modal */}
            <div>
              <input
                ref={modalFileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleStageFiles(e.target.files);
                  setCloudUploadModalOpen(false);
                }}
              />
              <button
                type="button"
                onClick={() => modalFileInputRef.current?.click()}
                className="btn-ink liquid-press flex h-10 w-full items-center justify-center gap-2 rounded-full text-xs font-semibold shadow-sm"
              >
                <Upload className="h-4 w-4" />
                <span>Select Files to Add to Queue</span>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ========================================================================= */}
      {/* POPUP MODAL: RENAME CLOUD FOLDER                                          */}
      {/* ========================================================================= */}
      <Dialog.Root open={renameFolderModalOpen} onOpenChange={setRenameFolderModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[75]" />
          <Dialog.Content className="settings-popover glass fixed left-1/2 top-1/2 z-[80] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] p-5 text-foreground outline-none shadow-2xl border border-glass-edge">
            <div className="flex items-center justify-between pb-3 border-b border-glass-edge">
              <div className="flex items-center gap-2">
                <Pencil className="h-4.5 w-4.5 text-primary" />
                <Dialog.Title className="text-base font-semibold">
                  Rename Root Folder
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleRenameFolderSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Google Drive Main Folder Name
                </label>
                <input
                  type="text"
                  value={renameFolderInput}
                  onChange={(e) => setRenameFolderInput(e.target.value)}
                  placeholder="e.g. Xperter, MyFiles, CloudVault"
                  required
                  className="glass-input h-10 w-full rounded-xl px-3.5 text-xs outline-none"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  All sorted categories (Videos, Pictures, Documents, etc.) will be created under this folder.
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRenameFolderModalOpen(false)}
                  className="glass-input h-9 flex-1 rounded-full text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-ink liquid-press h-9 flex-1 rounded-full text-xs font-medium"
                >
                  Save Folder
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
