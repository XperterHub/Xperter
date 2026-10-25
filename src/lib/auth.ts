import { useEffect, useState } from "react";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  auth,
  BLUEPRINT_LIMITS,
  db,
  deriveLumenId,
  googleProvider,
  handleFirestoreError,
  OperationType,
  sanitizeId,
} from "@/lib/firebase";
import { setDriveAccessTokenInMemory } from "@/lib/google-drive-vault";
import {
  registerCloudPrefsSaver,
  syncPrefsForUserSession,
} from "@/lib/prefs";
import {
  generateUsernameSuggestions,
  RESERVED_USERNAMES,
  sanitizeUsernameId,
  validateUsernameFormat,
} from "@/lib/username-id";

export type AppUser = {
  uid: string;
  lumenId: string;
  name: string;
  email: string;
  photoURL: string;
  about?: string;
  isCloudUser?: boolean;
};

const LOCAL_AUTH_KEY = "lumen.auth.user";
const REMEMBER_PREF_KEY = "lumen.auth.rememberPref";
const REMEMBERED_EMAIL_KEY = "lumen.auth.rememberedEmail";
const REMEMBERED_USERNAME_KEY = "lumen.auth.rememberedUsername";
const CLAIMED_USERNAMES_KEY = "lumen.auth.claimedUsernames";
const PROFILE_OVERRIDE_PREFIX = "lumen.auth.override.";

const localAuthListeners = new Set<() => void>();
const inFlightProfileSync = new Map<string, Promise<AppUser>>();
const syncedProfileUids = new Set<string>();

registerCloudPrefsSaver((uid, prefs) => {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified || sanitizeId(fbUser.uid) !== uid) return;
  const profileRef = doc(db, "users", uid);
  void updateDoc(profileRef, {
    theme: prefs.theme,
    blur: Math.min(48, Math.max(4, Math.round(prefs.blur))),
    updatedAt: serverTimestamp(),
  }).catch(() => {});
});

function notifyLocalAuthListeners() {
  for (const listener of localAuthListeners) {
    listener();
  }
}

export function getRememberMePreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const val = window.localStorage.getItem(REMEMBER_PREF_KEY);
    return val === null ? true : val === "true";
  } catch {
    return true;
  }
}

const inMemoryAuthStore = new Map<string, string>();
const inMemorySessionStore = new Map<string, string>();

