export interface SectionLoaderStage {
  targetPercent: number;
  durationSec: number;
  ease: string;
}

export type LoaderPhase = "loading" | "complete" | "fading-out";

/**
 * Staged progress milestones modeled after the reference loading bar video
 * (0% -> 39% -> 89% -> 100%).
 */
export const SECTION_LOADER_STAGES: readonly SectionLoaderStage[] = [
  { targetPercent: 39, durationSec: 0.38, ease: "power2.out" },
  { targetPercent: 89, durationSec: 0.42, ease: "sine.inOut" },
  { targetPercent: 100, durationSec: 0.24, ease: "power3.out" },
] as const;

/**
 * Brief pause at 100% before starting the subtle fade-out transition.
 */
export const LOADER_HOLD_AT_100_SEC = 0.12;

/**
 * Duration of the subtle fade-out transition once section content is ready.
 */
export const LOADER_FADEOUT_DURATION_SEC = 0.45;

/**
 * Clamps a raw progress number into [0, 100].
 */
export function clampLoaderProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * Formats a raw progress number into a clamped integer percentage string ("0%" .. "100%").
 */
export function formatLoaderPercentage(value: number): string {
  return `${Math.round(clampLoaderProgress(value))}%`;
}

/**
 * Preloads an image asset in the background and resolves when decoded (or after timeoutMs)
 * so the loading bar only transitions out once the section visual is ready.
 */
export function preloadSectionAsset(
  src: string | undefined,
  timeoutMs = 600,
): Promise<void> {
  if (!src || typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    const img = new Image();
    img.onload = () => {
      window.clearTimeout(timer);
      finish();
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish();
    };
    img.src = src;
  });
}

/**
 * Normalizes a route pathname by stripping query/hash and trailing slashes.
 */
export function normalizeRoutePath(path: string | null | undefined): string {
  if (!path || typeof path !== "string") return "";
  const withoutQuery = path.split("?")[0]?.split("#")[0] ?? "";
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

/**
 * Determines whether a pathname change represents a distinct route transition.
 */
export function shouldTriggerPageLoader(
  prevPath: string | null | undefined,
  nextPath: string | null | undefined,
): boolean {
  const cleanPrev = normalizeRoutePath(prevPath);
  const cleanNext = normalizeRoutePath(nextPath);
  if (!cleanPrev || !cleanNext) return false;
  return cleanPrev !== cleanNext;
}
