import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { GlassCard } from "@/components/GlassCard";
import { SectionLoadingBar } from "@/components/SectionLoadingBar";
import { ChromeGlyph } from "@/components/three/ChromeGlyph";
import type { GlyphKind } from "@/components/three/ChromeScene";
import { GLYPH_IMAGES } from "@/lib/config";

export function ComingSoon({
  kind,
  name,
  index,
}: {
  kind: GlyphKind;
  name: string;
  index: string;
}) {
  const sectionKey = `${index}-${kind}`;
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [unmountedKey, setUnmountedKey] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const isRevealing = revealKey === sectionKey;
  const isLoaderMounted = unmountedKey !== sectionKey;

  useEffect(() => {
    setRevealKey(null);
    setUnmountedKey(null);
  }, [sectionKey]);

  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    if (!isRevealing) {
      gsap.set(contentEl, {
        opacity: 0,
        y: 10,
      });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        contentEl,
        {
          opacity: 0,
          y: 10,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.52,
          ease: "sine.out",
        },
      );
    }, contentEl);

    return () => {
      ctx.revert();
    };
  }, [isRevealing]);

  return (
    <GlassCard
      as="section"
      variant="panel"
      padding="md"
      className="relative flex h-full flex-col items-center justify-center overflow-hidden text-center"
    >
      <span className="absolute left-16 top-6 z-20 text-xs uppercase tracking-[0.3em] text-muted-foreground sm:left-20 sm:top-7">
        {index} — {name}
      </span>

      {isLoaderMounted && (
        <SectionLoadingBar
          key={sectionKey}
          glyphSrc={GLYPH_IMAGES[kind]}
          label={name}
          onFadeOutStart={() => setRevealKey(sectionKey)}
          onComplete={() => {
            setRevealKey(sectionKey);
            setUnmountedKey(sectionKey);
          }}
        />
      )}

      <div
        ref={contentRef}
        aria-hidden={!isRevealing}
        data-testid="section-loaded-content"
        className={`flex w-full flex-col items-center justify-center ${
          isRevealing ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <ChromeGlyph
          kind={kind}
          className="h-[42vh] w-full max-w-2xl sm:h-[50vh] md:h-[55vh]"
        />
        <h1 className="animate-rise text-4xl sm:text-5xl md:text-7xl">Coming soon</h1>
        <p className="mt-2.5 text-sm text-muted-foreground sm:mt-3">
          This space is being polished.
        </p>
      </div>
    </GlassCard>
  );
}
