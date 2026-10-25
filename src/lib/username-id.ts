import { BLUEPRINT_LIMITS } from "@/lib/firebase";

export type VaultDocKey =
  | "aadharcard"
  | "voterid"
  | "pancard"
  | "passbook"
  | "drivinglicense"
  | "passport"
  | "rationcard"
  | "private_doc";

export interface VaultDocumentDefinition {
  key: VaultDocKey;
  label: string;
  shortLabel: string;
  category: "government" | "financial" | "private";
  fileSuffix: string;
  description: string;
  idPlaceholder: string;
}

export const VAULT_DOCUMENT_TYPES: VaultDocumentDefinition[] = [
  {
    key: "aadharcard",
    label: "Aadhaar Card",
    shortLabel: "Aadhaar",
    category: "government",
    fileSuffix: "aadharcard",
    description: "12-digit Unique Identification Authority of India (UIDAI) identity document",
    idPlaceholder: "XXXX-XXXX-XXXX",
  },
  {
    key: "voterid",
    label: "Voter ID (EPIC)",
    shortLabel: "Voter ID",
    category: "government",
    fileSuffix: "voterd",
    description: "Election Commission of India Electors Photo Identity Card",
    idPlaceholder: "ABC1234567",
  },
  {
    key: "pancard",
    label: "PAN Card",
    shortLabel: "PAN Card",
    category: "financial",
    fileSuffix: "pancard",
    description: "Permanent Account Number issued by the Income Tax Department",
    idPlaceholder: "ABCDE1234F",
  },
  {
    key: "passbook",
    label: "Account Passbook & Card",
    shortLabel: "Passbook & Card",
    category: "financial",
    fileSuffix: "passbook",
    description: "Bank account passbook front page, IFSC details, and debit/credit card record",
    idPlaceholder: "A/C ···· 4829 · IFSC",
  },
  {
    key: "drivinglicense",
    label: "Driving License",
    shortLabel: "Driving License",
    category: "government",
    fileSuffix: "drivinglicense",
    description: "Motor vehicle driving license issued by the Regional Transport Office",
    idPlaceholder: "TN-01-20240012345",
  },
  {
    key: "passport",
    label: "Passport",
    shortLabel: "Passport",
    category: "government",
    fileSuffix: "passport",
    description: "International travel and sovereign identity passport document",
    idPlaceholder: "P1234567",
  },
  {
    key: "rationcard",
    label: "Ration Card",
    shortLabel: "Ration Card",
    category: "government",
    fileSuffix: "rationcard",
    description: "State civil supplies & household identity ration card",
    idPlaceholder: "RC-98234102",
  },
  {
    key: "private_doc",
    label: "Private & Custom Document",
    shortLabel: "Private Doc",
    category: "private",
    fileSuffix: "privatedoc",
    description: "Degree certificates, insurance policies, property deeds, or private records",
    idPlaceholder: "DOC-REF-001",
  },
];

/**
 * Reserved / pre-existing usernames in the workspace directory so collision detection
 * works immediately even when offline or before querying cloud users.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "lumen",
  "support",
  "system",
  "alex",
  "alex_chen",
  "maya",
  "maya_lin",
  "arjun",
  "arjun_mehta",
  "sara",
  "sara_vance",
  "dev_ops",
  "lmn-7k4p9x",
  "lmn-9x2m4k",
  "lmn-3p8w5n",
  "nagaraj",
  "user",
  "test",
]);

/**
 * Cleans a raw username or user ID into a safe, canonical format (lowercase alphanumeric + underscores/hyphens).
 * Preserves `LMN-XXXXXX` uppercase style only if explicitly prefixed with `LMN-`, otherwise normalizes
 * to a clean lowercase handle like `nagaraj_98`.
 */
export function sanitizeUsernameId(raw: string): string {
  const trimmed = raw.trim().replace(/^@+/, "");
  if (!trimmed) return "";
  if (/^lmn-/i.test(trimmed)) {
    return trimmed
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, BLUEPRINT_LIMITS.MAX_LUMEN_ID_LENGTH);
  }
  return trimmed
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, BLUEPRINT_LIMITS.MAX_LUMEN_ID_LENGTH);
}

