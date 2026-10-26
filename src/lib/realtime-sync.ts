import { normalizeLumenId, sanitizeId } from "@/lib/firebase";

export interface RealtimeFriendRequest {
  id: string;
  fromUid: string;
  fromLumenId: string;
  fromName: string;
  toUid: string;
  toLumenId: string;
  toName: string;
  status: "pending" | "accepted" | "declined";
  createdAtMs: number;
  updatedAtMs?: number;
}

export interface RealtimeConversation {
  id: string;
  ownerId: string;
  participantIds: string[];
  participantLumenIds: string[];
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
}

export interface RealtimeDirectoryUser {
  uid: string;
  lumenId: string;
  displayName: string;
  handle: string;
  photoURL?: string;
  email?: string;
  updatedAtMs: number;
}

export type RealtimeEvent =
  | { type: "FRIEND_REQUEST_SENT"; request: RealtimeFriendRequest }
  | { type: "FRIEND_REQUEST_UPDATED"; requestId: string; status: "accepted" | "declined" }
  | { type: "CONVERSATION_UPSERTED"; conversation: RealtimeConversation }
  | { type: "MESSAGE_SENT"; convId: string; message: any }
  | { type: "USER_DIRECTORY_UPDATED"; user: RealtimeDirectoryUser };

export const SHARED_FRIEND_REQUESTS_KEY = "xperter.shared_friend_requests.v2";
export const SHARED_CONVERSATIONS_KEY = "xperter.shared_conversations.v2";
export const SHARED_MESSAGES_KEY_PREFIX = "xperter.messages.shared.";
export const SHARED_USER_DIRECTORY_KEY = "xperter.shared_user_directory.v2";

let broadcastChannel: BroadcastChannel | null = null;
const eventListeners = new Set<(event: RealtimeEvent) => void>();

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return null;
  }
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel("xperter_realtime_sync");
      broadcastChannel.onmessage = (ev) => {
        if (ev.data && typeof ev.data === "object" && "type" in ev.data) {
          notifyListeners(ev.data as RealtimeEvent);
        }
      };
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

function notifyListeners(event: RealtimeEvent) {
  for (const listener of eventListeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  }
}

export function subscribeToRealtimeEvents(
  callback: (event: RealtimeEvent) => void,
): () => void {
  eventListeners.add(callback);
  getBroadcastChannel(); // Initialize channel if not already done

  const storageHandler = (e: StorageEvent) => {
    if (!e.newValue) return;
    if (e.key === SHARED_FRIEND_REQUESTS_KEY) {
      notifyListeners({
        type: "FRIEND_REQUEST_UPDATED",
        requestId: "",
        status: "accepted",
      });
    } else if (e.key === SHARED_CONVERSATIONS_KEY) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (Array.isArray(parsed) && parsed[0]) {
          notifyListeners({
            type: "CONVERSATION_UPSERTED",
            conversation: parsed[0] as RealtimeConversation,
          });
        }
      } catch {}
    } else if (e.key?.startsWith(SHARED_MESSAGES_KEY_PREFIX)) {
      const convId = e.key.slice(SHARED_MESSAGES_KEY_PREFIX.length);
      try {
        const msgs = JSON.parse(e.newValue);
        if (Array.isArray(msgs) && msgs.length > 0) {
          const lastMsg = msgs[msgs.length - 1];
          notifyListeners({
            type: "MESSAGE_SENT",
            convId,
            message: lastMsg,
          });
        }
      } catch {}
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", storageHandler);
  }

  return () => {
    eventListeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", storageHandler);
    }
  };
}

export function broadcastRealtimeEvent(event: RealtimeEvent): void {
  notifyListeners(event);
  const ch = getBroadcastChannel();
  if (ch) {
    try {
      ch.postMessage(event);
    } catch {}
  }
}

export function readAllSharedFriendRequests(): RealtimeFriendRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SHARED_FRIEND_REQUESTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RealtimeFriendRequest[]) : [];
  } catch {
    return [];
  }
}

