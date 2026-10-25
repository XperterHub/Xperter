export type RingtoneType = "chime" | "beep" | "zen" | "radar";

export interface TaskSettings {
  ringtone: RingtoneType;
  volume: number; // 0 to 1
  defaultAlarmTime: string; // "18:00"
  haptics: boolean;
}

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  ringtone: "chime",
  volume: 0.8,
  defaultAlarmTime: "18:00",
  haptics: true,
};

const SETTINGS_KEY = "lumen.task.settings.v1";

export function loadTaskSettings(): TaskSettings {
  if (typeof window === "undefined") return DEFAULT_TASK_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_TASK_SETTINGS;
    return { ...DEFAULT_TASK_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_TASK_SETTINGS;
  }
}

export function saveTaskSettings(settings: TaskSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors
  }
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === "suspended") {
      void sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Synthesizes alarm ringtones with Web Audio API.
 */
export function playAlarmSound(type: RingtoneType = "chime", volume: number = 0.8): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(Math.max(0.05, Math.min(1, volume)), now);
  masterGain.connect(ctx.destination);

  switch (type) {
    case "beep": {
      // 3 crisp digital pulses
      [0, 0.16, 0.32].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(idx === 2 ? 1046.5 : 880, now + offset);

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2200, now + offset);

        gain.gain.setValueAtTime(0.001, now + offset);
        gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.1);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(now + offset);
        osc.stop(now + offset + 0.12);
      });
      break;
    }

    case "zen": {
      // Deep resonant singing bowl gong
      [216, 432, 648].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);

        const initGain = idx === 0 ? 0.22 : 0.08 / idx;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(initGain, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 1.25);
      });
      break;
    }

    case "radar": {
      // High-tech liquid sonar ping
      [0, 0.22].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1400, now + offset);
        osc.frequency.exponentialRampToValueAtTime(800, now + offset + 0.18);

        gain.gain.setValueAtTime(0.001, now + offset);
        gain.gain.linearRampToValueAtTime(0.15, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now + offset);
        osc.stop(now + offset + 0.2);
      });
      break;
    }

    case "chime":
    default: {
      // Harmonic crystal bell arpeggio (C5, E5, G5, C6)
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.11);

        gain.gain.setValueAtTime(0.001, now + i * 0.11);
        gain.gain.linearRampToValueAtTime(0.12, now + i * 0.11 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.11 + 0.36);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now + i * 0.11);
        osc.stop(now + i * 0.11 + 0.4);
      });
      break;
    }
  }
}
