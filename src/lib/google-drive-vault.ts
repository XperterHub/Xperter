import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  formatVaultDocumentFileName,
  formatVaultFolderName,
  VAULT_DOCUMENT_TYPES,
  type VaultDocKey,
} from "@/lib/username-id";

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

// Per workspace-integration skill: keep access token in memory only (never localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;
let cachedDriveUserEmail: string | null = null;

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function getDriveConnectedEmail(): string | null {
  return cachedDriveUserEmail || auth.currentUser?.email || null;
}

export function setDriveAccessTokenInMemory(token: string | null, email?: string | null) {
  cachedDriveAccessToken = token;
  if (email !== undefined) {
    cachedDriveUserEmail = email;
  }
}

export interface StoredVaultDocument {
  id: string;
  docKey: VaultDocKey;
  label: string;
  customTitle?: string;
  renamedFileName: string;
  baseFileName: string;
  originalFileName: string;
  driveFolderName: string;
  driveFileId?: string;
  driveWebViewLink?: string;
  mimeType: string;
  sizeBytes: number;
  sizeFormatted: string;
  dataUrl: string;
  documentNumber: string;
  holderName: string;
  issueDate?: string;
  expiryDate?: string;
  notes?: string;
  uploadedAtIso: string;
  syncedToDrive: boolean;
}

export interface PersonalDetailsRecord {
  fullName: string;
  dateOfBirth: string;
  bloodGroup: string;
  gender: string;
  nationality: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  residentialAddress: string;
  updatedAtIso: string;
}

export const DEFAULT_PERSONAL_DETAILS: PersonalDetailsRecord = {
  fullName: "",
  dateOfBirth: "",
  bloodGroup: "O+",
  gender: "",
  nationality: "Indian",
  emergencyContactName: "",
  emergencyContactRelation: "",
  residentialAddress: "",
  updatedAtIso: "",
};

const VAULT_PASS_PREFIX = "lumen.vault.passhash.";
const VAULT_DOCS_PREFIX = "lumen.vault.docs.";
const VAULT_DETAILS_PREFIX = "lumen.vault.details.";

export function hashVaultSecret(rawPassword: string): string {
  const clean = rawPassword.trim();
  let h1 = 0xdeadbeef ^ clean.length;
  let h2 = 0x41c6ce57 ^ clean.length;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `vlt_${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
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

function getSafeLocalStorage(): Storage {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage as Storage;
  }
  return memoryStorage;
}

export function hasVaultPassword(userKey: string): boolean {
  const storage = getSafeLocalStorage();
  if (!storage) return false;
  try {
    return Boolean(storage.getItem(`${VAULT_PASS_PREFIX}${userKey}`));
  } catch {
    return false;
  }
}

export function setVaultPassword(userKey: string, newPassword: string): void {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  const hash = hashVaultSecret(newPassword);
  try {
    storage.setItem(`${VAULT_PASS_PREFIX}${userKey}`, hash);
  } catch {
    // Ignore storage errors
  }
}

export function verifyVaultPassword(userKey: string, candidatePassword: string): boolean {
  const storage = getSafeLocalStorage();
  if (!storage) return false;
  try {
    const stored = storage.getItem(`${VAULT_PASS_PREFIX}${userKey}`);
    if (!stored) return false;
    return stored === hashVaultSecret(candidatePassword);
  } catch {
    return false;
  }
}

export function loadVaultDocuments(userKey: string, username: string): StoredVaultDocument[] {
  const storage = getSafeLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(`${VAULT_DOCS_PREFIX}${userKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredVaultDocument[];
    if (!Array.isArray(parsed)) return [];
    const folderName = formatVaultFolderName(username);
    return parsed.map((docItem) => {
      const renamed = formatVaultDocumentFileName(
        username,
        docItem.docKey,
        docItem.originalFileName || docItem.renamedFileName,
        docItem.customTitle,
      );
      return {
        ...docItem,
        driveFolderName: folderName,
        baseFileName: renamed.baseName,
        renamedFileName: renamed.fullFileName,
      };
    });
  } catch {
    return [];
  }
}

export function saveVaultDocuments(userKey: string, docs: StoredVaultDocument[]): void {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(`${VAULT_DOCS_PREFIX}${userKey}`, JSON.stringify(docs));
  } catch {
    // Ignore quota errors
  }
}

