import { GlassCard } from "@/components/GlassCard";
import { ChromeGlyph } from "@/components/three/ChromeGlyph";
import type { GlyphKind } from "@/components/three/ChromeScene";

export function ComingSoon({
  kind,
  name,
  index,
}: {
  kind: GlyphKind;
  name: string;
  index: string;
}) {
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

      <div
        data-testid="section-loaded-content"
        className="flex w-full flex-col items-center justify-center"
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
