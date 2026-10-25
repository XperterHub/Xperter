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
import type { AppUser } from "@/lib/auth";
import {
  BLUEPRINT_LIMITS,
  db,
  deriveLumenId,
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

  if (currentUser?.isCloudUser) {
    // 1. Direct lookup by unique User ID in userDirectory/{lumenId}
    if (normalizedId.length >= 4) {
      try {
        const dirSnap = await getDoc(doc(db, "userDirectory", normalizedId));
        if (dirSnap.exists()) {
          const d = dirSnap.data();
          const uid = sanitizeId(String(d.uid ?? `usr_${normalizedId}`));
          const lumenId = String(d.lumenId ?? normalizedId);
          const displayName = String(d.displayName ?? `User ${lumenId}`);
          const handle = String(
            d.handle ?? `@${displayName.toLowerCase().replace(/[^a-z0-9]+/g, ".")}`,
          );
          addCandidate({
            uid,
            lumenId,
            displayName,
            handle,
            photoURL: "",
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
        const lumenId = String(d.lumenId ?? deriveLumenId(uid));
        const displayName = String(d.displayName ?? "User");
        const displayNameLower = String(d.displayNameLower ?? displayName.toLowerCase());
        const photoURL = typeof d.photoURL === "string" ? d.photoURL : "";
        const handleBase = displayNameLower.replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
        const handle = `@${handleBase || "user"}`.slice(0, BLUEPRINT_LIMITS.MAX_HANDLE_LENGTH);

        const matchesName =
          displayNameLower.includes(lower) || handle.toLowerCase().includes(lower);
        const matchesId =
          lumenId.toLowerCase().includes(lower) ||
          lumenId.toUpperCase() === normalizedId ||
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
        const handle = String(d.handle ?? "@user");
        if (
          displayName.toLowerCase().includes(lower) ||
          lumenId.toLowerCase().includes(lower) ||
          lumenId.toUpperCase() === normalizedId ||
          handle.toLowerCase().includes(lower)
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
  }

  // 4. If the query looks like a User ID or display name and no exact match was found yet,
  // provide a direct connectable entry so the user can initiate a conversation immediately.
  const looksLikeLumenId =
    /^lmn[-_]?[a-z0-9]{2,}$/i.test(trimmed) || /^[a-z0-9]{5,12}$/i.test(trimmed);
  if (resultsById.size === 0 && trimmed.length >= 2) {
    if (looksLikeLumenId) {
      const targetLumenId = normalizedId.slice(0, BLUEPRINT_LIMITS.MAX_LUMEN_ID_LENGTH);
      const syntheticUid = sanitizeId(`usr_${targetLumenId.toLowerCase()}`);
      addCandidate({
        uid: syntheticUid,
        lumenId: targetLumenId,
        displayName: `User ${targetLumenId}`,
        handle: `@${targetLumenId.toLowerCase().replace(/[^a-z0-9_-]+/g, ".")}`,
        isDirectIdMatch: true,
      });
    } else {
      const cleanName = trimmed.slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH);
      const syntheticUid = sanitizeId(
        `usr_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      );
      const targetLumenId = deriveLumenId(syntheticUid);
      const handleBase = cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "");
      addCandidate({
        uid: syntheticUid,
        lumenId: targetLumenId,
        displayName: cleanName,
        handle: `@${handleBase || "user"}`.slice(0, BLUEPRINT_LIMITS.MAX_HANDLE_LENGTH),
        isDirectIdMatch: true,
      });
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
