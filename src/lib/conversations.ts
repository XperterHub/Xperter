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

  const isCloud = Boolean(currentUser?.isCloudUser || auth.currentUser);

  // 0. Search the Google Account Dictionary for instant matches
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

  if (isCloud) {
    // 1. Direct lookup by unique User ID in userDirectory/{lumenId}
    if (normalizedId.length >= 3) {
      try {
        let dirSnap = await getDoc(doc(db, "userDirectory", normalizedId));
        if (!dirSnap.exists() && normalizedId !== normalizedId.toLowerCase()) {
          dirSnap = await getDoc(doc(db, "userDirectory", normalizedId.toLowerCase()));
        }
        if (!dirSnap.exists() && normalizedId !== normalizedId.toUpperCase()) {
          dirSnap = await getDoc(doc(db, "userDirectory", normalizedId.toUpperCase()));
        }
        if (dirSnap.exists()) {
          const d = dirSnap.data();
          const lumenId = String(d.lumenId ?? normalizedId);
          // Check if dictionary has the real auth UID for this user ID
          const dictMatch = listAllDictionaryAccounts().find(
            (a) => a.usernameId.toLowerCase() === lumenId.toLowerCase(),
          );
          const rawUid = String(d.uid ?? "");
          const uid = sanitizeId(dictMatch?.uid || (rawUid && !rawUid.startsWith("usr_") ? rawUid : dictMatch?.uid || rawUid || `usr_${normalizedId}`));
          const displayName = String(d.displayName ?? dictMatch?.displayName ?? `User ${lumenId}`);
          const handle = String(
            d.handle ?? `@${displayName.toLowerCase().replace(/[^a-z0-9]+/g, ".")}`,
          );
          addCandidate({
            uid,
            lumenId,
            displayName,
            handle,
            photoURL: dictMatch?.photoURL || "",
            isDirectIdMatch: true,
          });
        }
      } catch {
        // Ignore directory lookup error
      }
    }

    // 2. Query the Firestore `users` collection for searchable users by display name or user ID
    try {
      const usersQuery = query(
        collection(db, "users"),
        where("searchable", "==", true),
        limit(40),
      );
      const usersSnap = await getDocs(usersQuery);
      for (const docSnap of usersSnap.docs) {
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
          lumenId.toLowerCase() === normalizedId.toLowerCase() ||
          uid.toLowerCase().includes(lower);

        if (matchesName || matchesId) {
          addCandidate({
            uid,
            lumenId,
            displayName,
            handle,
            photoURL,
          });
        }
      }
    } catch {
      // Fallback to directory query if users query encounters an error
    }

    // 3. Also query `userDirectory` collection for additional public handles/IDs
    try {
      const dirListQuery = query(collection(db, "userDirectory"), limit(40));
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
          lumenId.toLowerCase() === normalizedId.toLowerCase() ||
          handle.toLowerCase().includes(lower) ||
          handle.toLowerCase().includes(queryClean)
        ) {
          addCandidate({
            uid,
            lumenId,
            displayName,
            handle,
          });
        }
      }
    } catch {
      // Ignore fallback error
    }
  } else {
    // Local / offline fallback: search locally claimed usernames
    try {
      const claimedMap = readClaimedUsernamesMap();
      for (const [claimedId, ownerUid] of Object.entries(claimedMap)) {
        if (
          claimedId.toLowerCase().includes(lower) ||
          claimedId.toLowerCase().includes(queryClean) ||
          claimedId.toLowerCase() === normalizedId.toLowerCase()
        ) {
          addCandidate({
            uid: ownerUid,
            lumenId: claimedId,
            displayName: `User ${claimedId}`,
            handle: `@${claimedId.toLowerCase()}`,
          });
        }
      }
    } catch {
      // Ignore local storage error
    }
  }

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
  const convId = buildPairConversationId(currentUser.uid, peerUid);
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

  if (!currentUser.isCloudUser) {
    return record;
  }

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
