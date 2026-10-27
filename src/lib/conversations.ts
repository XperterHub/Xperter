import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  type AppUser,
  listAllDictionaryAccounts,
  readClaimedUsernamesMap,
} from "@/lib/auth";
import {
  auth,
  BLUEPRINT_LIMITS,
  db,
  handleFirestoreError,
  normalizeLumenId,
  OperationType,
  sanitizeId,
} from "@/lib/firebase";

export type DirectoryUser = {
  uid: string;
  lumenId: string;
  displayName: string;
  handle: string;
  photoURL?: string;
  isDirectIdMatch?: boolean;
};

export type LinkedConversationData = {
  id: string;
  ownerId: string;
  participantIds: [string, string];
  participantLumenIds: [string, string];
  peerUserId: string;
  peerLumenId: string;
  name: string;
  handle: string;
  role: string;
  isGroup: boolean;
  memberCount: number;
  pinned: boolean;
  unread: number;
  pinnedMsgId?: string | undefined;
  lastMessageText: string;
  lastMessageTime: string;
  updatedAtMs: number;
};

const formatNowTime = () =>
  new Date()
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    .slice(0, BLUEPRINT_LIMITS.MAX_TIME_LENGTH);

export function buildPairConversationId(uidA: string, uidB: string): string {
  const cleanA = sanitizeId(uidA).slice(0, 48);
  const cleanB = sanitizeId(uidB).slice(0, 48);
  const sorted = [cleanA, cleanB].sort();
  return sanitizeId(`conv_${sorted[0]}_${sorted[1]}`);
}

export function buildCanonicalConversationId(
  lumenIdA: string,
  lumenIdB: string,
  fallbackUidA?: string,
  fallbackUidB?: string,
): string {
  const normA = normalizeLumenId(lumenIdA).toLowerCase();
  const normB = normalizeLumenId(lumenIdB).toLowerCase();
  if (normA && normB && normA !== normB) {
    const sorted = [normA, normB].sort();
    return sanitizeId(`conv_${sorted[0]}_${sorted[1]}`);
  }
  return buildPairConversationId(fallbackUidA || lumenIdA, fallbackUidB || lumenIdB);
}

/**
 * Queries the Firestore `users` collection (and `userDirectory` index) by
 * display name or unique user ID (`lumenId` / `uid`) so users can find others
 * and start a conversation.
 */
