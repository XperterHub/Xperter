import type { VaultDocKey } from "@/lib/username-id";

/**
 * Generates a crisp SVG data URL representing a stored document card when the user
 * enters document details or uploads a file that needs a visual preview sheet.
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
  const accent = accentByKey[params.docKey] || "#2563eb";
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="520" viewBox="0 0 840 520">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
      <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${accent}"/>
        <stop offset="100%" stop-color="#38bdf8"/>
      </linearGradient>
    </defs>
    <rect width="840" height="520" rx="28" fill="url(#bg)"/>
    <rect x="2" y="2" width="836" height="516" rx="26" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
    <rect x="36" y="34" width="768" height="10" rx="5" fill="url(#bar)"/>
    <text x="44" y="88" fill="#94a3b8" font-family="monospace" font-size="14" letter-spacing="2">LUMEN ENCRYPTED DOCUMENT VAULT · ${esc(params.driveFolderName.toUpperCase())}</text>
    <text x="44" y="132" fill="#f8fafc" font-family="sans-serif" font-size="32" font-weight="700">${esc(params.label)}</text>
    <rect x="44" y="158" width="752" height="1" fill="rgba(255,255,255,0.12)"/>
    <text x="44" y="206" fill="#94a3b8" font-family="sans-serif" font-size="13" letter-spacing="1.5">DOCUMENT HOLDER NAME</text>
    <text x="44" y="236" fill="#f8fafc" font-family="sans-serif" font-size="22" font-weight="600">${esc(params.holderName || "Verified Account Holder")}</text>
    <text x="44" y="294" fill="#94a3b8" font-family="sans-serif" font-size="13" letter-spacing="1.5">DOCUMENT / IDENTIFICATION NUMBER</text>
    <text x="44" y="328" fill="#38bdf8" font-family="monospace" font-size="26" font-weight="700" letter-spacing="2">${esc(params.documentNumber || "DOC-VERIFIED")}</text>
    <text x="44" y="392" fill="#94a3b8" font-family="sans-serif" font-size="12" letter-spacing="1.2">GOOGLE DRIVE AUTO-RENAMED FILE</text>
    <text x="44" y="418" fill="#e2e8f0" font-family="monospace" font-size="17">${esc(params.driveFolderName)} / ${esc(params.renamedFileName)}</text>
    <text x="540" y="392" fill="#94a3b8" font-family="sans-serif" font-size="12" letter-spacing="1.2">VALIDITY / RECORD DATE</text>
    <text x="540" y="418" fill="#e2e8f0" font-family="monospace" font-size="16">${esc(params.issueDate || "Active")} ${params.expiryDate ? "→ " + esc(params.expiryDate) : ""}</text>
    <rect x="44" y="452" width="752" height="36" rx="10" fill="rgba(255,255,255,0.05)"/>
    <text x="62" y="475" fill="#94a3b8" font-family="monospace" font-size="13">AUTHENTICATED PERSONAL RECORD · PROTECTED BY SEPARATE VAULT PASSWORD</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
