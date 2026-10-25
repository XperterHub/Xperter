import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  clampLoaderProgress,
  formatLoaderPercentage,
  LOADER_FADEOUT_DURATION_SEC,
  LOADER_HOLD_AT_100_SEC,
  preloadSectionAsset,
  SECTION_LOADER_STAGES,
  type LoaderPhase,
} from "@/lib/page-loader";

interface SectionLoadingBarProps {
  glyphSrc?: string | undefined;
  label?: string | undefined;
  onFadeOutStart?: () => void;
  onComplete?: () => void;
}

export function SectionLoadingBar({
  glyphSrc,
  label = "Section",
  onFadeOutStart,
  onComplete,
}: SectionLoadingBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const onFadeOutStartRef = useRef(onFadeOutStart);
  const onCompleteRef = useRef(onComplete);
  onFadeOutStartRef.current = onFadeOutStart;
  onCompleteRef.current = onComplete;

  const [numericPercent, setNumericPercent] = useState(0);
  const [phase, setPhase] = useState<LoaderPhase>("loading");
  const percentText = formatLoaderPercentage(numericPercent);

  useEffect(() => {
    const root = rootRef.current;
    const fillEl = fillRef.current;

    if (!root || !fillEl) return;

    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setNumericPercent(100);
      setPhase("fading-out");
      onFadeOutStartRef.current?.();
      const id = window.setTimeout(() => {
        onCompleteRef.current?.();
      }, 120);
      return () => window.clearTimeout(id);
    }

    let cancelled = false;
    const assetReadyPromise = preloadSectionAsset(glyphSrc);
    const state = { progress: 0 };

    const syncProgress = () => {
      const clamped = clampLoaderProgress(state.progress);
      setNumericPercent(Math.round(clamped));
      const visualWidth = Math.max(8, clamped);
      fillEl.style.width = `${visualWidth}%`;
    };

    const tl = gsap.timeline();

    // Stages 1 & 2: 0% -> 39% -> 89%
    for (const stage of SECTION_LOADER_STAGES.slice(0, 2)) {
      tl.to(state, {
        progress: stage.targetPercent,
        duration: stage.durationSec,
        ease: stage.ease,
        onUpdate: syncProgress,
      });
    }

    // Wait for asset readiness before finishing to 100% and fading out
    tl.add(() => {
      tl.pause();
      void assetReadyPromise.then(() => {
        if (cancelled) return;
        tl.resume();
      });
    });

    // Stage 3: 89% -> 100%
    const finalStage = SECTION_LOADER_STAGES[2]!;
    tl.to(state, {
      progress: finalStage.targetPercent,
      duration: finalStage.durationSec,
      ease: finalStage.ease,
      onUpdate: syncProgress,
      onComplete: () => {
        setPhase("complete");
      },
    });

    // Subtle hold at 100% before starting the fade-out cross-dissolve
    tl.to(root, {
      duration: LOADER_HOLD_AT_100_SEC,
      onComplete: () => {
        setPhase("fading-out");
        onFadeOutStartRef.current?.();
      },
    });

    // Subtle fade-out animation into the revealed section content
    tl.to(root, {
      opacity: 0,
      y: -4,
      filter: "blur(4px)",
      duration: LOADER_FADEOUT_DURATION_SEC,
      ease: "sine.inOut",
      onComplete: () => {
        onCompleteRef.current?.();
      },
    });

    return () => {
      cancelled = true;
      tl.kill();
    };
  }, [glyphSrc]);

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      aria-label={`Loading ${label} ${percentText}`}
      data-testid="section-loading-bar"
      data-progress={numericPercent}
      data-phase={phase}
      className="loader-fade-container pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center p-6 select-none"
    >
      {/* Mobile: comfortable w-52; Desktop (sm/md): compact w-36 / w-40 */}
      <div className="flex w-52 max-w-full flex-col items-center gap-2.5 sm:w-36 sm:gap-2 md:w-40">
        {/* Stationary, Elegant Glassy Percentage Readout */}
        <div
          data-testid="section-loading-percent"
          className="loader-glass-text font-sans text-2xl font-light tracking-[-0.04em] tabular-nums sm:text-lg md:text-[19px]"
        >
          <span>{numericPercent}</span>
          <span className="ml-[1px] text-[0.72em] font-extralight opacity-75">%</span>
        </div>

        {/* Steady Liquid-Glass Shaded 2D Progress Bar */}
        <div
          data-testid="section-loading-track"
          className="loader-glass-track relative h-1.5 w-full overflow-hidden rounded-full sm:h-[5px]"
        >
          <div
            ref={fillRef}
            data-testid="section-loading-fill"
            style={{ width: "8%" }}
            className="loader-glass-fill h-full rounded-full"
          />
        </div>
      </div>
    </div>
  );
}