export function loadPersonalDetails(
  userKey: string,
  fallbackName = "",
): PersonalDetailsRecord {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return { ...DEFAULT_PERSONAL_DETAILS, fullName: fallbackName };
  }
  try {
    const raw = storage.getItem(`${VAULT_DETAILS_PREFIX}${userKey}`);
    if (!raw) {
      return { ...DEFAULT_PERSONAL_DETAILS, fullName: fallbackName };
    }
    const parsed = JSON.parse(raw) as Partial<PersonalDetailsRecord>;
    return {
      ...DEFAULT_PERSONAL_DETAILS,
      ...parsed,
      fullName: parsed.fullName || fallbackName,
    };
  } catch {
    return { ...DEFAULT_PERSONAL_DETAILS, fullName: fallbackName };
  }
}

export function savePersonalDetails(
  userKey: string,
  details: PersonalDetailsRecord,
): void {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(
      `${VAULT_DETAILS_PREFIX}${userKey}`,
      JSON.stringify({ ...details, updatedAtIso: new Date().toISOString() }),
    );
  } catch {
    // Ignore storage errors
  }
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Connects the user's Google account with the `https://www.googleapis.com/auth/drive.file` scope
 * and caches the OAuth access token in memory.
 */
export async function connectGoogleAccountForDrive(): Promise<{
  accessToken: string;
  email: string;
  displayName: string;
  photoURL: string;
}> {
  const provider = new GoogleAuthProvider();
  provider.addScope(GOOGLE_DRIVE_SCOPE);
  provider.setCustomParameters({ prompt: "consent" });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken || null;

  if (!token) {
    throw new Error("Google Drive access permission was not granted. Please approve Google Drive access.");
  }

  cachedDriveAccessToken = token;
  cachedDriveUserEmail = result.user.email || null;

  return {
    accessToken: token,
    email: result.user.email || "",
    displayName: result.user.displayName || "",
    photoURL: result.user.photoURL || "",
  };
}

/**
 * Finds or creates the `<username>_doc` or custom named folder in the user's Google Drive.
 */
export async function ensureDriveUserDocFolder(
  username: string,
  accessToken: string = cachedDriveAccessToken || "",
  customFolderName?: string,
): Promise<{ folderId: string; folderName: string }> {
  const folderName = customFolderName?.trim() || formatVaultFolderName(username);
  if (!accessToken) {
    throw new Error("Not connected to Google Drive. Please sign in with Google first.");
  }

  const escapedName = folderName.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`,
  );

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (searchRes.status === 401 || searchRes.status === 403) {
    cachedDriveAccessToken = null;
    throw new Error("Google Drive session expired or lacks permission. Please reconnect your Google Account.");
  }

  if (!searchRes.ok) {
    const errText = await searchRes.text().catch(() => "");
    throw new Error(`Failed to query Google Drive folder (${searchRes.status}): ${errText}`);
  }

  const searchData = (await searchRes.json()) as {
    files?: Array<{ id: string; name: string }>;
  };

  if (searchData.files && searchData.files.length > 0 && searchData.files[0]) {
    return {
      folderId: searchData.files[0].id,
      folderName: searchData.files[0].name,
    };
  }

  // Create `<username>_doc` folder in Google Drive
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      description: `Xperter Personal Document Vault folder (${folderName})`,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => "");
    throw new Error(`Could not create folder ${folderName} in Google Drive: ${errText}`);
  }

  const created = (await createRes.json()) as { id: string; name: string };
  return {
    folderId: created.id,
    folderName: created.name || folderName,
  };
}

/**
 * Uploads a document to the `<username>_doc` folder in Google Drive, automatically renaming
 * the file to `<username>_<doctype>.<ext>` (e.g., `nagaraj_voterd.pdf`, `nagaraj_aadharcard.png`).
 */
export async function uploadVaultDocumentToGoogleDrive(params: {
  username: string;
  docKey: VaultDocKey;
  customTitle?: string;
  file: File;
  existingDriveFileId?: string;
  accessToken?: string;
}): Promise<{
  driveFileId: string;
  driveFolderName: string;
  renamedFileName: string;
  baseFileName: string;
  webViewLink?: string;
}> {
  const token = params.accessToken || cachedDriveAccessToken;
  if (!token) {
    throw new Error("Connect your Google Account to store documents in Google Drive.");
  }

  const { folderId, folderName } = await ensureDriveUserDocFolder(params.username, token);
  const { baseName, fullFileName } = formatVaultDocumentFileName(
    params.username,
    params.docKey,
    params.file.name,
    params.customTitle,
  );

  // If replacing an existing Drive file, delete the old file first
  if (params.existingDriveFileId) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${params.existingDriveFileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore if already removed
    }
  }

  const def = VAULT_DOCUMENT_TYPES.find((d) => d.key === params.docKey);
  const metadata = {
    name: fullFileName,
    parents: [folderId],
    description: `${def?.label || "Personal Document"} (${baseName}) stored via Xperter Profile Vault`,
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append("file", params.file, fullFileName);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    },
  );

  if (uploadRes.status === 401 || uploadRes.status === 403) {
    cachedDriveAccessToken = null;
    throw new Error("Google Drive authorization expired. Please reconnect your Google Account.");
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`Google Drive upload failed (${uploadRes.status}): ${errText}`);
  }

  const uploaded = (await uploadRes.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  return {
    driveFileId: uploaded.id,
    driveFolderName: folderName,
    renamedFileName: uploaded.name || fullFileName,
    baseFileName: baseName,
    ...(uploaded.webViewLink ? { webViewLink: uploaded.webViewLink } : {}),
  };
}

/**
 * Deletes a document from Google Drive (called only after explicit user confirmation).
 */
export async function deleteVaultDocumentFromGoogleDrive(
  driveFileId: string,
  accessToken: string = cachedDriveAccessToken || "",
): Promise<void> {
  if (!accessToken || !driveFileId) return;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to remove file from Google Drive (${res.status})`);
  }
}