export function writeAllSharedFriendRequests(requests: RealtimeFriendRequest[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHARED_FRIEND_REQUESTS_KEY, JSON.stringify(requests));
  } catch {}
}

export function saveSharedFriendRequest(req: RealtimeFriendRequest): void {
  const all = readAllSharedFriendRequests();
  const index = all.findIndex((r) => r.id === req.id);
  let updated: RealtimeFriendRequest[];
  if (index >= 0) {
    updated = [...all];
    updated[index] = { ...updated[index]!, ...req, updatedAtMs: Date.now() };
  } else {
    updated = [req, ...all];
  }
  writeAllSharedFriendRequests(updated);

  // Also sync to per-user legacy keys for safety
  try {
    const fromKey = `lumen.requests.${req.fromUid}`;
    const toKey = `lumen.requests.${req.toUid}`;
    const rawFrom = window.localStorage.getItem(fromKey);
    const fromList = rawFrom ? JSON.parse(rawFrom) : [];
    window.localStorage.setItem(
      fromKey,
      JSON.stringify([req, ...(Array.isArray(fromList) ? fromList.filter((x: any) => x.id !== req.id) : [])]),
    );

    const rawTo = window.localStorage.getItem(toKey);
    const toList = rawTo ? JSON.parse(rawTo) : [];
    window.localStorage.setItem(
      toKey,
      JSON.stringify([req, ...(Array.isArray(toList) ? toList.filter((x: any) => x.id !== req.id) : [])]),
    );
  } catch {}

  broadcastRealtimeEvent({ type: "FRIEND_REQUEST_SENT", request: req });
}

export function updateSharedFriendRequestStatus(
  requestId: string,
  status: "accepted" | "declined",
): void {
  const all = readAllSharedFriendRequests();
  const next = all.map((r) =>
    r.id === requestId ? { ...r, status, updatedAtMs: Date.now() } : r,
  );
  writeAllSharedFriendRequests(next);
  broadcastRealtimeEvent({ type: "FRIEND_REQUEST_UPDATED", requestId, status });
}

export function getSharedFriendRequestsForUser(
  lumenId: string,
  uid?: string,
): RealtimeFriendRequest[] {
  const all = readAllSharedFriendRequests();
  const normLumen = normalizeLumenId(lumenId).toLowerCase();
  const cleanUid = uid ? sanitizeId(uid) : "";
  return all.filter((r) => {
    const targetLumen = normalizeLumenId(r.toLumenId).toLowerCase();
    const matchesLumen = targetLumen === normLumen;
    const matchesUid = cleanUid ? r.toUid === cleanUid : false;
    return matchesLumen || matchesUid;
  });
}

export function getSharedFriendRequestsSentByUser(
  lumenId: string,
  uid?: string,
): RealtimeFriendRequest[] {
  const all = readAllSharedFriendRequests();
  const normLumen = normalizeLumenId(lumenId).toLowerCase();
  const cleanUid = uid ? sanitizeId(uid) : "";
  return all.filter((r) => {
    const fromLumen = normalizeLumenId(r.fromLumenId).toLowerCase();
    const matchesLumen = fromLumen === normLumen;
    const matchesUid = cleanUid ? r.fromUid === cleanUid : false;
    return matchesLumen || matchesUid;
  });
}

export function readAllSharedConversations(): RealtimeConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SHARED_CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RealtimeConversation[]) : [];
  } catch {
    return [];
  }
}

export function writeAllSharedConversations(convs: RealtimeConversation[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHARED_CONVERSATIONS_KEY, JSON.stringify(convs));
  } catch {}
}

