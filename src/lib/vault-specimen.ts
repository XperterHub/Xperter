import type { VaultDocKey } from "@/lib/username-id";

/**
 * Generates a clean website-themed SVG preview card for stored vault documents
 * when no raster image is present (e.g., fallback certificate view).
 */
export function buildDocumentPreviewSvgDataUrl(params: {
  label: string;
  docKey: VaultDocKey;
  renamedFileName: string;
  driveFolderName: string;
  holderName: string;
  documentNumber: string;
  issueDate?: string;
  expiryDate?: string;
  theme?: "light" | "dark";
}): string {
  const accentByKey: Record<VaultDocKey, string> = {
    aadharcard: "#0284c7",
    voterid: "#4f46e5",
    pancard: "#0d9488",
    passbook: "#2563eb",
    drivinglicense: "#d97706",
    passport: "#1d4ed8",
    rationcard: "#059669",
    private_doc: "#6366f1",
  };
  const accent = accentByKey[params.docKey] || "#38bdf8";
  const isLight = params.theme === "light";

  const bgStart = isLight ? "#f4f6f9" : "#151822";
  const bgEnd = isLight ? "#e6ebf2" : "#1f2433";
  const strokeCol = isLight ? "rgba(30,41,59,0.14)" : "rgba(255,255,255,0.16)";
  const mutedCol = isLight ? "#64748b" : "#94a3b8";
  const inkCol = isLight ? "#0f172a" : "#f8fafc";
  const chipFill = isLight ? "rgba(15,23,42,0.05)" : "rgba(255,255,255,0.06)";

  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const validity =
    params.issueDate || params.expiryDate
      ? `${params.issueDate || "Active"}${params.expiryDate ? ` — ${params.expiryDate}` : ""}`
      : "Verified";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="500" viewBox="0 0 840 500">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgStart}"/>
        <stop offset="100%" stop-color="${bgEnd}"/>
      </linearGradient>
      <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${accent}"/>
        <stop offset="100%" stop-color="#60a5fa"/>
      </linearGradient>
    </defs>
    <rect width="840" height="500" rx="28" fill="url(#bg)"/>
    <rect x="1.5" y="1.5" width="837" height="497" rx="26.5" fill="none" stroke="${strokeCol}" stroke-width="2"/>
    <rect x="36" y="32" width="768" height="6" rx="3" fill="url(#accentBar)"/>

    <text x="44" y="78" fill="${mutedCol}" font-family="'Geist', ui-sans-serif, system-ui, sans-serif" font-size="13" font-weight="600" letter-spacing="1.6">XPERTER VAULT · ${esc(params.driveFolderName.toUpperCase())}</text>
    <text x="44" y="122" fill="${inkCol}" font-family="'Geist', ui-sans-serif, system-ui, sans-serif" font-size="32" font-weight="700">${esc(params.label)}</text>
    <rect x="44" y="146" width="752" height="1" fill="${strokeCol}"/>

    <text x="44" y="196" fill="${mutedCol}" font-family="'Geist', ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="600" letter-spacing="1.2">HOLDER</text>
    <text x="44" y="226" fill="${inkCol}" font-family="'Geist', ui-sans-serif, system-ui, sans-serif" font-size="22" font-weight="600">${esc(params.holderName || "Verified Holder")}</text>

    <text x="44" y="286" fill="${mutedCol}" font-family="'Geist', ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="600" letter-spacing="1.2">DOCUMENT NUMBER</text>
    <text x="44" y="320" fill="${accent}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="26" font-weight="700" letter-spacing="1.5">${esc(params.documentNumber || "VERIFIED")}</text>

    <rect x="44" y="366" width="752" height="92" rx="16" fill="${chipFill}" stroke="${strokeCol}" stroke-width="1"/>
    <text x="64" y="398" fill="${mutedCol}" font-family="'Geist', ui-sans-serif, system-ui, sans-serif" font-size="11" font-weight="600" letter-spacing="1">FILE</text>
    <text x="64" y="426" fill="${inkCol}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15">${esc(params.driveFolderName)}/${esc(params.renamedFileName)}</text>

    <text x="580" y="398" fill="${mutedCol}" font-family="'Geist', ui-sans-serif, system-ui, sans-serif" font-size="11" font-weight="600" letter-spacing="1">STATUS</text>
    <text x="580" y="426" fill="${inkCol}" font-family="'Geist', ui-sans-serif, system-ui, sans-serif" font-size="15" font-weight="600">${esc(validity)}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
