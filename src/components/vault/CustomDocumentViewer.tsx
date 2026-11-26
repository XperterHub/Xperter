import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Download,
  FileCheck2,
  Maximize2,
  Minimize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import type { StoredVaultDocument } from "@/lib/google-drive-vault";

interface CustomDocumentViewerProps {
  document: StoredVaultDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (doc: StoredVaultDocument) => void;
  driveFolderName: string;
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

  if (!doc) return null;

  const handleCopyId = () => {
    if (!doc.documentNumber) return;
    navigator.clipboard?.writeText(doc.documentNumber);
    setCopiedId(true);
    toast.success("Document ID copied");
    setTimeout(() => setCopiedId(false), 1800);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  const isImage = Boolean(
    doc.mimeType?.startsWith("image/") ||
      (doc.fileDataUrl && doc.fileDataUrl.startsWith("data:image/")),
  );
  const isPdf = Boolean(
    doc.mimeType?.includes("pdf") ||
      doc.originalFileName?.toLowerCase().endsWith(".pdf") ||
      doc.renamedFileName?.toLowerCase().endsWith(".pdf"),
  );

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleReset();
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[80] transition-opacity" />
        <Dialog.Content
          data-testid="vault-document-viewer-modal"
          aria-describedby="viewer-minimal-info"
          className={`settings-popover glass fixed left-1/2 top-1/2 z-[85] flex flex-col -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[2rem] p-4 text-foreground outline-none border border-glass-edge shadow-2xl transition-all duration-300 ${
            isFullscreen
              ? "h-[96dvh] w-[96vw] max-w-[96vw]"
              : "max-h-[90dvh] w-[min(94vw,56rem)]"
          }`}
        >
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-glass-edge/80 pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-pearl flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-glass-edge shadow-sm text-primary">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Dialog.Title className="truncate text-base font-semibold text-foreground tracking-tight">
                    {doc.label}
                  </Dialog.Title>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${
                      doc.syncedToDrive
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        : "bg-glass border border-glass-edge text-muted-foreground"
                    }`}
                  >
                    {doc.syncedToDrive ? "Drive Synced" : "Stored"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{doc.holderName}</span>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    title="Copy Document ID"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground hover:text-primary transition-colors cursor-pointer"
                  >
                    <span>{doc.documentNumber}</span>
                    {copiedId ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3 opacity-60 hover:opacity-100" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Viewer Controls */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                title="Zoom Out"
                className="glass-pill liquid-press rounded-full p-2 text-muted-foreground hover:text-foreground border border-glass-edge disabled:opacity-40"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleReset}
                title="Reset Zoom & Rotation"
                className="glass-pill liquid-press rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground border border-glass-edge"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                title="Zoom In"
                className="glass-pill liquid-press rounded-full p-2 text-muted-foreground hover:text-foreground border border-glass-edge disabled:opacity-40"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleRotate}
                title="Rotate 90°"
                className="glass-pill liquid-press rounded-full p-2 text-muted-foreground hover:text-foreground border border-glass-edge"
              >
                <RotateCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen((f) => !f)}
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                className="glass-pill liquid-press rounded-full p-2 text-muted-foreground hover:text-foreground border border-glass-edge"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => onDownload(doc)}
                title="Download Document"
                className="btn-ink liquid-press inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  title="Close Viewer"
                  className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-glass"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Interactive Document Display Canvas */}
          <div className="relative flex-1 min-h-[360px] max-h-[calc(90dvh-120px)] overflow-auto rounded-2xl border border-glass-edge/80 bg-glass/30 p-3 sm:p-5 flex items-center justify-center my-3">
            {isPdf && doc.fileDataUrl ? (
              <div
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.2s ease-out",
                }}
                className="w-full h-full min-h-[460px] flex items-center justify-center"
              >
                <object
                  data={doc.fileDataUrl}
                  type="application/pdf"
                  className="w-full h-full min-h-[460px] rounded-xl shadow-lg border border-glass-edge/40 bg-white dark:bg-slate-900"
                >
                  <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
                    <img
                      src={doc.previewDataUrl || doc.fileDataUrl}
                      alt={doc.label}
                      className="max-h-[380px] rounded-xl object-contain shadow-md"
                    />
                    <p className="text-xs text-muted-foreground">
                      Previewing secure PDF certificate. Click download for native viewing.
                    </p>
                  </div>
                </object>
              </div>
            ) : isImage && doc.fileDataUrl ? (
              <div
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.2s ease-out",
                }}
                className="flex items-center justify-center"
              >
                <img
                  src={doc.fileDataUrl}
                  alt={doc.label}
                  className="max-h-[520px] max-w-full rounded-xl object-contain shadow-md"
                />
              </div>
            ) : (
              <div
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.2s ease-out",
                }}
                className="flex items-center justify-center"
              >
                <img
                  src={doc.previewDataUrl || doc.fileDataUrl}
                  alt={doc.label}
                  className="max-h-[440px] max-w-full rounded-xl object-contain shadow-md"
                />
              </div>
            )}
          </div>

          {/* Minimal Info Bar (Simple, Concise, No Long Sentences) */}
          <div
            id="viewer-minimal-info"
            className="flex flex-wrap items-center justify-between gap-2 border-t border-glass-edge/70 pt-2.5 text-[11px] text-muted-foreground"
          >
            <div className="flex items-center gap-3">
              <span>
                File: <strong className="text-foreground font-medium">{doc.renamedFileName}</strong>
              </span>
              <span>·</span>
              <span>Size: {doc.sizeFormatted}</span>
            </div>
            <div className="flex items-center gap-3">
              <span>Drive: {driveFolderName}/</span>
              <span>·</span>
              <span>Format: {isPdf ? "PDF" : isImage ? "Image" : "Document"}</span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
