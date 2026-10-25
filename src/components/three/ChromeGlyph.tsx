import ChromeScene, { type GlyphKind } from "./ChromeScene";

export function ChromeGlyph({
  kind,
  className,
  interactive,
}: {
  kind: GlyphKind;
  className?: string;
  interactive?: boolean | undefined;
}) {
  return (
    <div className={className} aria-hidden="true">
      <ChromeScene kind={kind} interactive={interactive} />
    </div>
  );
}
