import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";
import { doc, getDocFromServer, getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/drive.file");

const rtdbUrl =
  (firebaseConfig as { databaseURL?: string }).databaseURL ||
  `https://${firebaseConfig.projectId}-default-rtdb.firebaseio.com`;

export const rtdb: Database | null = (() => {
  try {
    return getDatabase(app, rtdbUrl);
  } catch {
    return null;
  }
})();

// Verbatim validation constants synced from firebase-blueprint.json
export const BLUEPRINT_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  MAX_ID_LENGTH: 128,
  MAX_LUMEN_ID_LENGTH: 32,
  MAX_NAME_LENGTH: 80,
  MAX_EMAIL_LENGTH: 254,
  MAX_PHOTO_URL_LENGTH: 2048,
  MAX_HANDLE_LENGTH: 60,
  MAX_ROLE_LENGTH: 60,
  MAX_LAST_MESSAGE_TEXT_LENGTH: 500,
  MAX_TIME_LENGTH: 32,
  MAX_TEXT_LENGTH: 2000,
  MAX_ATTACHMENT_NAME_LENGTH: 200,
  MAX_ATTACHMENT_SIZE_LENGTH: 40,
  MAX_DATA_URL_LENGTH: 500000,
  MAX_POLL_QUESTION_LENGTH: 300,
  MAX_POLL_OPTION_LENGTH: 120,
  MAX_POLL_OPTIONS: 4,
  MAX_REACTIONS: 13,
} as const;

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, BLUEPRINT_LIMITS.MAX_ID_LENGTH);
  return cleaned || `id_${Date.now()}`;
}

const LUMEN_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function deriveLumenId(uid: string): string {
  let hash1 = 2166136261;
  let hash2 = 16777619;
  for (let i = 0; i < uid.length; i++) {
    const ch = uid.charCodeAt(i);
    hash1 ^= ch;
    hash1 = Math.imul(hash1, 16777619);
    hash2 ^= ch + i * 31;
    hash2 = Math.imul(hash2, 2166136261);
  }
  let code = "";
  let combined = Math.abs(hash1);
  for (let i = 0; i < 3; i++) {
    code += LUMEN_ID_ALPHABET[combined % LUMEN_ID_ALPHABET.length];
    combined = Math.floor(combined / LUMEN_ID_ALPHABET.length);
  }
  let combined2 = Math.abs(hash2);
  for (let i = 0; i < 3; i++) {
    code += LUMEN_ID_ALPHABET[combined2 % LUMEN_ID_ALPHABET.length];
    combined2 = Math.floor(combined2 / LUMEN_ID_ALPHABET.length);
  }
  return `LMN-${code}`;
}

export function normalizeLumenId(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (upper.startsWith("LMN-")) {
    return upper.slice(0, BLUEPRINT_LIMITS.MAX_LUMEN_ID_LENGTH);
  }
  if (upper.startsWith("LMN") && upper.length > 3 && /^[A-Z0-9]+$/.test(upper.slice(3))) {
    return `LMN-${upper.slice(3)}`.slice(0, BLUEPRINT_LIMITS.MAX_LUMEN_ID_LENGTH);
  }
  // If user typed a customized username (e.g. nagaraj_98, arjun_dev), preserve lowercase custom ID
  if (/[a-z_]/.test(trimmed)) {
    return trimmed.toLowerCase().slice(0, BLUEPRINT_LIMITS.MAX_LUMEN_ID_LENGTH);
  }
  return `LMN-${upper}`.slice(0, BLUEPRINT_LIMITS.MAX_LUMEN_ID_LENGTH);
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

if (typeof window !== "undefined") {
  void testConnection();
}