export async function searchUsersInFirestore(
  rawQuery: string,
  currentUser?: AppUser | null,
): Promise<DirectoryUser[]> {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  const queryClean = lower.replace(/^@+/, "");
  const normalizedId = normalizeLumenId(trimmed);
  const resultsById = new Map<string, DirectoryUser>();

  const addCandidate = (candidate: DirectoryUser) => {
    if (
      currentUser &&
      (candidate.uid === currentUser.uid || candidate.lumenId === currentUser.lumenId)
    ) {
      return;
    }
    const key = candidate.lumenId || candidate.uid;
    if (!resultsById.has(key)) {
      resultsById.set(key, candidate);
    }
  };

  // 0. Search the shared cross-tab/cross-window user directory for live matches
  try {
    const { getSharedDirectoryUsers } = await import("@/lib/realtime-sync");
    const sharedUsers = getSharedDirectoryUsers();
    for (const u of sharedUsers) {
      const uLumen = normalizeLumenId(u.lumenId).toLowerCase();
      const uHandle = u.handle.toLowerCase();
      const uName = u.displayName.toLowerCase();
      const matches =
        uLumen === lower ||
        uLumen === queryClean ||
        uLumen.includes(lower) ||
        uLumen.includes(queryClean) ||
        uHandle.includes(lower) ||
        uHandle.includes(queryClean) ||
        uName.includes(lower) ||
        uName.includes(queryClean);

      if (matches) {
        addCandidate({
          uid: u.uid,
          lumenId: u.lumenId,
          displayName: u.displayName,
          handle: u.handle,
          photoURL: u.photoURL || "",
          isDirectIdMatch: uLumen === lower || uLumen === queryClean,
        });
      }
    }
  } catch {}

  // 1. Search the Google Account Dictionary for persistent account matches
  try {
    const dictList = listAllDictionaryAccounts();
    for (const entry of dictList) {
      const entryId = normalizeLumenId(entry.usernameId);
      const entryLower = entryId.toLowerCase();
      const nameLower = entry.displayName.toLowerCase();
      const emailLower = entry.email.toLowerCase();
      const matchesId =
        entryLower === lower ||
        entryLower === queryClean ||
        entryLower === normalizedId.toLowerCase() ||
        entryId.toLowerCase().includes(lower) ||
        entryId.toLowerCase().includes(queryClean);
      const matchesName =
        nameLower.includes(lower) ||
        nameLower.includes(queryClean) ||
        emailLower.includes(lower) ||
        emailLower.includes(queryClean);

      if (matchesId || matchesName) {
        addCandidate({
          uid: entry.uid,
          lumenId: entry.usernameId,
          displayName: entry.displayName || `User ${entry.usernameId}`,
          handle: `@${entry.usernameId.toLowerCase()}`,
          photoURL: entry.photoURL || "",
          isDirectIdMatch: matchesId,
        });
      }
    }
  } catch {}

  // 2. Search locally claimed usernames
  try {
    const claimedMap = readClaimedUsernamesMap();
    for (const [claimedId, ownerUid] of Object.entries(claimedMap)) {
      const cId = claimedId.toLowerCase();
      if (
        cId === lower ||
        cId === queryClean ||
        cId.includes(lower) ||
        cId.includes(queryClean)
      ) {
        addCandidate({
          uid: ownerUid,
          lumenId: claimedId,
          displayName: `User ${claimedId}`,
          handle: `@${cId}`,
          isDirectIdMatch: cId === lower || cId === queryClean,
        });
      }
    }
  } catch {}

  // 3. Direct lookup in Firestore userDirectory by ID variations
  if (normalizedId.length >= 2) {
    try {
      const idKeys = Array.from(new Set([normalizedId, lower, queryClean, normalizedId.toUpperCase()]));
      for (const idKey of idKeys) {
        const dirSnap = await getDoc(doc(db, "userDirectory", idKey));
        if (dirSnap.exists()) {
          const d = dirSnap.data();
          const lumenId = String(d.lumenId ?? idKey);
          const dictMatch = listAllDictionaryAccounts().find(
            (a) => a.usernameId.toLowerCase() === lumenId.toLowerCase(),
          );
          const rawUid = String(d.uid ?? "");
          const uid = sanitizeId(dictMatch?.uid || (rawUid && !rawUid.startsWith("usr_") ? rawUid : dictMatch?.uid || rawUid || `usr_${idKey}`));
          const displayName = String(d.displayName ?? dictMatch?.displayName ?? `User ${lumenId}`);
          const handle = String(d.handle ?? `@${lumenId.toLowerCase()}`);
          addCandidate({
            uid,
            lumenId,
            displayName,
            handle,
            photoURL: dictMatch?.photoURL || "",
            isDirectIdMatch: true,
          });
        }
      }
    } catch {
      // Ignore directory lookup error
    }
  }

  // 4. Targeted queries on Firestore `users` collection by exact lumenId / displayName
  try {
    const candidateQueries = [
      query(collection(db, "users"), where("lumenId", "==", normalizedId), limit(5)),
      query(collection(db, "users"), where("lumenId", "==", lower), limit(5)),
      query(collection(db, "users"), where("displayNameLower", "==", lower), limit(5)),
      query(collection(db, "users"), where("searchable", "==", true), limit(50)),
    ];

    for (const q of candidateQueries) {
      try {
        const snap = await getDocs(q);
        for (const docSnap of snap.docs) {
          const d = docSnap.data();
          const uid = sanitizeId(String(d.uid ?? docSnap.id));
          const lumenId = String(d.lumenId ?? uid);
          const displayName = String(d.displayName ?? "User");
          const displayNameLower = String(d.displayNameLower ?? displayName.toLowerCase());
          const photoURL = typeof d.photoURL === "string" ? d.photoURL : "";
          const handleBase = displayNameLower.replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
          const handle = `@${handleBase || "user"}`.slice(0, BLUEPRINT_LIMITS.MAX_HANDLE_LENGTH);

          const matchesName =
            displayNameLower.includes(lower) ||
            displayNameLower.includes(queryClean) ||
            handle.toLowerCase().includes(lower) ||
            handle.toLowerCase().includes(queryClean);
          const matchesId =
            lumenId.toLowerCase().includes(lower) ||
            lumenId.toLowerCase().includes(queryClean) ||
            lumenId.toLowerCase() === lower ||
            uid.toLowerCase().includes(lower);

          if (matchesName || matchesId) {
            addCandidate({
              uid,
              lumenId,
              displayName,
              handle,
              photoURL,
              isDirectIdMatch: lumenId.toLowerCase() === lower || lumenId.toLowerCase() === queryClean,
            });
          }
        }
      } catch {
        // Query failed (e.g. index missing), continue to next query strategy
      }
    }
  } catch {}

  // 5. Query Firestore `userDirectory` collection for all public entries
  try {
    const dirListQuery = query(collection(db, "userDirectory"), limit(50));
    const dirListSnap = await getDocs(dirListQuery);
    for (const docSnap of dirListSnap.docs) {
      const d = docSnap.data();
      const uid = sanitizeId(String(d.uid ?? docSnap.id));
      const lumenId = String(d.lumenId ?? docSnap.id);
      const displayName = String(d.displayName ?? "User");
      const handle = String(d.handle ?? `@${lumenId.toLowerCase()}`);
      if (
        displayName.toLowerCase().includes(lower) ||
        displayName.toLowerCase().includes(queryClean) ||
        lumenId.toLowerCase().includes(lower) ||
        lumenId.toLowerCase().includes(queryClean) ||
        lumenId.toLowerCase() === lower ||
        handle.toLowerCase().includes(lower) ||
        handle.toLowerCase().includes(queryClean)
      ) {
        addCandidate({
          uid,
          lumenId,
          displayName,
          handle,
          isDirectIdMatch: lumenId.toLowerCase() === lower || lumenId.toLowerCase() === queryClean,
        });
      }
    }
  } catch {}

  return Array.from(resultsById.values());
}

