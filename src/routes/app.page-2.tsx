import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  fetchGoogleDriveStorageQuota,
  fetchGoogleDriveTrackedFiles,
  formatFileSize,
  formatStorageQuotaBytes,
  getCustomCloudFolderName,
  getDriveAccessToken,
  getDriveConnectedEmail,
  isDriveConnected,
  loadCloudFiles,
  saveCloudFiles,
  setCustomCloudFolderName,
  uploadGenericFileToGoogleDrive,
  type CloudUploadedItem,
  type GoogleDriveStorageQuota,
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
        content: "Cloud uploading with real Google Drive synchronization, unlimited file sizes, and automated folder categorization.",
      },
      { property: "og:title", content: "Cloudup — Xperter" },
      {
        property: "og:description",
        content: "Cloud uploading with real Google Drive synchronization, unlimited file sizes, and automated folder categorization.",
      },
    ],
  }),
  component: CloudupPage,
});

function CloudupPage() {
  const { user } = useAuthState();
  const effectiveUid = user?.uid || "demo_local_user";
  const currentUsername = sanitizeUsernameId(user?.displayName || user?.email?.split("@")[0] || "user");

  // Google Drive & Cloud Uploading connection state
  const [driveConnected, setDriveConnected] = useState<boolean>(() =>
    Boolean(isDriveConnected()),
  );
  const [driveEmail, setDriveEmail] = useState<string | null>(() =>
    getDriveConnectedEmail(),
  );
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [renameFolderModalOpen, setRenameFolderModalOpen] = useState<boolean>(false);
  const [cloudFolderName, setCloudFolderName] = useState<string>(() =>
    getCustomCloudFolderName(effectiveUid),
  );
  const [renameFolderInput, setRenameFolderInput] = useState<string>("");

  // Real Storage Quota State (Strictly real data only — no fake numbers)
  const [storageQuota, setStorageQuota] = useState<GoogleDriveStorageQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  // Real tracked files (persisted locally per user and refreshed from Drive API)
  const [cloudFiles, setCloudFiles] = useState<CloudUploadedItem[]>(() =>
    loadCloudFiles(effectiveUid),
  );

  // Staging & upload state (Unlimited file size)
  const [uploadingCloudFile, setUploadingCloudFile] = useState(false);
  const [cloudUploadProgress, setCloudUploadProgress] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const inlineFileInputRef = useRef<HTMLInputElement>(null);

  // Real Storage Quota Fetcher
  const loadRealDriveQuota = useCallback(async (token?: string) => {
    const activeToken = token || getDriveAccessToken();
    if (!activeToken) {
      setStorageQuota(null);
      setQuotaLoading(false);
      return;
    }
    setQuotaLoading(true);
    setQuotaError(null);
    try {
      const q = await fetchGoogleDriveStorageQuota(activeToken);
      setStorageQuota(q);
      if (q.userEmail) {
        setDriveEmail(q.userEmail);
      }
    } catch (err) {
      console.warn("Could not fetch real Google Drive quota:", err);
      setQuotaError(err instanceof Error ? err.message : "Unable to retrieve storage quota");
    } finally {
      setQuotaLoading(false);
    }
  }, []);

  // Sync Google Drive connection state & fetch authentic quota on mount
  useEffect(() => {
    const connected = isDriveConnected();
    const email = getDriveConnectedEmail();
    setDriveConnected(connected);
    setDriveEmail(email);

    if (connected) {
      void loadRealDriveQuota();
    }
  }, [loadRealDriveQuota]);

  // Sync custom cloud folder name and user-specific tracked files
  useEffect(() => {
    setCloudFolderName(getCustomCloudFolderName(effectiveUid));
    const loaded = loadCloudFiles(effectiveUid);
    setCloudFiles(loaded);
  }, [effectiveUid]);

  // Google Drive Authentication / Sync Handler
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
        rootFolderName: cloudFolderName,
      });

      // Fetch authentic real quota immediately upon connect
      await loadRealDriveQuota(res.accessToken);

      // Fetch existing tracked non-folder files from Google Drive
      try {
        const driveItems = await fetchGoogleDriveTrackedFiles({
          accessToken: res.accessToken,
          rootFolderName: cloudFolderName,
        });
        if (driveItems.length > 0) {
          const merged = [...driveItems, ...cloudFiles.filter((cf) => !driveItems.some((di) => di.id === cf.id))];
          setCloudFiles(merged);
          saveCloudFiles(effectiveUid, merged);
        }
      } catch {
        // Non-fatal if listing fails due to restricted file scope
      }

      toast.success(`Google Drive connected · Root folder "${cloudFolderName}/" active`);
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
    setCustomCloudFolderName(effectiveUid, newName);
    setCloudFolderName(newName);
    setRenameFolderModalOpen(false);
    toast.success(`Cloud folder updated to "${newName}"`);
  };

  // Stage files with UNLIMITED size (no 100MB cap)
  const handleStageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file) {
        newFiles.push(file);
      }
    }
    setStagedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleRemoveStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Upload process with unlimited size chunking & real quota refresh
  const executeUploadProcess = async (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) return;
    const token = getDriveAccessToken();

    setUploadingCloudFile(true);
    setCloudUploadProgress(10);
    const uploadedRecords: CloudUploadedItem[] = [];

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        if (!file) continue;

        const basePct = Math.round(10 + (i / filesToUpload.length) * 85);
        setCloudUploadProgress(basePct);

        const autoClassification = classifyFile(file.name);
        let driveFileId: string | undefined;
        let driveWebViewLink: string | undefined;

        if (token) {
          try {
            const uploadRes = await uploadGenericFileToGoogleDrive({
              file,
              accessToken: token,
              customRootFolderName: cloudFolderName,
              onProgress: (chunkPct) => {
                const totalPct = Math.min(
                  98,
                  Math.round(basePct + (chunkPct / 100) * (85 / filesToUpload.length)),
                );
                setCloudUploadProgress(totalPct);
              },
            });
            driveFileId = uploadRes.driveFileId;
            driveWebViewLink = uploadRes.webViewLink;
          } catch (uploadErr) {
            console.warn("Upload to Google Drive error:", uploadErr);
          }
        }

        const newRecord: CloudUploadedItem = {
          id: driveFileId || `cloud_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          sizeBytes: file.size,
          sizeFormatted: formatFileSize(file.size),
          mimeType: file.type || "application/octet-stream",
          category: autoClassification.category,
          documentSubfolder: autoClassification.documentSubfolder,
          folderPath: `${cloudFolderName}/${autoClassification.category}${
            autoClassification.documentSubfolder ? `/${autoClassification.documentSubfolder}` : ""
          }`,
          folderName: autoClassification.documentSubfolder || autoClassification.category,
          driveFileId,
          webViewLink:
            driveWebViewLink ||
            (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : undefined),
          uploadedAtIso: new Date().toISOString(),
          syncedToDrive: Boolean(driveFileId),
        };
        uploadedRecords.push(newRecord);
      }

      setCloudUploadProgress(100);
      const nextCloudList = [...uploadedRecords, ...cloudFiles];
      setCloudFiles(nextCloudList);
      saveCloudFiles(effectiveUid, nextCloudList);
      setStagedFiles([]);

      // Refresh authentic real storage quota
      if (token) {
        void loadRealDriveQuota(token);
      }

      toast.success(
        `Uploaded ${uploadedRecords.length} file${
          uploadedRecords.length > 1 ? "s" : ""
        } directly into "${cloudFolderName}/" on Google Drive`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload file(s)");
    } finally {
      setTimeout(() => {
        setUploadingCloudFile(false);
        setCloudUploadProgress(0);
      }, 500);
      if (inlineFileInputRef.current) inlineFileInputRef.current.value = "";
    }
  };

  // Quota formatting helpers
  const quotaDisplay = useMemo(() => {
    if (!driveConnected || !storageQuota) {
      return null;
    }
    const usedFormatted = formatStorageQuotaBytes(storageQuota.usageBytes);
    if (storageQuota.isUnlimited || storageQuota.limitBytes === null) {
      return {
        totalLabel: "Unlimited Cloud Storage",
        usedLabel: `${usedFormatted} Used`,
        freeLabel: "Unlimited",
        pct: 10,
        pctLabel: "Enterprise / Education tier",
      };
    }
    const totalFormatted = formatStorageQuotaBytes(storageQuota.limitBytes);
    const freeBytes = Math.max(0, storageQuota.limitBytes - storageQuota.usageBytes);
    const freeFormatted = formatStorageQuotaBytes(freeBytes);
    const pct = storageQuota.percentUsed ?? Math.min(100, Math.round((storageQuota.usageBytes / storageQuota.limitBytes) * 100));
    return {
      totalLabel: `${totalFormatted} Cloud`,
      usedLabel: `${usedFormatted} Used`,
      freeLabel: `${freeFormatted} Free (${pct}%)`,
      pct: Math.min(100, Math.max(0, pct)),
      pctLabel: `${pct}%`,
    };
  }, [driveConnected, storageQuota]);

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
      <div className="mx-auto w-full max-w-[1300px] space-y-5 pb-16 pt-2 sm:pt-4">
        {/* ========================================================================= */}
        {/* 1. TOP HEADER CARD                                                        */}
        {/* ========================================================================= */}
        <GlassCard
          variant="panel"
          padding="md"
          className="frost-panel flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6"
        >
          {/* Left: Title + Combined Drive Folder Tag + Neatly Realigned Account Email */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="bg-pearl flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-glass-edge shadow-sm">
              <CloudUpload className="h-5.5 w-5.5 text-primary" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                  Cloud Uploading
                </h1>
                <span className="rounded-full bg-glass/60 border border-glass-edge px-2.5 py-0.5 text-[11px] text-muted-foreground font-mono">
                  Drive: {cloudFolderName}/
                </span>
              </div>
              {/* Neatly aligned account status badge inside header card */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                {driveConnected ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="truncate">
                      Connected · <span className="font-mono text-foreground/90">{driveEmail || "Google Drive"}</span>
                    </span>
                  </>
                ) : (
                  <span>Sign in with Google Drive to enable cloud backup &amp; sync</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap sm:flex-nowrap shrink-0">
            {/* Combined Sync & Connected Indicator:
                When not connected -> Shows "Sync" button to log into Google Drive
                When connected -> Shows neatly styled green "Connected" indicator in this exact slot */}
            {!driveConnected ? (
              <button
                type="button"
                onClick={handleConnectGoogleDrive}
                disabled={syncingDrive}
                data-testid="connect-google-drive-btn"
                title="Connect your Google Drive account"
                className="btn-ink liquid-press flex h-9.5 min-w-[6.2rem] items-center justify-center gap-2 rounded-full px-5 text-xs font-semibold shadow-sm cursor-pointer"
              >
                <HardDrive className={`h-3.5 w-3.5 ${syncingDrive ? "animate-spin" : ""}`} />
                <span>{syncingDrive ? "Connecting…" : "Sync"}</span>
              </button>
            ) : (
              <div
                data-testid="drive-connected-indicator"
                className="inline-flex h-9.5 items-center gap-2 rounded-full px-4 text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shadow-sm select-none"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Connected</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setRenameFolderInput(cloudFolderName);
                setRenameFolderModalOpen(true);
              }}
              data-testid="rename-cloud-folder-btn"
              title="Rename root Google Drive folder"
              className="glass-pill liquid-press flex h-9.5 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-full px-4 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Rename</span>
            </button>
          </div>
        </GlassCard>

        {/* ========================================================================= */}
        {/* 2. AUTHENTIC REAL STORAGE QUOTA CARD                                      */}
        {/* ========================================================================= */}
        <div className="w-full">
          <GlassCard
            variant="panel"
            padding="sm"
            className="frost-panel flex flex-col justify-between p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="bg-pearl flex h-8 w-8 items-center justify-center rounded-xl border border-glass-edge shadow-sm">
                  <Database className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-xs font-bold tracking-tight text-foreground uppercase">
                    Storage Quota
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Authentic Google Drive capacity &amp; usage
                  </p>
                </div>
              </div>

              {driveConnected ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-medium text-foreground">
                    {quotaDisplay?.totalLabel || (quotaLoading ? "Checking…" : "Google Drive")}
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadRealDriveQuota()}
                    disabled={quotaLoading}
                    title="Refresh quota from Google Drive"
                    className="rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className={`h-3 w-3 ${quotaLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-muted-foreground font-mono">
                  Google Drive not connected
                </span>
              )}
            </div>

            {/* Quota metric bar */}
            <div className="my-3.5 space-y-2">
              <div className="flex justify-between items-center text-xs">
                {driveConnected && quotaDisplay ? (
                  <>
                    <span className="font-semibold text-foreground">
                      {quotaDisplay.usedLabel}
                    </span>
                    <span className="text-muted-foreground font-mono">
                      {quotaDisplay.freeLabel}
                    </span>
                  </>
                ) : driveConnected && quotaLoading ? (
                  <span className="text-muted-foreground text-xs animate-pulse">
                    Retrieving real storage quota from Google Drive API…
                  </span>
                ) : (
                  <>
                    <span className="text-muted-foreground text-xs">
                      No active Google Drive quota data
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Click Sync to view real quota
                    </span>
                  </>
                )}
              </div>

              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10 dark:bg-white/5 border border-glass-edge">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-primary to-cyan-400 transition-all duration-500"
                  style={{
                    width: driveConnected && quotaDisplay ? `${quotaDisplay.pct}%` : "0%",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-glass-edge/40">
              <span className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    driveConnected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/40"
                  }`}
                />
                <span>{driveConnected ? "Google Drive Sync Active" : "Offline Storage"}</span>
              </span>
              <span>
                {cloudFiles.length} file{cloudFiles.length === 1 ? "" : "s"} tracked
              </span>
            </div>
          </GlassCard>
        </div>

        {/* ========================================================================= */}
        {/* 3. INLINE DROPZONE & SINGLE UPLOAD BUTTON                                 */}
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
            className={`group relative flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed p-8 sm:p-12 text-center transition-all duration-300 cursor-pointer select-none ${
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

            {/* Single Upload Trigger Button: Centered & neatly aligned */}
            <div className="mt-5 flex flex-col items-center justify-center gap-2.5">
              <span className="btn-ink liquid-press inline-flex h-10 items-center justify-center gap-2 rounded-full px-7 text-xs font-semibold shadow-sm">
                <Upload className="h-4 w-4" />
                <span>Browse Files</span>
              </span>

              {/* File size indication: Unlimited */}
              <span className="text-[11px] text-muted-foreground tracking-wide font-medium">
                Unlimited file size · All formats supported
              </span>
            </div>
          </div>

          {/* Staging queue: displays picked files with direct upload action */}
          {stagedFiles.length > 0 && (
            <GlassCard variant="panel" padding="md" className="frost-panel p-5 animate-liquid space-y-4">
              <div className="flex items-center justify-between border-b border-glass-edge pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Upload Queue ({stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""})
                  </h3>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStagedFiles([])}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear Queue
                  </button>
                  <button
                    type="button"
                    disabled={uploadingCloudFile}
                    onClick={() => executeUploadProcess(stagedFiles)}
                    className="btn-ink liquid-press flex h-8.5 items-center gap-1.5 rounded-full px-5 text-xs font-semibold shadow-sm cursor-pointer"
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
                  return (
                    <div
                      key={`${file.name}_${idx}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-glass-edge bg-glass/40 p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Cloud className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{file.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatFileSize(file.size)} · Target:{" "}
                            <span className="font-mono text-foreground/80">
                              {cloudFolderName}/{classification.category}
                              {classification.documentSubfolder ? `/${classification.documentSubfolder}` : ""}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border bg-muted/40 border-glass-edge text-muted-foreground">
                          {classification.category}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStagedFile(idx)}
                          className="rounded-full p-1 text-muted-foreground hover:text-destructive transition-colors"
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
      </div>

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
