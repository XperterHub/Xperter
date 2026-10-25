import { type RefObject, useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Moon, Sun, X, Droplets } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PREFS as DEFAULTS,
  loadPrefs,
  savePrefs,
  subscribePrefs,
  type Prefs,
} from "@/lib/prefs";

export function SettingsGear({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      {open ? (
        <g className="origin-center transition-transform duration-300" style={{ transformBox: "fill-box" }}>
          <path d="M6.5 6.5L17.5 17.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M17.5 6.5L6.5 17.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </g>
      ) : (
        <g className="transition-transform duration-500">
          {/* Top slider track & knob */}
          <line x1="3.5" y1="8.25" x2="20.5" y2="8.25" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeOpacity="0.55" />
          <circle
            cx="9"
            cy="8.25"
            r="2.75"
            fill="var(--background)"
            stroke="currentColor"
            strokeWidth="1.85"
            className="transition-transform duration-500 ease-out group-hover:translate-x-[6px]"
          />
          {/* Bottom slider track & knob */}
          <line x1="3.5" y1="15.75" x2="20.5" y2="15.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeOpacity="0.55" />
          <circle
            cx="15"
            cy="15.75"
            r="2.75"
            fill="var(--background)"
            stroke="currentColor"
            strokeWidth="1.85"
            className="transition-transform duration-500 ease-out group-hover:-translate-x-[6px]"
          />
        </g>
      )}
    </svg>
  );
}

let sharedAudioCtx: AudioContext | null = null;

export function triggerSettingsHaptic(opening: boolean) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(opening ? 10 : 8);
    }
  } catch {
    // Ignore haptic errors on unsupported devices or restricted contexts
  }
}

export function playSettingsLiquidSound(opening: boolean) {
  try {
    if (typeof window === "undefined") return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AudioCtx();
    }
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const duration = opening ? 0.15 : 0.14;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sine";
    const startFreq = opening ? 118 : 164;
    const endFreq = opening ? 172 : 104;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(240, now);
    filter.Q.setValueAtTime(1.2, now);

    const peakGain = opening ? 0.045 : 0.038;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.022);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.01);
  } catch {
    // Ignore audio feedback errors if blocked by autoplay policy or unsupported environment
  }
}

export interface SettingsControlProps {
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  popoverClassName?: string;
  anchorRef?: RefObject<HTMLElement | null>;
}

export function SettingsControl({
  className = "",
  side = "top",
  align = "end",
  sideOffset = 12,
  alignOffset = 0,
  collisionPadding = 12,
  popoverClassName,
  anchorRef,
}: SettingsControlProps) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  useEffect(() => {
    setPrefs(loadPrefs());
    return subscribePrefs((next) => {
      setPrefs(next);
    });
  }, []);
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen((prev) => {
      if (prev !== nextOpen) {
        triggerSettingsHaptic(nextOpen);
        playSettingsLiquidSound(nextOpen);
      }
      return nextOpen;
    });
  };
  const update = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    savePrefs(next);
  };
  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label={open ? "Close settings" : "Open settings"}
          title="Settings"
          className={`group glass settings-trigger-btn relative z-[60] flex h-11 w-11 items-center justify-center rounded-full text-foreground/90 hover:text-foreground ${className}`}
        >
          <SettingsGear open={open} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        updatePositionStrategy="always"
        aria-labelledby="settings-title"
        className={cn(
          "settings-popover glass z-[70] w-72 max-w-[calc(100vw-2rem)] rounded-[1.75rem] p-5 text-foreground",
          popoverClassName,
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="settings-title" className="text-lg font-medium">Settings</h2>
          <Button variant="ghost" size="icon" className="settings-trigger-btn h-7 w-7 rounded-full text-muted-foreground hover:text-foreground" aria-label="Dismiss settings" title="Close settings" onClick={() => handleOpenChange(false)}><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Theme</span>
          <div className="flex items-center gap-2">
            <Sun aria-hidden className={`h-4 w-4 transition-transform duration-300 ${prefs.theme === "light" ? "scale-110 text-foreground" : "text-muted-foreground"}`} />
            <Switch checked={prefs.theme === "dark"} onCheckedChange={(dark) => update("theme", dark ? "dark" : "light")} aria-label="Dark theme" />
            <Moon aria-hidden className={`h-4 w-4 transition-transform duration-300 ${prefs.theme === "dark" ? "scale-110 text-foreground" : "text-muted-foreground"}`} />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{prefs.theme === "dark" ? "Dark" : "Light"}</p>
        <div className="mt-5 border-t border-border pt-5">
          <div className="flex items-center justify-between text-sm"><label htmlFor="settings-frost" className="flex items-center gap-2 font-medium"><Droplets aria-hidden className="h-4 w-4 text-muted-foreground" />Frost</label><span className="text-xs tabular-nums text-muted-foreground">{Math.round((prefs.blur - 4) / 44 * 100)}%</span></div>
          <Slider id="settings-frost" className="mt-4 mb-2" min={4} max={48} step={1} value={[prefs.blur]} onValueChange={([v]) => update("blur", v ?? prefs.blur)} aria-label="Frost" />
        </div>
      </PopoverContent>
    </Popover>
  );
}
