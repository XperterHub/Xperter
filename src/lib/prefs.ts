export type Prefs = {
  theme: "light" | "dark";
  motion: boolean;
  glyphs: boolean;
  sounds: boolean;
  compact: boolean;
  blur: number;
  alpha: number;
  hue: number;
};

export const PREFS_KEY = "xperter-prefs";
export const USER_PREFS_PREFIX = "xperter-prefs:";

export const DEFAULT_PREFS: Prefs = {
  theme: "light",
  motion: true,
  glyphs: true,
  sounds: false,
  compact: false,
  blur: 26,
  alpha: 38,
  hue: 240,
};

export const TINTS = [
  { label: "Pearl", hue: 240 },
  { label: "Champagne", hue: 70 },
  { label: "Mist", hue: 190 },
  { label: "Blush", hue: 20 },
];

let activePrefsUid: string | null = null;
const prefsListeners = new Set<(prefs: Prefs) => void>();
let cloudSaveHandler: ((uid: string, prefs: Prefs) => void) | null = null;

export function registerCloudPrefsSaver(fn: (uid: string, prefs: Prefs) => void) {
  cloudSaveHandler = fn;
}

export function subscribePrefs(listener: (prefs: Prefs) => void): () => void {
  prefsListeners.add(listener);
  return () => {
    prefsListeners.delete(listener);
  };
}

function notifyPrefsListeners(p: Prefs) {
  for (const listener of prefsListeners) {
    listener(p);
  }
}

export function getUserPrefsKey(uid: string): string {
  return `${USER_PREFS_PREFIX}${uid}`;
}

export function loadPrefs(uid?: string | null): Prefs {
  const targetUid = uid !== undefined ? uid : activePrefsUid;
  try {
    if (targetUid) {
      const userRaw =
        localStorage.getItem(getUserPrefsKey(targetUid)) ||
        localStorage.getItem(`lumen-prefs:${targetUid}`);
      if (userRaw) {
        return { ...DEFAULT_PREFS, ...JSON.parse(userRaw) };
      }
    }
    const raw = localStorage.getItem(PREFS_KEY) || localStorage.getItem("lumen-prefs");
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function applyPrefs(p: Prefs) {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  r.classList.toggle("dark", p.theme === "dark");
  r.style.colorScheme = p.theme;
  r.style.setProperty("--glass-blur", `${p.blur}px`);
  r.style.setProperty("--glass-alpha", String(p.alpha / 100));
  r.style.setProperty("--glass-hue", String(p.hue));
  r.dataset["motion"] = p.motion ? "on" : "off";
}

export function savePrefs(p: Prefs, options?: { uid?: string | null; skipCloud?: boolean }) {
  const targetUid = options?.uid !== undefined ? options.uid : activePrefsUid;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    if (targetUid) {
      localStorage.setItem(getUserPrefsKey(targetUid), JSON.stringify(p));
    }
  } catch {
    // Ignore storage errors
  }
  applyPrefs(p);
  notifyPrefsListeners(p);
  if (targetUid && !options?.skipCloud && cloudSaveHandler) {
    cloudSaveHandler(targetUid, p);
  }
}

/**
 * Called when authentication state changes:
 * - Before login / on first visit (uid === null): starts from light theme unless explicitly toggled.
 * - After user login (uid is present): loads and applies that user's saved theme & frost preferences.
 */
export function syncPrefsForUserSession(
  uid: string | null,
  cloudOverrides?: Partial<Pick<Prefs, "theme" | "blur">>,
): Prefs {
  activePrefsUid = uid;
  if (!uid) {
    const currentPrefs = loadPrefs(null);
    applyPrefs(currentPrefs);
    notifyPrefsListeners(currentPrefs);
    return currentPrefs;
  }

  let base = DEFAULT_PREFS;
  try {
    const userRaw = localStorage.getItem(getUserPrefsKey(uid));
    if (userRaw) {
      base = { ...DEFAULT_PREFS, ...JSON.parse(userRaw) };
    } else {
      const globalRaw = localStorage.getItem(PREFS_KEY);
      if (globalRaw) {
        base = { ...DEFAULT_PREFS, ...JSON.parse(globalRaw) };
      }
    }
  } catch {
    base = DEFAULT_PREFS;
  }

  const merged: Prefs = {
    ...base,
    ...(cloudOverrides?.theme === "light" || cloudOverrides?.theme === "dark"
      ? { theme: cloudOverrides.theme }
      : {}),
    ...(typeof cloudOverrides?.blur === "number" &&
    cloudOverrides.blur >= 4 &&
    cloudOverrides.blur <= 48
      ? { blur: Math.round(cloudOverrides.blur) }
      : {}),
  };

  savePrefs(merged, { uid, skipCloud: true });
  return merged;
}
