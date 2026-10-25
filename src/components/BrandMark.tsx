import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import gsap from "gsap";
import { APP_NAME, GLYPH_IMAGES } from "@/lib/config";

export function BrandIcon({ size = 56, src = GLYPH_IMAGES.brand }: { size?: number; src?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const iconSize = Math.round(size * 0.78);

  useEffect(() => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap) return;

    const floatTween = gsap.to(img, {
      y: -1.5,
      scale: 1.03,
      duration: 2.6,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
    });

    const rxTo = gsap.quickTo(img, "rotationX", { duration: 0.45, ease: "power3.out" });
    const ryTo = gsap.quickTo(img, "rotationY", { duration: 0.45, ease: "power3.out" });
    const xTo = gsap.quickTo(img, "x", { duration: 0.45, ease: "power3.out" });
    const yTo = gsap.quickTo(img, "y", { duration: 0.45, ease: "power3.out" });

    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
      rxTo(-ny * 18);
      ryTo(nx * 18);
      xTo(nx * 2.5);
      yTo(ny * 2.5);
    };

    const onLeave = () => {
      rxTo(0);
      ryTo(0);
      xTo(0);
      yTo(0);
    };

    wrap.addEventListener("pointermove", onMove, { passive: true });
    wrap.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      floatTween.kill();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="glass relative flex items-center justify-center overflow-hidden rounded-full border border-glass-edge shadow-[inset_0_1px_1px_rgba(255,255,255,0.28)]"
      style={{ width: size, height: size, perspective: "320px" }}
    >
      <img
        ref={imgRef}
        src={src}
        alt="Xperter logo"
        referrerPolicy="no-referrer"
        draggable={false}
        width={iconSize}
        height={iconSize}
        className="select-none object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)] will-change-transform"
      />
    </div>
  );
}

export function BrandMark() {
  return (
    <Link to="/" className="group flex items-center gap-2.5 text-foreground">
      <BrandIcon size={38} />
      <span className="text-sm font-medium tracking-tight">{APP_NAME}</span>
    </Link>
  );
}
