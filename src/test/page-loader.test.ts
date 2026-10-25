import { describe, expect, it } from "vitest";
import {
  clampLoaderProgress,
  formatLoaderPercentage,
  LOADER_FADEOUT_DURATION_SEC,
  LOADER_HOLD_AT_100_SEC,
  normalizeRoutePath,
  preloadSectionAsset,
  SECTION_LOADER_STAGES,
  shouldTriggerPageLoader,
} from "@/lib/page-loader";

describe("Scoped Section Loading Bar logic", () => {
  it("clamps and formats loader percentages cleanly within [0%, 100%]", () => {
    expect(clampLoaderProgress(-10)).toBe(0);
    expect(clampLoaderProgress(120)).toBe(100);
    expect(formatLoaderPercentage(0)).toBe("0%");
    expect(formatLoaderPercentage(38.7)).toBe("39%");
    expect(formatLoaderPercentage(89.2)).toBe("89%");
    expect(formatLoaderPercentage(100)).toBe("100%");
    expect(formatLoaderPercentage(-15)).toBe("0%");
    expect(formatLoaderPercentage(142)).toBe("100%");
    expect(formatLoaderPercentage(Number.NaN)).toBe("0%");
  });

  it("defines progressive milestones and subtle fade-out timing constants", () => {
    expect(SECTION_LOADER_STAGES.map((s) => s.targetPercent)).toEqual([39, 89, 100]);
    for (const stage of SECTION_LOADER_STAGES) {
      expect(stage.durationSec).toBeGreaterThan(0);
    }
    expect(LOADER_HOLD_AT_100_SEC).toBeGreaterThan(0);
    expect(LOADER_FADEOUT_DURATION_SEC).toBeGreaterThanOrEqual(0.35);
  });

  it("resolves preloadSectionAsset cleanly when no asset URL is provided", async () => {
    await expect(preloadSectionAsset(undefined)).resolves.toBeUndefined();
  });

  it("normalizes route paths and detects distinct page transitions", () => {
    expect(normalizeRoutePath("/app/page-2/")).toBe("/app/page-2");
    expect(normalizeRoutePath("/app/page-2?tab=orbit#top")).toBe("/app/page-2");
    expect(shouldTriggerPageLoader("/app/page-2", "/app/page-3")).toBe(true);
    expect(shouldTriggerPageLoader("/app/page-2", "/app/page-2/")).toBe(false);
  });
});