function createMemoryStorage(store: Map<string, string>): Storage {
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => {
      store.set(key, String(val));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

const memoryLocalStorage = createMemoryStorage(inMemoryAuthStore);
const memorySessionStorage = createMemoryStorage(inMemorySessionStore);

function getLocalStorage(): Storage {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return memoryLocalStorage;
}

function getSessionStorage(): Storage {
  if (typeof window !== "undefined" && window.sessionStorage) return window.sessionStorage;
  return memorySessionStorage;
}

export function getRememberedEmail(): string {
  try {
    return getLocalStorage().getItem(REMEMBERED_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function getRememberedUsername(): string {
  try {
    return getLocalStorage().getItem(REMEMBERED_USERNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function readClaimedUsernamesMap(): Record<string, string> {
  try {
    const raw = getLocalStorage().getItem(CLAIMED_USERNAMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveClaimedUsername(username: string, ownerUid: string) {
  const clean = sanitizeUsernameId(username).toLowerCase();
  if (!clean) return;
  try {
    const map = readClaimedUsernamesMap();
    for (const [key, uid] of Object.entries(map)) {
      if (uid === ownerUid && key !== clean) {
        delete map[key];
      }
    }
    map[clean] = ownerUid;
    getLocalStorage().setItem(CLAIMED_USERNAMES_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

function readProfileOverride(
  uid: string,
): Partial<Pick<AppUser, "name" | "lumenId" | "photoURL" | "about">> {
  try {
    const raw = getLocalStorage().getItem(`${PROFILE_OVERRIDE_PREFIX}${uid}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Pick<AppUser, "name" | "lumenId" | "photoURL" | "about">>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeProfileOverride(
  uid: string,
  override: Partial<Pick<AppUser, "name" | "lumenId" | "photoURL" | "about">>,
) {
  try {
    const current = readProfileOverride(uid);
    const merged = { ...current, ...override };
    getLocalStorage().setItem(`${PROFILE_OVERRIDE_PREFIX}${uid}`, JSON.stringify(merged));
  } catch {
    // Ignore storage errors
  }
}

export interface UsernameAvailabilityStatus {
  available: boolean;
  validFormat: boolean;
  normalized: string;
  message: string;
  suggestions: string[];
}

/**
 * Checks whether a candidate unique username / User ID is available or already taken.
 * If taken, returns randomized variations that are guaranteed to be available.
 */
export async function checkUsernameAvailability(
  rawCandidate: string,
  currentUid?: string,
  seedForSuggestions?: string,
): Promise<UsernameAvailabilityStatus> {
  const validation = validateUsernameFormat(rawCandidate);
  const claimedMap = readClaimedUsernamesMap();
  const takenList = [
    ...Array.from(RESERVED_USERNAMES),
    ...Object.entries(claimedMap)
      .filter(([, uid]) => !currentUid || uid !== currentUid)
      .map(([uname]) => uname),
  ];

  if (!validation.valid) {
    return {
      available: false,
      validFormat: false,
      normalized: validation.normalized,
      message: validation.reason || "Enter a valid unique username",
      suggestions: generateUsernameSuggestions(
        seedForSuggestions || rawCandidate || "lumen",
        takenList,
        4,
      ),
    };
  }

  const normalized = validation.normalized;
  const lower = normalized.toLowerCase();

  // Check reserved usernames or locally claimed usernames owned by a different user
  const localOwner = claimedMap[lower];
  const isReserved = RESERVED_USERNAMES.has(lower);
  const isTakenLocally = isReserved || Boolean(localOwner && localOwner !== currentUid);

  if (isTakenLocally) {
    return {
      available: false,
      validFormat: true,
      normalized,
      message: `Username "${normalized}" already matches an existing user — try a variation below.`,
      suggestions: generateUsernameSuggestions(
        seedForSuggestions || normalized,
        [...takenList, lower],
        4,
      ),
    };
  }

  // Also check Firestore `userDirectory/{normalized}` if signed in & verified
  if (auth.currentUser?.emailVerified) {
    try {
      const dirSnap = await getDoc(doc(db, "userDirectory", normalized));
      if (dirSnap.exists()) {
        const dirData = dirSnap.data();
        const ownerUid = String(dirData.uid ?? "");
        if (ownerUid && ownerUid !== currentUid) {
          return {
            available: false,
            validFormat: true,
            normalized,
            message: `Username "${normalized}" is already registered — try another variation.`,
            suggestions: generateUsernameSuggestions(
              seedForSuggestions || normalized,
              [...takenList, lower],
              4,
            ),
          };
        }
      }
    } catch {
      // Ignore network/offline error and rely on local + reserved checks
    }
  }

  return {
    available: true,
    validFormat: true,
    normalized,
    message: `Unique ID "${normalized}" is available — good to go!`,
    suggestions: generateUsernameSuggestions(
      seedForSuggestions || normalized,
      takenList,
      3,
    ),
  };
}

function readLocalUser(): AppUser | null {
  try {
    const raw =
      getLocalStorage().getItem(LOCAL_AUTH_KEY) ??
      getSessionStorage().getItem(LOCAL_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppUser>;
    if (!parsed || typeof parsed.email !== "string" || !parsed.email) return null;
    const email = parsed.email.slice(0, BLUEPRINT_LIMITS.MAX_EMAIL_LENGTH);
    const fallbackName = email.split("@")[0] || "Lumen User";
    const uid = sanitizeId(parsed.uid || `usr_${email.toLowerCase()}`);
    const override = readProfileOverride(uid);
    const name = (override.name || parsed.name || fallbackName)
      .trim()
      .slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH);
    const lumenId = sanitizeUsernameId(
      override.lumenId || parsed.lumenId || deriveLumenId(uid),
    );
    const photoURL =
      typeof override.photoURL === "string"
        ? override.photoURL
        : typeof parsed.photoURL === "string"
          ? parsed.photoURL
          : "";
    const about =
      typeof override.about === "string"
        ? override.about
        : typeof parsed.about === "string"
          ? parsed.about
          : "";
    return {
      uid,
      lumenId: lumenId || deriveLumenId(uid),
      name: name || "Lumen User",
      email,
      photoURL,
      about,
      isCloudUser: false,
    };
  } catch {
    return null;
  }
}

function writeLocalUser(user: AppUser | null, rememberMe = true) {
  try {
    const localStore = getLocalStorage();
    const sessionStore = getSessionStorage();
    if (user) {
      const serialized = JSON.stringify(user);
      localStore.setItem(REMEMBER_PREF_KEY, String(rememberMe));
      if (rememberMe) {
        localStore.setItem(LOCAL_AUTH_KEY, serialized);
        localStore.setItem(REMEMBERED_EMAIL_KEY, user.email);
        localStore.setItem(REMEMBERED_USERNAME_KEY, user.lumenId);
        sessionStore.removeItem(LOCAL_AUTH_KEY);
      } else {
        sessionStore.setItem(LOCAL_AUTH_KEY, serialized);
        localStore.removeItem(LOCAL_AUTH_KEY);
        localStore.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } else {
      localStore.removeItem(LOCAL_AUTH_KEY);
      sessionStore.removeItem(LOCAL_AUTH_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
  notifyLocalAuthListeners();
}

function toAppUser(u: FirebaseUser): AppUser {
  const email = (u.email || "user@lumen.app").slice(0, BLUEPRINT_LIMITS.MAX_EMAIL_LENGTH);
  const fallbackName = email.split("@")[0] || "Lumen User";
  const uid = sanitizeId(u.uid);
  const override = readProfileOverride(uid);
  const name = (override.name || u.displayName || fallbackName)
    .trim()
    .slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH);
  const rawPhoto =
    override.photoURL !== undefined ? override.photoURL : u.photoURL || "";
  const photoURL = rawPhoto.slice(0, BLUEPRINT_LIMITS.MAX_PHOTO_URL_LENGTH);
  const lumenId = sanitizeUsernameId(override.lumenId || deriveLumenId(uid)) || deriveLumenId(uid);

  return {
    uid,
    lumenId,
    name: name || "Lumen User",
    email,
    photoURL,
    isCloudUser: true,
  };
}

export async function syncUserProfileToFirestore(
  user: FirebaseUser,
  forceSync = false,
): Promise<AppUser> {
  const appUser = toAppUser(user);
  saveClaimedUsername(appUser.lumenId, appUser.uid);

  if (!forceSync && syncedProfileUids.has(appUser.uid)) {
    return appUser;
  }

  const existingPromise = inFlightProfileSync.get(appUser.uid);
  if (existingPromise && !forceSync) {
    return existingPromise;
  }

  const syncTask = (async (): Promise<AppUser> => {
    const profilePath = `users/${appUser.uid}`;
    const profileRef = doc(db, "users", appUser.uid);

    let snap;
    try {
      snap = await getDoc(profileRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, profilePath);
    }

    // For Firestore UserProfile, photoURL max length is 2048 chars (data URLs stay in local override)
    const cloudSafePhotoURL =
      appUser.photoURL.length <= BLUEPRINT_LIMITS.MAX_PHOTO_URL_LENGTH &&
      !appUser.photoURL.startsWith("data:")
        ? appUser.photoURL
        : "";
    const displayNameLower = appUser.name.toLowerCase().slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH);

    if (!snap.exists()) {
      try {
        await setDoc(profileRef, {
          uid: appUser.uid,
          lumenId: appUser.lumenId,
          displayName: appUser.name,
          displayNameLower,
          email: appUser.email,
          photoURL: cloudSafePhotoURL,
          searchable: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, profilePath);
      }
    } else {
      const existingData = snap.data();
      // If cloud has a custom lumenId and local override wasn't set yet, adopt cloud's lumenId
      const override = readProfileOverride(appUser.uid);
      if (
        !override.lumenId &&
        typeof existingData.lumenId === "string" &&
        existingData.lumenId.length >= 4
      ) {
        appUser.lumenId = existingData.lumenId;
        writeProfileOverride(appUser.uid, { lumenId: existingData.lumenId });
        saveClaimedUsername(appUser.lumenId, appUser.uid);
      }
      if (
        !override.name &&
        typeof existingData.displayName === "string" &&
        existingData.displayName.trim()
      ) {
        appUser.name = existingData.displayName.trim();
        writeProfileOverride(appUser.uid, { name: appUser.name });
      }

      const cloudTheme =
        existingData.theme === "light" || existingData.theme === "dark"
          ? existingData.theme
          : undefined;
      const cloudBlur =
        typeof existingData.blur === "number" ? existingData.blur : undefined;
      syncPrefsForUserSession(appUser.uid, {
        ...(cloudTheme ? { theme: cloudTheme } : {}),
        ...(cloudBlur !== undefined ? { blur: cloudBlur } : {}),
      });

      const updatedDisplayNameLower = appUser.name
        .toLowerCase()
        .slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH);

      if (
        existingData.displayName !== appUser.name ||
        existingData.displayNameLower !== updatedDisplayNameLower ||
        existingData.lumenId !== appUser.lumenId ||
        existingData.searchable !== true ||
        existingData.email !== appUser.email ||
        (cloudSafePhotoURL && existingData.photoURL !== cloudSafePhotoURL)
      ) {
        try {
          await updateDoc(profileRef, {
            lumenId: appUser.lumenId,
            displayName: appUser.name,
            displayNameLower: updatedDisplayNameLower,
            email: appUser.email,
            photoURL: cloudSafePhotoURL || existingData.photoURL || "",
            searchable: true,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, profilePath);
        }
      }
    }

    // Sync public non-PII directory entry for User ID friend lookups
    const dirPath = `userDirectory/${appUser.lumenId}`;
    const dirRef = doc(db, "userDirectory", appUser.lumenId);
    const handleBase = appUser.lumenId
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, ".")
      .replace(/^\.+|\.+$/g, "");
    const handle = `@${handleBase || "user"}`.slice(0, BLUEPRINT_LIMITS.MAX_HANDLE_LENGTH);

    try {
      const dirSnap = await getDoc(dirRef);
      if (!dirSnap.exists()) {
        await setDoc(dirRef, {
          uid: appUser.uid,
          lumenId: appUser.lumenId,
          displayName: appUser.name,
          handle,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const dirData = dirSnap.data();
        if (
          dirData.uid === appUser.uid &&
          (dirData.displayName !== appUser.name || dirData.handle !== handle)
        ) {
          await updateDoc(dirRef, {
            displayName: appUser.name,
            handle,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, dirPath);
    }

    syncedProfileUids.add(appUser.uid);
    notifyLocalAuthListeners();
    return appUser;
  })();

  inFlightProfileSync.set(appUser.uid, syncTask);
  try {
    return await syncTask;
  } finally {
    inFlightProfileSync.delete(appUser.uid);
  }
}

export function signIn(
  email: string,
  name?: string,
  rememberMe = true,
  customUsername?: string,
): AppUser {
  const cleanEmail = email.trim().slice(0, BLUEPRINT_LIMITS.MAX_EMAIL_LENGTH);
  const rawName = (name?.trim() || cleanEmail.split("@")[0] || "Lumen User").replace(
    /[._-]+/g,
    " ",
  );
  const formattedName = rawName
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH);
  const uid = sanitizeId(`usr_${cleanEmail.toLowerCase()}`);
  const existingOverride = readProfileOverride(uid);
  const chosenLumenId =
    sanitizeUsernameId(customUsername || existingOverride.lumenId || "") ||
    deriveLumenId(uid);

  writeProfileOverride(uid, {
    name: formattedName || "Lumen User",
    lumenId: chosenLumenId,
  });
  saveClaimedUsername(chosenLumenId, uid);

  const user: AppUser = {
    uid,
    lumenId: chosenLumenId,
    name: formattedName || "Lumen User",
    email: cleanEmail,
    photoURL: existingOverride.photoURL || "",
    isCloudUser: false,
  };
  writeLocalUser(user, rememberMe);
  syncPrefsForUserSession(user.uid);
  return user;
}

export async function signInWithGoogle(
  rememberMe = true,
  customUsername?: string,
): Promise<AppUser> {
  try {
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence,
    );
    if (typeof window !== "undefined") {
      window.localStorage.setItem(REMEMBER_PREF_KEY, String(rememberMe));
    }
  } catch {
    // Ignore persistence fallback errors in restricted environments
  }
  const cred = await signInWithPopup(auth, googleProvider);
  const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
  if (oauthCred?.accessToken) {
    setDriveAccessTokenInMemory(oauthCred.accessToken, cred.user.email);
  }

  const uid = sanitizeId(cred.user.uid);
  if (customUsername && sanitizeUsernameId(customUsername).length >= 4) {
    const cleanId = sanitizeUsernameId(customUsername);
    writeProfileOverride(uid, { lumenId: cleanId });
    saveClaimedUsername(cleanId, uid);
  }

  writeLocalUser(null, rememberMe);
  if (rememberMe && cred.user.email && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(REMEMBERED_EMAIL_KEY, cred.user.email);
    } catch {
      // Ignore storage errors
    }
  }
  return syncUserProfileToFirestore(cred.user, true);
}

export async function signInWithEmailPassword(
  email: string,
  pass: string,
  rememberMe = true,
  customUsername?: string,
): Promise<AppUser> {
  try {
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence,
    );
    if (typeof window !== "undefined") {
      window.localStorage.setItem(REMEMBER_PREF_KEY, String(rememberMe));
    }
  } catch {}

  let userCred;
  try {
    userCred = await signInWithEmailAndPassword(auth, email.trim(), pass);
  } catch (err: any) {
    if (
      err?.code === "auth/user-not-found" ||
      err?.code === "auth/invalid-credential" ||
      err?.code === "auth/invalid-login-credentials"
    ) {
      try {
        userCred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      } catch (createErr) {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const uid = sanitizeId(userCred.user.uid);
  if (customUsername && sanitizeUsernameId(customUsername).length >= 4) {
    const cleanId = sanitizeUsernameId(customUsername);
    writeProfileOverride(uid, { lumenId: cleanId });
    saveClaimedUsername(cleanId, uid);
  }

  writeLocalUser(null, rememberMe);
  if (rememberMe && userCred.user.email && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(REMEMBERED_EMAIL_KEY, userCred.user.email);
    } catch {}
  }
  return syncUserProfileToFirestore(userCred.user, true);
}

export async function signUpWithEmailPassword(
  email: string,
  pass: string,
  name?: string,
  customUsername?: string,
): Promise<AppUser> {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {}

  let userCred;
  try {
    userCred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  } catch (err: any) {
    if (err?.code === "auth/email-already-in-use") {
      userCred = await signInWithEmailAndPassword(auth, email.trim(), pass);
    } else {
      throw err;
    }
  }

  const uid = sanitizeId(userCred.user.uid);
  const cleanName = (name?.trim() || email.split("@")[0] || "Lumen User").slice(
    0,
    BLUEPRINT_LIMITS.MAX_NAME_LENGTH,
  );
  const cleanId = sanitizeUsernameId(customUsername || deriveLumenId(uid));
  writeProfileOverride(uid, { name: cleanName, lumenId: cleanId });
  saveClaimedUsername(cleanId, uid);

  return syncUserProfileToFirestore(userCred.user, true);
}

/**
 * Updates the current user's profile (Display Name, Unique Customized User ID, Profile Picture)
 * and syncs to Firestore `users` and `userDirectory` so Messaging search, friend requests,
 * and Google Drive `<username>_doc` folder naming stay in sync.
 */
export async function updateUserProfile(updates: {
  name?: string;
  lumenId?: string;
  photoURL?: string;
  about?: string;
}): Promise<AppUser> {
  const current = getUser();
  if (!current) {
    throw new Error("Please sign in to update your profile.");
  }

  const previousLumenId = current.lumenId;
  const nextName =
    updates.name !== undefined
      ? updates.name.trim().slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH) || current.name
      : current.name;
  const nextLumenId =
    updates.lumenId !== undefined
      ? sanitizeUsernameId(updates.lumenId) || current.lumenId
      : current.lumenId;
  const nextPhotoURL =
    updates.photoURL !== undefined ? updates.photoURL : current.photoURL;
  const nextAbout =
    updates.about !== undefined ? updates.about.trim().slice(0, 500) : current.about;

  writeProfileOverride(current.uid, {
    name: nextName,
    lumenId: nextLumenId,
    photoURL: nextPhotoURL,
    about: nextAbout,
  });
  saveClaimedUsername(nextLumenId, current.uid);

  if (auth.currentUser) {
    // If the user changed their unique lumenId, remove their old directory entry first
    if (
      auth.currentUser.emailVerified &&
      previousLumenId &&
      previousLumenId !== nextLumenId
    ) {
      try {
        const oldDirRef = doc(db, "userDirectory", previousLumenId);
        const oldSnap = await getDoc(oldDirRef);
        if (oldSnap.exists() && oldSnap.data().uid === current.uid) {
          await deleteDoc(oldDirRef);
        }
      } catch {
        // Ignore directory cleanup errors
      }
    }
    const updatedCloud = await syncUserProfileToFirestore(auth.currentUser, true);
    notifyLocalAuthListeners();
    return {
      ...updatedCloud,
      name: nextName,
      lumenId: nextLumenId,
      photoURL: nextPhotoURL,
      about: nextAbout,
    };
  }

  const updatedLocal: AppUser = {
    ...current,
    name: nextName,
    lumenId: nextLumenId,
    photoURL: nextPhotoURL,
    about: nextAbout,
  };
  writeLocalUser(updatedLocal, getRememberMePreference());
  return updatedLocal;
}

export async function sendPasswordReset(
  email: string,
): Promise<{ email: string; method: "firebase" | "local" }> {
  const cleanEmail = email.trim().slice(0, BLUEPRINT_LIMITS.MAX_EMAIL_LENGTH);
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    return { email: cleanEmail, method: "firebase" };
  } catch {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          `lumen.auth.reset.${cleanEmail.toLowerCase()}`,
          new Date().toISOString(),
        );
      } catch {
        // Ignore storage errors
      }
    }
    return { email: cleanEmail, method: "local" };
  }
}

export async function signOut(): Promise<void> {
  syncedProfileUids.clear();
  inFlightProfileSync.clear();
  setDriveAccessTokenInMemory(null, null);
  writeLocalUser(null);
  syncPrefsForUserSession(null);
  if (auth.currentUser) {
    await firebaseSignOut(auth);
  }
}

export function getUser(): AppUser | null {
  if (auth.currentUser) return toAppUser(auth.currentUser);
  return readLocalUser();
}

export function useAuthState(): { user: AppUser | null; authReady: boolean } {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);

  useEffect(() => {
    const syncState = () => {
      if (auth.currentUser) {
        const mapped = toAppUser(auth.currentUser);
        setUser(mapped);
        syncPrefsForUserSession(mapped.uid);
      } else {
        const local = readLocalUser();
        setUser(local);
        syncPrefsForUserSession(local?.uid ?? null);
      }
    };

    syncState();
    localAuthListeners.add(syncState);

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const mapped = toAppUser(fbUser);
        setUser(mapped);
        syncPrefsForUserSession(mapped.uid);
        void syncUserProfileToFirestore(fbUser).catch(() => {});
      } else {
        const local = readLocalUser();
        setUser(local);
        syncPrefsForUserSession(local?.uid ?? null);
      }
      setAuthReady(true);
    });

    return () => {
      localAuthListeners.delete(syncState);
      unsub();
    };
  }, []);

  return { user, authReady };
}
