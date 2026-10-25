import { useEffect } from "react";
import { getUser } from "@/lib/auth";
import { syncPrefsForUserSession } from "@/lib/prefs";

/** Bakes a bezel displacement map: pixels near the rim push the backdrop inward, the body stays flat. */
function makeLensMap(size = 256, bezel = 0.14) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1), v = y / (size - 1);
      const dl = u, dr = 1 - u, dt = v, db = 1 - v;
      let nx = 0, ny = 0;
      const fx = Math.max(0, 1 - Math.min(dl, dr) / bezel);
      const fy = Math.max(0, 1 - Math.min(dt, db) / bezel);
      // convex lens profile: displacement grows smoothly toward the rim
      nx = (dl < dr ? -1 : 1) * fx * fx * (3 - 2 * fx);
      ny = (dt < db ? -1 : 1) * fy * fy * (3 - 2 * fy);
      const i = (y * size + x) * 4;
      img.data[i] = 128 + nx * 127;
      img.data[i + 1] = 128 + ny * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** Applies saved glass settings, adds Chromium refraction, and lets glass catch light under the cursor. */
export function LiquidEffects() {
  useEffect(() => {
    const currentUser = getUser();
    syncPrefsForUserSession(currentUser?.uid ?? null);

    const isChromium = !!(navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.some((b) => /Chromium|Google Chrome|Edge/.test(b.brand));
    let svg: SVGSVGElement | null = null;
    if (isChromium) {
      const map = makeLensMap();
      const ns = "http://www.w3.org/2000/svg";
      svg = document.createElementNS(ns, "svg");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("style", "position:absolute;width:0;height:0;pointer-events:none");
      svg.innerHTML = `<filter id="liquid-lens" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feImage href="${map}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>
        <feDisplacementMap in="SourceGraphic" in2="map" scale="38" xChannelSelector="R" yChannelSelector="G" result="bent"/>
        <feColorMatrix in="bent" type="saturate" values="1.6"/>
      </filter>`;
      document.body.appendChild(svg);
      document.documentElement.classList.add("refract");
    }

    let last: HTMLElement | null = null;
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(".glass") as HTMLElement | null;
      if (last && last !== el) { last.style.removeProperty("--mx"); last.style.removeProperty("--my"); }
      last = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); svg?.remove(); };
  }, []);
  return null;
}
