import { useEffect, useRef } from "react";
import gsap from "gsap";
import { GLYPH_IMAGES, type GlyphKind } from "@/lib/config";

export type { GlyphKind };

export default function ChromeScene({
  kind,
  interactive = true,
}: {
  kind: GlyphKind;
  interactive?: boolean | undefined;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const echoRef = useRef<HTMLImageElement>(null);
  const mainRef = useRef<HTMLImageElement>(null);

  const src = GLYPH_IMAGES[kind] ?? GLYPH_IMAGES.hero;
  const isHero = kind === "hero";

  useEffect(() => {
    const stage = stageRef.current;
    const lens = lensRef.current;
    const echo = echoRef.current;
    const main = mainRef.current;
    if (!stage || !lens || !main || !echo) return;

    const ctx = gsap.context(() => {
      // Continuous GSAP liquid-glass morphing (scaleX/scaleY/rotation) on the refractive glass orb
      gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: "sine.inOut" } })
        .to(lens, {
          scaleX: 1.05,
          scaleY: 0.96,
          rotation: 10,
          duration: 4.8,
        })
        .to(lens, {
          scaleX: 0.96,
          scaleY: 1.05,
          rotation: -8,
          duration: 4.8,
        });

      // Continuous GSAP levitation & subtle 3D sway on the glass logo
      gsap.to(main, {
        y: isHero ? -12 : -7,
        rotationZ: 2.5,
        duration: isHero ? 3.8 : 3.2,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });

      gsap.to(echo, {
        y: isHero ? 10 : 6,
        scale: 1.08,
        duration: isHero ? 3.8 : 3.2,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    }, stage);

    if (!interactive) {
      return () => ctx.revert();
    }

    const rxMain = gsap.quickTo(main, "rotationX", { duration: 0.55, ease: "power3.out" });
    const ryMain = gsap.quickTo(main, "rotationY", { duration: 0.55, ease: "power3.out" });
    const xMain = gsap.quickTo(main, "x", { duration: 0.55, ease: "power3.out" });
    const sMain = gsap.quickTo(main, "scale", { duration: 0.5, ease: "power3.out" });

    const xEcho = gsap.quickTo(echo, "x", { duration: 0.7, ease: "power3.out" });
    const rxEcho = gsap.quickTo(echo, "rotationX", { duration: 0.7, ease: "power3.out" });
    const ryEcho = gsap.quickTo(echo, "rotationY", { duration: 0.7, ease: "power3.out" });

    const xLens = gsap.quickTo(lens, "x", { duration: 0.8, ease: "power3.out" });
    const yLens = gsap.quickTo(lens, "y", { duration: 0.8, ease: "power3.out" });

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));

      rxMain(-ny * 20);
      ryMain(nx * 24);
      xMain(nx * (isHero ? 18 : 10));
      sMain(1.04);

      xEcho(-nx * (isHero ? 22 : 12));
      rxEcho(-ny * 14);
      ryEcho(nx * 16);

      xLens(nx * (isHero ? 14 : 8));
      yLens(ny * (isHero ? 14 : 8));

      const lr = lens.getBoundingClientRect();
      lens.style.setProperty("--mx", `${e.clientX - lr.left}px`);
      lens.style.setProperty("--my", `${e.clientY - lr.top}px`);
    };

    const onLeave = () => {
      rxMain(0);
      ryMain(0);
      xMain(0);
      sMain(1);
      xEcho(0);
      rxEcho(0);
      ryEcho(0);
      xLens(0);
      yLens(0);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    stage.addEventListener("pointerleave", onLeave, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      ctx.revert();
    };
  }, [interactive, isHero, kind]);

  const lensSizeClasses = isHero
    ? "h-64 w-64 sm:h-80 sm:w-80 md:h-96 md:w-96 lg:h-[25rem] lg:w-[25rem]"
    : "h-40 w-40 sm:h-48 sm:w-48 md:h-52 md:w-52";

  const imgSizeClasses = isHero
    ? "h-52 w-52 sm:h-64 sm:w-64 md:h-76 md:w-76 lg:h-80 lg:w-80"
    : "h-32 w-32 sm:h-36 sm:w-36 md:h-40 md:w-40";

  return (
    <div
      ref={stageRef}
      className="relative flex h-full w-full items-center justify-center select-none overflow-hidden"
      style={{ perspective: "1000px" }}
    >
      {/* Organic liquid-glass refractive lens behind the glass logo */}
      <div
        ref={lensRef}
        className={`glass animate-blob pointer-events-none absolute rounded-full ${lensSizeClasses}`}
      />

      {/* Refracted glass depth-echo layer */}
      <img
        ref={echoRef}
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={`pointer-events-none absolute object-contain opacity-30 blur-[5px] will-change-transform ${imgSizeClasses}`}
      />

      {/* Primary crisp glass logo from the attached sheet */}
      <img
        ref={mainRef}
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={`pointer-events-none relative z-10 object-contain drop-shadow-[0_24px_38px_rgba(0,0,0,0.55)] will-change-transform ${imgSizeClasses}`}
      />
    </div>
  );
}
