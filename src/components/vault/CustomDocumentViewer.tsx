import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  Copy,
  Download,
  FileCheck2,
  Maximize2,
  Minimize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import type { StoredVaultDocument } from "@/lib/google-drive-vault";
import { buildDocumentPreviewSvgDataUrl } from "@/lib/vault-specimen";

interface CustomDocumentViewerProps {
  document: StoredVaultDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (doc: StoredVaultDocument) => void;
  driveFolderName: string;
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(0, commaIdx);
    const body = dataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+)/i);
    const mime = mimeMatch?.[1] || "application/octet-stream";

    if (header.includes(";base64")) {
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mime });
    }

    return new Blob([decodeURIComponent(body)], { type: mime });
  } catch {
    return null;
  }
}

export function CustomDocumentViewer({
  document: doc,
  isOpen,
  onClose,
  onDownload,
  driveFolderName,
}: CustomDocumentViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  const isPdf = Boolean(
    doc &&
      (doc.mimeType?.includes("pdf") ||
        doc.dataUrl?.startsWith("data:application/pdf") ||
        doc.originalFileName?.toLowerCase().endsWith(".pdf") ||
        doc.renamedFileName?.toLowerCase().endsWith(".pdf")),
  );

  const isImage = Boolean(
    doc &&
      !isPdf &&
      (doc.mimeType?.startsWith("image/") || doc.dataUrl?.startsWith("data:image/")),
  );

  // Convert PDF data URLs to an object URL so Chromium/Firefox render inside iframe cleanly
  useEffect(() => {
    if (
      !isOpen ||
      !doc ||
      !isPdf ||
      !doc.dataUrl ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      setPdfBlobUrl(null);
      return;
    }
    const blob = dataUrlToBlob(doc.dataUrl);
    if (!blob) {
      setPdfBlobUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setPdfBlobUrl(objectUrl);
    return () => {
      if (typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [doc, isOpen, isPdf]);

  // Reset transform whenever a new document opens
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
    }
  }, [isOpen, doc?.id]);

  const fallbackPreviewUrl = useMemo(() => {
    if (!doc) return "";
    const isDark =
      typeof window !== "undefined" &&
      window.document.documentElement.classList.contains("dark");
    return buildDocumentPreviewSvgDataUrl({
      label: doc.label,
      docKey: doc.docKey,
      renamedFileName: doc.renamedFileName,
      driveFolderName: doc.driveFolderName || driveFolderName,
      holderName: doc.holderName,
      documentNumber: doc.documentNumber,
      ...(doc.issueDate ? { issueDate: doc.issueDate } : {}),
      ...(doc.expiryDate ? { expiryDate: doc.expiryDate } : {}),
      theme: isDark ? "dark" : "light",
    });
  }, [doc, driveFolderName]);

  if (!doc) return null;

  const handleCopyId = () => {
    if (!doc.documentNumber) return;
    navigator.clipboard?.writeText(doc.documentNumber);
    setCopiedId(true);
    toast.success("ID copied");
    setTimeout(() => setCopiedId(false), 1600);
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handleClose = () => {
    handleReset();
    setIsFullscreen(false);
    onClose();
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[80] transition-opacity" />
        <Dialog.Content
          data-testid="vault-document-viewer-modal"
          data-fullscreen={isFullscreen ? "true" : "false"}
          aria-describedby="viewer-meta-bar"
          className={`settings-popover glass fixed left-1/2 top-1/2 z-[85] flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-glass-edge text-foreground shadow-2xl outline-none transition-[width,height,max-width,border-radius] duration-300 ${
            isFullscreen
              ? "h-[96dvh] w-[96vw] max-w-[96vw] rounded-[1.5rem] p-3 sm:p-4"
              : "h-[min(88dvh,46rem)] w-[min(94vw,60rem)] rounded-[1.75rem] p-3.5 sm:p-5"
          }`}
        >
          {/* Compact Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-glass-edge/80 pb-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="bg-pearl flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-glass-edge text-primary shadow-sm">
                <FileCheck2 className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Dialog.Title className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
                    {doc.label}
                  </Dialog.Title>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      doc.syncedToDrive
                        ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "border border-glass-edge bg-glass text-muted-foreground"
                    }`}
                  >
                    {doc.syncedToDrive ? "Drive" : "Local"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{doc.holderName}</span>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    title="Copy ID"
                    className="inline-flex cursor-pointer items-center gap-1 font-mono text-[11px] text-foreground transition-colors hover:text-primary"
                  >
                    <span>{doc.documentNumber}</span>
                    {copiedId ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3 opacity-60" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Minimal Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                disabled={zoom <= 0.5}
                aria-label="Zoom out"
                title="Zoom Out"
                className="glass liquid-press flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-glass-edge text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleReset}
                title="Reset View"
                className="glass liquid-press h-8 cursor-pointer rounded-full border border-glass-edge px-2.5 text-[11px] font-medium tabular-nums text-muted-foreground hover:text-foreground"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                disabled={zoom >= 3}
                aria-label="Zoom in"
                title="Zoom In"
                className="glass liquid-press flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-glass-edge text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                aria-label="Rotate"
                title="Rotate 90°"
                className="glass liquid-press flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-glass-edge text-muted-foreground hover:text-foreground"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen((f) => !f)}
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                className="glass liquid-press hidden h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-glass-edge text-muted-foreground hover:text-foreground sm:flex"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onDownload(doc)}
                disabled={!doc.dataUrl}
                className="btn-ink liquid-press inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold shadow-sm disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden xs:inline sm:inline">Download</span>
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-glass hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Viewport Stage */}
          <div className="glass-scroll relative my-3 flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-2xl border border-glass-edge/80 bg-background/40 p-2 sm:p-4">
            {isPdf && pdfBlobUrl ? (
              <div
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.2s ease-out",
                }}
                className="flex h-full w-full items-center justify-center"
              >
                <iframe
                  title={doc.label}
                  src={`${pdfBlobUrl}#toolbar=0&navpanes=0&view=FitH`}
                  className="h-full min-h-[20rem] w-full rounded-xl border border-glass-edge/60 bg-background/80 shadow-lg"
                />
              </div>
            ) : isImage && doc.dataUrl ? (
              <div
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.2s ease-out",
                }}
                className="flex max-h-full max-w-full items-center justify-center"
              >
                <img
                  src={doc.dataUrl}
                  alt={doc.label}
                  className="max-h-full max-w-full rounded-xl object-contain shadow-md"
                />
              </div>
            ) : (
              <div
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.2s ease-out",
                }}
                className="flex max-h-full max-w-full items-center justify-center"
              >
                <img
                  src={doc.dataUrl?.startsWith("data:image/") ? doc.dataUrl : fallbackPreviewUrl}
                  alt={doc.label}
                  className="max-h-full max-w-full rounded-xl object-contain shadow-md"
                />
              </div>
            )}
          </div>

          {/* Concise Footer Metadata */}
          <div
            id="viewer-meta-bar"
            className="flex flex-wrap items-center justify-between gap-2 border-t border-glass-edge/70 pt-2.5 text-[11px] text-muted-foreground"
          >
            <div className="flex min-w-0 items-center gap-2 truncate">
              <span className="truncate font-mono text-foreground/90">{doc.renamedFileName}</span>
              <span>·</span>
              <span className="shrink-0 tabular-nums">{doc.sizeFormatted}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span>{doc.driveFolderName || driveFolderName}/</span>
              <span>·</span>
              <span>{isPdf ? "PDF" : isImage ? "Image" : "Record"}</span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