/**
 * Triggers a browser download of a stored vault document using its automatically renamed
 * `<username>_<doctype>.<ext>` filename.
 */
export function triggerVaultDocumentDownload(docItem: StoredVaultDocument): void {
  if (typeof document === "undefined") return;
  const link = document.createElement("a");
  link.href = docItem.dataUrl;
  link.download = docItem.renamedFileName || `${docItem.baseFileName}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export interface CloudUploadedItem {
  id: string;
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  mimeType: string;
  folderName: string;
  relativePath?: string;
  driveFileId?: string;
  webViewLink?: string;
  uploadedAtIso: string;
  dataUrl?: string;
  syncedToDrive: boolean;
}

const CLOUD_FILES_PREFIX = "lumen.cloud.files.";
const CLOUD_FOLDER_PREFIX = "lumen.cloud.foldername.";

export function loadCloudFiles(uid: string): CloudUploadedItem[] {
  const store = getSafeLocalStorage();
  const raw = store.getItem(`${CLOUD_FILES_PREFIX}${uid}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCloudFiles(uid: string, files: CloudUploadedItem[]): void {
  const store = getSafeLocalStorage();
  try {
    store.setItem(`${CLOUD_FILES_PREFIX}${uid}`, JSON.stringify(files));
  } catch {
    // Ignore storage errors
  }
}

export function getCustomCloudFolderName(uid: string, fallback: string): string {
  const store = getSafeLocalStorage();
  const raw = store.getItem(`${CLOUD_FOLDER_PREFIX}${uid}`);
  return raw && raw.trim() ? raw.trim() : fallback;
}

export function setCustomCloudFolderName(uid: string, folderName: string): void {
  const store = getSafeLocalStorage();
  try {
    store.setItem(`${CLOUD_FOLDER_PREFIX}${uid}`, folderName.trim());
  } catch {
    // Ignore storage errors
  }
}

/**
 * Uploads any generic file to Google Drive under a specific folder (supporting drag-and-drop and folder uploads).
 */
export async function uploadGenericFileToGoogleDrive(params: {
  file: File;
  folderName: string;
  relativePath?: string;
  accessToken?: string;
}): Promise<{
  driveFileId: string;
  folderId: string;
  folderName: string;
  fileName: string;
  webViewLink?: string;
}> {
  const token = params.accessToken || cachedDriveAccessToken;
  if (!token) {
    throw new Error("Connect your Google Account to upload files to Google Drive.");
  }

  const { folderId, folderName } = await ensureDriveUserDocFolder(
    "",
    token,
    params.folderName,
  );

  const metadata = {
    name: params.file.name,
    parents: [folderId],
    description: `Uploaded via Lumen Cloud Uploading (${params.relativePath || params.file.name})`,
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append("file", params.file, params.file.name);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    },
  );

  if (uploadRes.status === 401 || uploadRes.status === 403) {
    cachedDriveAccessToken = null;
    throw new Error("Google Drive authorization expired. Please reconnect your Google Account.");
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`Google Drive upload failed (${uploadRes.status}): ${errText}`);
  }

  const uploaded = (await uploadRes.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  return {
    driveFileId: uploaded.id,
    folderId,
    folderName,
    fileName: uploaded.name || params.file.name,
    ...(uploaded.webViewLink ? { webViewLink: uploaded.webViewLink } : {}),
  };
}

/**
 * Renames a folder in Google Drive.
 */
export async function renameDriveFolder(
  folderId: string,
  newFolderName: string,
  accessToken: string = cachedDriveAccessToken || "",
): Promise<void> {
  if (!accessToken || !folderId) return;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: newFolderName }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Failed to rename Google Drive folder: ${errText}`);
  }
}