/**
 * Creates a new document in the Firestore `conversations` collection that links
 * two user IDs (`participantIds: [currentUser.uid, targetUser.uid]`,
 * `participantLumenIds: [currentUser.lumenId, targetUser.lumenId]`) when a user
 * initiates a chat.
 */
export async function createConversationBetweenUsers(
  currentUser: AppUser,
  targetUser: {
    uid?: string;
    lumenId: string;
    displayName: string;
    handle?: string;
    role?: string;
  },
): Promise<LinkedConversationData> {
  const peerLumenId = normalizeLumenId(targetUser.lumenId || deriveLumenId(targetUser.displayName));
  const peerUid = sanitizeId(
    targetUser.uid || `usr_${peerLumenId.toLowerCase()}`,
  );
  const convId = buildCanonicalConversationId(
    currentUser.lumenId,
    peerLumenId,
    currentUser.uid,
    peerUid,
  );
  const displayName = (targetUser.displayName.trim() || `User ${peerLumenId}`).slice(
    0,
    BLUEPRINT_LIMITS.MAX_NAME_LENGTH,
  );
  const handleBase = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  const handle = (
    targetUser.handle?.trim() || `@${handleBase || peerLumenId.toLowerCase()}`
  ).slice(0, BLUEPRINT_LIMITS.MAX_HANDLE_LENGTH);
  const role = (targetUser.role?.trim() || `Direct · ${peerLumenId}`).slice(
    0,
    BLUEPRINT_LIMITS.MAX_ROLE_LENGTH,
  );
  const timeStr = formatNowTime();

  const participantIds: [string, string] = [currentUser.uid, peerUid];
  const participantLumenIds: [string, string] = [currentUser.lumenId, peerLumenId];

  const record: LinkedConversationData = {
    id: convId,
    ownerId: currentUser.uid,
    participantIds,
    participantLumenIds,
    peerUserId: peerUid,
    peerLumenId,
    name: displayName,
    handle,
    role,
    isGroup: false,
    memberCount: 2,
    pinned: false,
    unread: 0,
    pinnedMsgId: undefined,
    lastMessageText: "",
    lastMessageTime: timeStr,
    updatedAtMs: Date.now(),
  };

  // Always save to shared conversations for immediate cross-tab/local replication
  try {
    const { saveSharedConversation } = await import("@/lib/realtime-sync");
    saveSharedConversation({
      ...record,
      participantIds: [currentUser.uid, peerUid],
      participantLumenIds: [currentUser.lumenId, peerLumenId],
    });
  } catch {}

  const convPath = `conversations/${convId}`;
  const convRef = doc(db, "conversations", convId);
  try {
    const existingSnap = await getDoc(convRef);
    if (existingSnap.exists()) {
      return record;
    }
  } catch {
    // Proceed to create if not found
  }

  try {
    await setDoc(convRef, {
      ownerId: currentUser.uid,
      participantIds,
      participantLumenIds,
      peerUserId: peerUid,
      peerLumenId,
      name: displayName,
      handle,
      role,
      isGroup: false,
      memberCount: 2,
      pinned: false,
      unread: 0,
      pinnedMsgId: "",
      lastMessageText: "",
      lastMessageTime: timeStr,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return record;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, convPath);
  }
}
