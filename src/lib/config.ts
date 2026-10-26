export const APP_NAME = "Xperter";

export type GlyphKind = "hero" | "messages" | "rings" | "cross" | "knot" | "square" | "segments" | "brand";

const getBasePath = () => {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/Xperter")) {
    return "/Xperter";
  }
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return base || "";
};

const base = getBasePath();

export const GLYPH_IMAGES: Record<GlyphKind, string> = {
  brand: `${base}/assets/glyphs/glyph-r1c1.png`,
  hero: `${base}/assets/glyphs/glyph-r3c3.png`,
  messages: `${base}/assets/glyphs/glyph-r2c5.png`,
  rings: `${base}/assets/glyphs/glyph-r1c3.png`,
  cross: `${base}/assets/glyphs/glyph-r1c4.png`,
  knot: `${base}/assets/glyphs/glyph-r2c4.png`,
  square: `${base}/assets/glyphs/glyph-r3c4.png`,
  segments: `${base}/assets/glyphs/glyph-r5c3.png`,
};

export const APP_PAGES = [
  { to: "/app/messages", label: "Messages", short: "01", glyph: "messages", live: true },
  { to: "/app/page-2", label: "Profile", short: "02", glyph: "rings", live: true },
  { to: "/app/page-3", label: "Task", short: "03", glyph: "cross", live: true },
  { to: "/app/page-4", label: "Loop", short: "04", glyph: "knot", live: false },
  { to: "/app/page-5", label: "Facet", short: "05", glyph: "square", live: false },
  { to: "/app/page-6", label: "Halo", short: "06", glyph: "segments", live: false },
] as const;
