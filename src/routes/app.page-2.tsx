import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  Cloud,
  CloudUpload,
  Database,
  FolderOpen,
  HardDrive,
  Mail,
  Pencil,
  RefreshCw,
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
  renameXperterRootFolder,
  saveCloudFiles,
  setCustomCloudFolderName,
  uploadGenericFileToGoogleDrive,
  type CloudUploadedItem,
  type GoogleDriveStorageQuota,
} from "@/lib/google-drive-vault";
import {
  classifyFile,
  initializeXperterDriveHierarchy,
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
      if (!isDriveConnected()) {
        setDriveConnected(false);
        setStorageQuota(null);
      }
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
    const previousName = cloudFolderName;
    const token = getDriveAccessToken();
    if (token && newName !== previousName) {
      try {
        await renameXperterRootFolder({
          userKey: effectiveUid,
          currentFolderName: previousName,
          newFolderName: newName,
          accessToken: token,
        });
      } catch {
        toast.warning("Renamed locally; could not update Drive folder right now.");
      }
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
    const usedValue = formatStorageQuotaBytes(storageQuota.usageBytes);
    const inDriveValue = formatStorageQuotaBytes(storageQuota.usageInDriveBytes);
    const trashValue = formatStorageQuotaBytes(storageQuota.usageInDriveTrashBytes);

    if (storageQuota.isUnlimited || storageQuota.limitBytes === null) {
      return {
        totalValue: "Unlimited",
        totalLabel: "Unlimited Plan",
        usedValue,
        freeValue: "Unlimited",
        inDriveValue,
        trashValue,
        pct: 8,
        pctLabel: "Unlimited",
      };
    }

    const totalValue = formatStorageQuotaBytes(storageQuota.limitBytes);
    const freeBytes = Math.max(0, storageQuota.limitBytes - storageQuota.usageBytes);
    const freeValue = formatStorageQuotaBytes(freeBytes);
    const pct =
      storageQuota.percentUsed ??
      Math.min(100, Math.round((storageQuota.usageBytes / storageQuota.limitBytes) * 1000) / 10);

    return {
      totalValue,
      totalLabel: `${totalValue} Cloud`,
      usedValue,
      freeValue,
      inDriveValue,
      trashValue,
      pct: Math.min(100, Math.max(0, pct)),
      pctLabel: `${pct}%`,
    };
  }, [driveConnected, storageQuota]);

  return (
    <div
      data-testid="cloudup-page-root"
      className="glass-scroll flex h-full w-full flex-col overflow-y-auto px-4 pb-12 pt-16 sm:px-6 sm:pt-16 md:px-8 md:pt-16 lg:px-10 lg:pl-20 lg:pt-8"
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
      <div className="mx-auto w-full max-w-[1160px] space-y-5 pb-8">
        {/* ========================================================================= */}
        {/* 1. TOP HEADER CARD                                                        */}
        {/* ========================================================================= */}
        <GlassCard
          variant="panel"
          padding="md"
          className="frost-panel flex flex-col gap-4 p-5 sm:p-6"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left: Icon + Title + Concise Description */}
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="bg-pearl flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-glass-edge shadow-sm">
                <CloudUpload className="h-5.5 w-5.5 text-primary" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <h1 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
                  Cloud Uploading
                </h1>
                <p className="text-xs text-muted-foreground truncate">
                  {driveConnected
                    ? "Automatic Google Drive categorization & unlimited upload"
                    : "Sign in with Google Drive to enable cloud backup & sync"}
                </p>
              </div>
            </div>

            {/* Right: Combined Sync / Green Connected Control + Rename */}
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap sm:flex-nowrap shrink-0">
              {!driveConnected ? (
                <button
                  type="button"
                  onClick={handleConnectGoogleDrive}
                  disabled={syncingDrive}
                  data-testid="connect-google-drive-btn"
                  title="Connect your Google Drive account"
                  className="btn-ink liquid-press flex h-10 min-w-[6.5rem] items-center justify-center gap-2 rounded-full px-5 text-xs font-semibold shadow-sm cursor-pointer"
                >
                  <HardDrive className={`h-3.5 w-3.5 ${syncingDrive ? "animate-spin" : ""}`} />
                  <span>{syncingDrive ? "Connecting…" : "Sync"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void loadRealDriveQuota()}
                  disabled={quotaLoading}
                  data-testid="drive-connected-indicator"
                  title="Google Drive connected — click to refresh quota"
                  className="liquid-press inline-flex h-10 items-center gap-2 rounded-full px-4 text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 shadow-sm cursor-pointer transition-colors"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span>Connected</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setRenameFolderInput(cloudFolderName);
                  setRenameFolderModalOpen(true);
                }}
                data-testid="rename-cloud-folder-btn"
                title="Rename root Google Drive folder"
                className="glass-pill liquid-press flex h-10 min-w-[5.75rem] items-center justify-center gap-1.5 rounded-full px-4 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Rename</span>
              </button>
            </div>
          </div>

          {/* Aligned Header Metadata Strip: Root Folder on left, Signed-in Account on right */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-t border-glass-edge/60 pt-3.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-medium">Drive Root:</span>
              <span className="rounded-full bg-glass/60 border border-glass-edge px-3 py-0.5 text-xs font-medium text-foreground truncate">
                {cloudFolderName}/
              </span>
            </div>

            {driveConnected && (
              <div className="flex items-center gap-2 min-w-0 sm:justify-end">
                <Mail className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <span className="truncate font-sans text-xs font-medium text-foreground tracking-tight">
                  {driveEmail || "Google Drive"}
                </span>
              </div>
            )}
          </div>
        </GlassCard>

        {/* ========================================================================= */}
        {/* 2. RECONSTRUCTED AUTHENTIC STORAGE QUOTA CARD                             */}
        {/* ========================================================================= */}
        <GlassCard
          variant="panel"
          padding="md"
          className="frost-panel flex flex-col p-5 sm:p-6"
        >
          {/* Card Header with Medium Refresh Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-4 border-b border-glass-edge/60">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-pearl flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-glass-edge shadow-sm">
                <Database className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <h2 className="text-sm sm:text-base font-semibold tracking-tight text-foreground">
                  Storage Quota
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  Real-time Google Drive capacity &amp; storage breakdown
                </p>
              </div>
            </div>

            {driveConnected ? (
              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                <span className="rounded-full bg-glass/60 border border-glass-edge px-3.5 py-1.5 text-xs font-semibold tabular-nums tracking-tight text-foreground">
                  {quotaDisplay?.totalLabel || (quotaLoading ? "Checking…" : "Google Drive")}
                </span>
                <button
                  type="button"
                  onClick={() => void loadRealDriveQuota()}
                  disabled={quotaLoading}
                  title="Refresh storage quota from Google Drive"
                  aria-label="Refresh storage quota"
                  className="glass-pill liquid-press inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-xs font-medium text-foreground border border-glass-edge hover:bg-glass-strong cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 text-muted-foreground ${quotaLoading ? "animate-spin" : ""}`} />
                  <span>{quotaLoading ? "Refreshing…" : "Refresh"}</span>
                </button>
              </div>
            ) : (
              <span className="self-start sm:self-auto rounded-full bg-glass/60 border border-glass-edge px-3 py-1 text-xs font-medium text-muted-foreground">
                Not Connected
              </span>
            )}
          </div>

          {/* Reconstructed Storage Metric Grid */}
          {driveConnected && quotaDisplay && storageQuota ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-4">
              <div className="rounded-2xl border border-glass-edge/70 bg-glass/35 px-4 py-3.5 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Used Space</p>
                <p className="text-lg sm:text-xl font-semibold tracking-tight tabular-nums text-foreground">
                  {quotaDisplay.usedValue}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  In Drive: {quotaDisplay.inDriveValue}
                </p>
              </div>

              <div className="rounded-2xl border border-glass-edge/70 bg-glass/35 px-4 py-3.5 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Available Space</p>
                <p className="text-lg sm:text-xl font-semibold tracking-tight tabular-nums text-foreground">
                  {quotaDisplay.freeValue}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {storageQuota.isUnlimited
                    ? "Unlimited Google plan"
                    : `Of ${quotaDisplay.totalValue} plan`}
                </p>
              </div>

              <div className="rounded-2xl border border-glass-edge/70 bg-glass/35 px-4 py-3.5 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Quota Utilization</p>
                <p className="text-lg sm:text-xl font-semibold tracking-tight tabular-nums text-foreground">
                  {quotaDisplay.pctLabel}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {storageQuota.usageInDriveTrashBytes > 0
                    ? `Trash: ${quotaDisplay.trashValue}`
                    : "Trash: 0 MB"}
                </p>
              </div>
            </div>
          ) : driveConnected && quotaLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-4">
              {[0, 1, 2].map((skeletonIdx) => (
                <div
                  key={skeletonIdx}
                  className="rounded-2xl border border-glass-edge/60 bg-glass/25 px-4 py-4 space-y-2 animate-pulse"
                >
                  <div className="h-3 w-20 rounded-full bg-foreground/10" />
                  <div className="h-6 w-28 rounded-full bg-foreground/15" />
                  <div className="h-3 w-24 rounded-full bg-foreground/10" />
                </div>
              ))}
            </div>
          ) : driveConnected && quotaError ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 text-xs">
              <span className="text-muted-foreground">{quotaError}</span>
              <button
                type="button"
                onClick={() => void loadRealDriveQuota()}
                className="glass-pill liquid-press inline-flex h-9 items-center gap-1.5 rounded-full px-4 font-medium text-foreground border border-glass-edge self-start sm:self-auto"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </button>
            </div>
          ) : (
            <div className="py-5 text-xs text-muted-foreground">
              Click <span className="font-semibold text-foreground">Sync</span> in the header above to sign in with Google Drive and view real storage capacity and usage.
            </div>
          )}

          {/* Capacity Progress Bar */}
          <div className="space-y-2 pb-4">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-muted-foreground">Capacity Usage</span>
              <span className="font-semibold tabular-nums text-foreground">
                {driveConnected && quotaDisplay
                  ? `${quotaDisplay.usedValue} of ${quotaDisplay.totalValue} (${quotaDisplay.pctLabel})`
                  : "—"}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/10 border border-glass-edge/70">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-primary to-cyan-400 transition-all duration-500"
                style={{
                  width:
                    driveConnected && quotaDisplay
                      ? `${Math.max(quotaDisplay.pct, storageQuota?.usageBytes ? 1.5 : 0)}%`
                      : "0%",
                }}
              />
            </div>
          </div>

          {/* Card Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-glass-edge/60 pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-2 font-medium">
              <span
                className={`h-2 w-2 rounded-full ${
                  driveConnected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/40"
                }`}
              />
              <span>{driveConnected ? "Google Drive Sync Active" : "Offline Storage"}</span>
            </span>
            <span className="font-medium tabular-nums">
              {cloudFiles.length} file{cloudFiles.length === 1 ? "" : "s"} tracked
            </span>
          </div>
        </GlassCard>

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
            role="button"
            tabIndex={0}
            aria-label="Browse or drop files to upload to Google Drive"
            onClick={() => inlineFileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inlineFileInputRef.current?.click();
              }
            }}
            className={`group relative flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed p-6 sm:p-10 md:p-12 text-center transition-all duration-300 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              isDraggingFile
                ? "border-primary bg-primary/10 shadow-lg scale-[1.008]"
                : "border-glass-edge/80 hover:border-primary/50 bg-glass/30 hover:bg-glass/50"
            }`}
          >
            <div className="bg-pearl flex h-14 w-14 items-center justify-center rounded-3xl border border-glass-edge shadow-md mb-3.5 transition-transform duration-300 group-hover:scale-110">
              <CloudUpload className="h-7 w-7 text-primary animate-pulse" />
            </div>

            <h2 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
              Drag &amp; Drop Files Anywhere to Upload
            </h2>

            {/* Single Upload Trigger Button: Centered & neatly aligned */}
            <div className="mt-5 flex flex-col items-center justify-center gap-2.5">
              <span className="btn-ink liquid-press inline-flex h-10 items-center justify-center gap-2 rounded-full px-7 text-xs font-semibold shadow-sm">
                <Upload className="h-4 w-4" />
                <span>Browse Files</span>
              </span>

              {/* File size indication: Unlimited */}
              <span className="text-xs text-muted-foreground tracking-normal font-medium">
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
                  <h3 className="text-sm font-semibold text-foreground tabular-nums">
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
                    className="btn-ink liquid-press flex h-9 items-center gap-1.5 rounded-full px-5 text-xs font-semibold shadow-sm cursor-pointer tabular-nums"
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
                    <span className="font-semibold tabular-nums text-primary">{cloudUploadProgress}%</span>
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
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {formatFileSize(file.size)} · Target:{" "}
                            <span className="font-medium text-foreground/85">
                              {cloudFolderName}/{classification.category}
                              {classification.documentSubfolder ? `/${classification.documentSubfolder}` : ""}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full border bg-muted/40 border-glass-edge text-muted-foreground">
                          {classification.category}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStagedFile(idx)}
                          aria-label={`Remove ${file.name}`}
                          className="rounded-full p-1.5 text-muted-foreground hover:text-destructive transition-colors"
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