export function saveSharedConversation(conv: RealtimeConversation): void {
  const all = readAllSharedConversations();
  const index = all.findIndex((c) => c.id === conv.id);
  let updated: RealtimeConversation[];
  if (index >= 0) {
    updated = [...all];
    updated[index] = { ...updated[index]!, ...conv, updatedAtMs: Date.now() };
  } else {
    updated = [conv, ...all];
  }
  writeAllSharedConversations(updated);

  // Also sync to per-user contacts keys
  try {
    for (const uid of conv.participantIds) {
      if (!uid) continue;
      const userKey = `lumen.chats.${uid}`;
      const raw = window.localStorage.getItem(userKey);
      const list = raw ? JSON.parse(raw) : [];
      const filtered = Array.isArray(list) ? list.filter((c: any) => c.id !== conv.id) : [];
      window.localStorage.setItem(userKey, JSON.stringify([conv, ...filtered]));
    }
  } catch {}

  broadcastRealtimeEvent({ type: "CONVERSATION_UPSERTED", conversation: conv });
}

export function getSharedConversationsForUser(
  lumenId: string,
  uid?: string,
): RealtimeConversation[] {
  const all = readAllSharedConversations();
  const normLumen = normalizeLumenId(lumenId).toLowerCase();
  const cleanUid = uid ? sanitizeId(uid) : "";

  return all.filter((c) => {
    const matchesLumen = Array.isArray(c.participantLumenIds) &&
      c.participantLumenIds.some((id) => normalizeLumenId(id).toLowerCase() === normLumen);
    const matchesUid = cleanUid && Array.isArray(c.participantIds) &&
      c.participantIds.includes(cleanUid);
    const matchesOwner = cleanUid ? c.ownerId === cleanUid : false;
    return matchesLumen || matchesUid || matchesOwner;
  });
}

export function readSharedMessages(convId: string): any[] {
  if (typeof window === "undefined" || !convId) return [];
  try {
    const raw = window.localStorage.getItem(`${SHARED_MESSAGES_KEY_PREFIX}${convId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSharedMessage(convId: string, message: any): void {
  if (typeof window === "undefined" || !convId || !message) return;
  const existing = readSharedMessages(convId);
  const exists = existing.some((m) => m.id === message.id);
  let next: any[];
  if (exists) {
    next = existing.map((m) => (m.id === message.id ? { ...m, ...message } : m));
  } else {
    next = [...existing, message];
  }
  try {
    window.localStorage.setItem(`${SHARED_MESSAGES_KEY_PREFIX}${convId}`, JSON.stringify(next));
  } catch {}

  broadcastRealtimeEvent({ type: "MESSAGE_SENT", convId, message });
}

export function readAllSharedDirectoryUsers(): RealtimeDirectoryUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SHARED_USER_DIRECTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSharedDirectoryUser(
  user: Omit<RealtimeDirectoryUser, "updatedAtMs">,
): void {
  if (typeof window === "undefined" || !user || !user.lumenId) return;
  const existing = readAllSharedDirectoryUsers();
  const normLumen = normalizeLumenId(user.lumenId).toLowerCase();
  const cleanUid = user.uid ? sanitizeId(user.uid) : "";
  const fullUser: RealtimeDirectoryUser = {
    ...user,
    uid: cleanUid,
    lumenId: user.lumenId,
    handle: user.handle.startsWith("@") ? user.handle : `@${user.lumenId.toLowerCase()}`,
    updatedAtMs: Date.now(),
  };

  const filtered = existing.filter((u) => {
    const matchLumen = normalizeLumenId(u.lumenId).toLowerCase() === normLumen;
    const matchUid = cleanUid && u.uid && u.uid === cleanUid;
    return !matchLumen && !matchUid;
  });

  const next = [...filtered, fullUser];
  try {
    window.localStorage.setItem(SHARED_USER_DIRECTORY_KEY, JSON.stringify(next));
  } catch {}

  broadcastRealtimeEvent({ type: "USER_DIRECTORY_UPDATED", user: fullUser });
}

export function getSharedDirectoryUsers(): RealtimeDirectoryUser[] {
  return readAllSharedDirectoryUsers();
}