/**
 * Cleans a username prefix specifically for Google Drive folder and document naming
 * (e.g., `nagaraj_doc`, `nagaraj_voterd`, `nagaraj_aadharcard`).
 */
export function cleanUsernamePrefix(usernameOrId: string): string {
  const cleaned = usernameOrId
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/^lmn[-_]?/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "user";
}

/**
 * Returns the Google Drive folder name `<username>_doc` as required by the spec.
 */
export function formatVaultFolderName(usernameOrId: string): string {
  const prefix = cleanUsernamePrefix(usernameOrId);
  return `${prefix}_doc`;
}

/**
 * Returns the standardized document filename inside `<username>_doc`,
 * e.g. `nagaraj_voterd.pdf`, `nagaraj_aadharcard.jpg`, `nagaraj_pancard.pdf`.
 */
export function formatVaultDocumentFileName(
  usernameOrId: string,
  docKey: VaultDocKey,
  originalFileName?: string,
  customSlug?: string,
): { baseName: string; fullFileName: string; extension: string } {
  const prefix = cleanUsernamePrefix(usernameOrId);
  const def = VAULT_DOCUMENT_TYPES.find((d) => d.key === docKey);
  const rawSuffix =
    docKey === "private_doc" && customSlug
      ? cleanUsernamePrefix(customSlug)
      : def?.fileSuffix || docKey;

  const baseName = `${prefix}_${rawSuffix}`;
  let ext = "";
  if (originalFileName && originalFileName.includes(".")) {
    const candidate = originalFileName.split(".").pop()?.toLowerCase() ?? "";
    if (/^[a-z0-9]{2,5}$/.test(candidate)) {
      ext = candidate;
    }
  }
  const fullFileName = ext ? `${baseName}.${ext}` : baseName;
  return { baseName, fullFileName, extension: ext };
}

export interface UsernameValidationResult {
  valid: boolean;
  normalized: string;
  reason?: string;
}

export function validateUsernameFormat(raw: string): UsernameValidationResult {
  const normalized = sanitizeUsernameId(raw);
  if (!normalized) {
    return {
      valid: false,
      normalized: "",
      reason: "Enter a unique username (at least 4 characters)",
    };
  }
  if (normalized.length < 4) {
    return {
      valid: false,
      normalized,
      reason: "Unique username must be at least 4 characters long",
    };
  }
  if (normalized.length > BLUEPRINT_LIMITS.MAX_LUMEN_ID_LENGTH) {
    return {
      valid: false,
      normalized,
      reason: `Unique username cannot exceed ${BLUEPRINT_LIMITS.MAX_LUMEN_ID_LENGTH} characters`,
    };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      reason: "Use only letters, numbers, underscores (_), or hyphens (-)",
    };
  }
  return { valid: true, normalized };
}

const SUFFIX_WORDS = [
  "nova",
  "prime",
  "orbit",
  "flux",
  "arc",
  "zen",
  "pulse",
  "core",
  "lynx",
  "vega",
  "sol",
  "aura",
];

/**
 * Generates guaranteed-unique username variations that do not collide with `takenSet`.
 */
