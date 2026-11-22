import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CloudUpload,
  ExternalLink,
  FileText,
  FolderUp,
  HardDrive,
  Pencil,
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
  initializeXperterDriveHierarchy,
  XPERTER_ROOT_FOLDER_NAME,
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
  const [cloudFiles, setCloudFiles] = useState<CloudUploadedItem[]>(() =>
    loadCloudFiles(effectiveUid),
  );
  const [uploadingCloudFile, setUploadingCloudFile] = useState(false);
  const [cloudUploadProgress, setCloudUploadProgress] = useState(0);
  const [cloudCategorySelection, setCloudCategorySelection] = useState<string>("auto");
  const [cloudDocumentSubfolder, setCloudDocumentSubfolder] = useState<string>("general");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const cloudFileInputRef = useRef<HTMLInputElement>(null);

  // Auto-clear uploaded items timer
  const [cloudListFadingOut, setCloudListFadingOut] = useState(false);
  const cloudFadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cloudClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    setCloudFiles(loadCloudFiles(effectiveUid));
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
      } catch (err) {
        toast.error("Could not rename folder on Drive. Updating local reference.");
      }
    }
    setCustomCloudFolderName(effectiveUid, newName);
    setCloudFolderName(newName);
    setRenameFolderModalOpen(false);
    toast.success(`Cloud folder set to "${newName}"`);
  };

  // File Upload to Google Drive with Automatic Categorization
  const handleCloudFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const token = getDriveAccessToken();
    if (!token) {
      toast.error("Please connect your Google Drive account first.");
      return;
    }

    if (cloudFadeTimeoutRef.current) clearTimeout(cloudFadeTimeoutRef.current);
    if (cloudClearTimeoutRef.current) clearTimeout(cloudClearTimeoutRef.current);
    setCloudListFadingOut(false);

    setUploadingCloudFile(true);
    setCloudUploadProgress(10);
    const uploadedRecords: CloudUploadedItem[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        const progressChunk = Math.round(10 + ((i + 1) / files.length) * 80);
        setCloudUploadProgress(progressChunk);

        const autoClassification = classifyFile(file.name);
        const resolvedCategory =
          cloudCategorySelection === "auto"
            ? autoClassification.category
            : (cloudCategorySelection as any);
        const resolvedSubfolder =
          resolvedCategory === "Documents"
            ? cloudDocumentSubfolder
            : autoClassification.suggestedSubfolder;

        const uploadRes = await uploadGenericFileToGoogleDrive({
          file,
          accessToken: token,
          category: resolvedCategory,
          documentSubfolder: resolvedSubfolder,
          customRootFolderName: cloudFolderName,
        });

        const newRecord: CloudUploadedItem = {
          id: uploadRes.fileId || `cloud_${Date.now()}_${i}`,
          name: file.name,
          category: resolvedCategory,
          documentSubfolder: resolvedSubfolder,
          folderPath: `${cloudFolderName}/${resolvedCategory}`,
          folderName: resolvedCategory,
          driveFileId: uploadRes.fileId,
          webViewLink: uploadRes.webViewLink,
          sizeFormatted: formatFileSize(file.size),
          uploadedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        uploadedRecords.push(newRecord);
      }

      setCloudUploadProgress(100);
      const nextCloudList = [...uploadedRecords, ...cloudFiles];
      setCloudFiles(nextCloudList);
      saveCloudFiles(effectiveUid, nextCloudList);
      toast.success(`Uploaded ${uploadedRecords.length} file(s) into organized Google Drive folders!`);

      // Auto-clear after 5 seconds with graceful fade out
      cloudFadeTimeoutRef.current = setTimeout(() => {
        setCloudListFadingOut(true);
      }, 4300);

      cloudClearTimeoutRef.current = setTimeout(() => {
        setCloudFiles([]);
        saveCloudFiles(effectiveUid, []);
        setCloudListFadingOut(false);
      }, 5000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload file(s) to Google Drive");
    } finally {
      setUploadingCloudFile(false);
      setCloudUploadProgress(0);
      if (cloudFileInputRef.current) cloudFileInputRef.current.value = "";
    }
  };

  const handleDeleteCloudFile = (id: string) => {
    const nextList = cloudFiles.filter((item) => item.id !== id);
    setCloudFiles(nextList);
    saveCloudFiles(effectiveUid, nextList);
    toast.success("Item removed from list");
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
    }
  };

  return (
    <div
      data-testid="cloudup-page-root"
      className="glass-scroll flex h-full w-full flex-col overflow-y-auto px-4 py-5 sm:px-8 sm:py-6 lg:px-12"
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-6 pb-12 pt-2 sm:pt-4">
        {/* Cloud Uploading Card with Full Window Dimensions */}
        <div className="flex flex-col gap-5 sm:gap-6 w-full">
          <GlassCard
            variant="panel"
            padding="md"
            className="frost-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6"
          >
            {/* Header: Title "Cloud Uploading", status & icon */}
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="bg-pearl flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-glass-edge shadow-sm">
                <CloudUpload className="h-5.5 w-5.5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                    Cloud Uploading
                  </h1>
                  {driveConnected && (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {driveConnected ? `Connected · ${driveEmail || "Google Drive"}` : "Sync with Google Drive"}
                </p>
              </div>
            </div>

            {/* Action Buttons: Uniform Size */}
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap sm:flex-nowrap">
              <button
                type="button"
                onClick={() => {
                  if (!driveConnected) {
                    toast.info("Please connect your Google Drive account first.");
                    return;
                  }
                  setCloudUploadModalOpen(true);
                }}
                data-testid="open-cloud-upload-btn"
                title={driveConnected ? "Upload files to Google Drive" : "Connect Google Drive to upload"}
                className={`flex h-9.5 min-w-[5.5rem] sm:min-w-[6.2rem] items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-all duration-300 ${
                  driveConnected
                    ? "btn-ink liquid-press shadow-sm opacity-100 cursor-pointer"
                    : "bg-white/5 dark:bg-white/5 text-muted-foreground/35 border border-white/5 opacity-35 cursor-not-allowed select-none shadow-none"
                }`}
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
        </div>
      </div>

      {/* CLOUD UPLOADING POPUP MODAL */}
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
                  <p className="text-xs text-muted-foreground">
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

            {/* Uploading Section: Drag and Drop Zone & Action Buttons */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  Target Root Folder:{" "}
                  <strong className="text-foreground">{cloudFolderName}</strong>
                </span>
                <span className="text-muted-foreground">
                  Format:{" "}
                  <strong className="text-foreground">Auto Category Organization</strong>
                </span>
              </div>

              {/* Category selector override (defaults to auto-detect) */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Category Mode:</span>
                <select
                  value={cloudCategorySelection}
                  onChange={(e) => setCloudCategorySelection(e.target.value)}
                  className="glass-input rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer"
                >
                  <option value="auto">Auto Detect from File Extension</option>
                  <option value="Videos">Videos</option>
                  <option value="Pictures">Pictures</option>
                  <option value="Documents">Documents</option>
                  <option value="Music">Music</option>
                  <option value="Audio">Audio</option>
                  <option value="Archives">Archives / Zips</option>
                  <option value="Design_And_3D">Design &amp; 3D</option>
                  <option value="Applications">Applications / Code</option>
                </select>

                {cloudCategorySelection === "Documents" && (
                  <select
                    value={cloudDocumentSubfolder}
                    onChange={(e) => setCloudDocumentSubfolder(e.target.value)}
                    className="glass-input rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer"
                  >
                    <option value="general">general</option>
                    <option value="reports">reports</option>
                    <option value="receipts">receipts</option>
                    <option value="contracts">contracts</option>
                    <option value="invoices">invoices</option>
                    <option value="notes">notes</option>
                  </select>
                )}
              </div>

              {/* Drag & Drop Upload Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  handleCloudFileUpload(e.dataTransfer.files);
                }}
                onClick={() => cloudFileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
                  isDraggingFile
                    ? "border-primary bg-primary/10 scale-[0.99]"
                    : "border-glass-edge bg-glass/20 hover:bg-glass/40"
                }`}
              >
                <input
                  ref={cloudFileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => handleCloudFileUpload(e.target.files)}
                  className="hidden"
                />
                <FolderUp className="h-10 w-10 text-primary mb-2 animate-bounce" />
                <p className="text-sm font-semibold text-foreground">
                  Drag and drop files here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload multiple files · Auto-sorted into Google Drive folders
                </p>
              </div>

              {uploadingCloudFile && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading &amp; organizing to Google Drive…</span>
                    <span>{cloudUploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-glass">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-300"
                      style={{ width: `${cloudUploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Real Organized Files List */}
              {cloudFiles.length > 0 && (
                <div
                  className={`space-y-2.5 pt-2 transition-all duration-700 ease-out ${
                    cloudListFadingOut
                      ? "opacity-0 -translate-y-2 pointer-events-none scale-[0.98]"
                      : "opacity-100 translate-y-0 scale-100"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span>Organized Cloud Files ({cloudFiles.length})</span>
                      <span className="text-[10px] text-muted-foreground/75">
                        (auto-clears in 5s)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (cloudFadeTimeoutRef.current) clearTimeout(cloudFadeTimeoutRef.current);
                        if (cloudClearTimeoutRef.current) clearTimeout(cloudClearTimeoutRef.current);
                        setCloudFiles([]);
                        saveCloudFiles(effectiveUid, []);
                        setCloudListFadingOut(false);
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-foreground truncate">{file.name}</p>
                              {file.category && (
                                <span
                                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                    file.category === "Videos"
                                      ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                      : file.category === "Pictures"
                                        ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20"
                                        : file.category === "Documents"
                                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                          : file.category === "Music"
                                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                            : file.category === "Audio"
                                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                              : file.category === "Archives"
                                                ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20"
                                                : file.category === "Design_And_3D"
                                                  ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
                                                  : file.category === "Applications"
                                                    ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20"
                                                    : "bg-muted text-muted-foreground border-border"
                                  }`}
                                >
                                  {file.category === "Documents" && file.documentSubfolder
                                    ? `DOC · ${file.documentSubfolder}`
                                    : file.category.replace(/_/g, " ")}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {file.sizeFormatted} ·{" "}
                              <span className="text-foreground/80">{file.folderPath || file.folderName}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              title="Open file in Google Drive"
                              className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDownloadCloudFile(file)}
                            title="Download file"
                            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                          >
                            <Upload className="h-3.5 w-3.5 rotate-180" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCloudFile(file.id)}
                            title="Remove from list"
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
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* RENAME CLOUD FOLDER POPUP MODAL */}
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