export function generateUsernameSuggestions(
  seedInput: string,
  takenIds: Iterable<string> = [],
  count = 4,
  randomFn: () => number = Math.random,
): string[] {
  const takenLower = new Set<string>();
  for (const id of RESERVED_USERNAMES) {
    takenLower.add(id.toLowerCase());
  }
  for (const id of takenIds) {
    takenLower.add(id.trim().toLowerCase());
  }

  const baseRaw = cleanUsernamePrefix(seedInput || "lumen_user").slice(0, 16);
  const base = baseRaw.length >= 3 ? baseRaw : `user_${baseRaw}`;

  const results: string[] = [];
  const used = new Set<string>();

  const tryAdd = (candidateRaw: string) => {
    const clean = sanitizeUsernameId(candidateRaw);
    if (
      clean.length >= 4 &&
      clean.length <= BLUEPRINT_LIMITS.MAX_LUMEN_ID_LENGTH &&
      !takenLower.has(clean.toLowerCase()) &&
      !used.has(clean.toLowerCase())
    ) {
      used.add(clean.toLowerCase());
      results.push(clean);
    }
  };

  // Strategy 1: base + 2-3 digit number
  for (let i = 0; i < 16 && results.length < count; i++) {
    const num = Math.floor(randomFn() * 899) + 100;
    const word = SUFFIX_WORDS[Math.floor(randomFn() * SUFFIX_WORDS.length)] ?? "nova";
    if (i % 3 === 0) {
      tryAdd(`${base}_${num}`);
    } else if (i % 3 === 1) {
      tryAdd(`${base}_${word}`);
    } else {
      const shortNum = Math.floor(randomFn() * 89) + 10;
      tryAdd(`${base}_${word}${shortNum}`);
    }
  }

  // Deterministic fallback if needed
  let fallbackCounter = 101;
  while (results.length < count) {
    tryAdd(`${base}_${fallbackCounter}`);
    fallbackCounter++;
  }

  return results;
}

export const USERNAME_RENAME_LIMIT = 3;
export const USERNAME_RENAME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (2 weeks)

export interface RenameLimitStatus {
  canRename: boolean;
  renamesUsed: number;
  renamesRemaining: number;
  totalAllowed: number;
  nextResetDate?: Date;
  daysUntilNextReset?: number;
}

const inMemoryStore = new Map<string, string>();
const memoryStorage: Storage = {
  getItem: (key: string) => inMemoryStore.get(key) ?? null,
  setItem: (key: string, val: string) => {
    inMemoryStore.set(key, String(val));
  },
  removeItem: (key: string) => {
    inMemoryStore.delete(key);
  },
  clear: () => {
    inMemoryStore.clear();
  },
  key: (index: number) => Array.from(inMemoryStore.keys())[index] ?? null,
  get length() {
    return inMemoryStore.size;
  },
};

function getSafeStorage(): Storage {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage as Storage;
  }
  return memoryStorage;
}

export function getUsernameRenameHistory(uid: string): number[] {
  const storage = getSafeStorage();
  try {
    const raw = storage.getItem(`lumen.username.renameHistory.${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "number") : [];
  } catch {
    return [];
  }
}

export function checkUsernameRenameEligibility(uid: string, now: number = Date.now()): RenameLimitStatus {
  const history = getUsernameRenameHistory(uid);
  const cutoff = now - USERNAME_RENAME_WINDOW_MS;
  const recentRenames = history.filter((ts) => ts > cutoff);

  const renamesUsed = recentRenames.length;
  const renamesRemaining = Math.max(0, USERNAME_RENAME_LIMIT - renamesUsed);
  const canRename = renamesRemaining > 0;

  let nextResetDate: Date | undefined;
  let daysUntilNextReset: number | undefined;

  if (recentRenames.length > 0) {
    const oldestRecent = Math.min(...recentRenames);
    const resetTime = oldestRecent + USERNAME_RENAME_WINDOW_MS;
    nextResetDate = new Date(resetTime);
    daysUntilNextReset = Math.max(1, Math.ceil((resetTime - now) / (24 * 60 * 60 * 1000)));
  }

  return {
    canRename,
    renamesUsed,
    renamesRemaining,
    totalAllowed: USERNAME_RENAME_LIMIT,
    nextResetDate,
    daysUntilNextReset,
  };
}

export function recordUsernameRename(uid: string, timestamp: number = Date.now()): void {
  const storage = getSafeStorage();
  const history = getUsernameRenameHistory(uid);
  const cutoff = timestamp - USERNAME_RENAME_WINDOW_MS;
  const recentRenames = history.filter((ts) => ts > cutoff);
  recentRenames.push(timestamp);
  try {
    storage.setItem(
      `lumen.username.renameHistory.${uid}`,
      JSON.stringify(recentRenames),
    );
  } catch {
    // Ignore storage errors
  }
}

