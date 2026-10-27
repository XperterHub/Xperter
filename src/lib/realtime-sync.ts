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

const CLOUD_RELAY_BASE = "https://ntfy.sh";

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
  getBroadcastChannel();

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

/**
 * Publishes an event to the global cloud relay so users across different browsers,
 * incognito windows, mobile phones, or laptops receive it instantly.
 */
export async function publishToCloudRelay(topic: string, event: RealtimeEvent): Promise<void> {
  if (typeof window === "undefined" || !topic) return;
  try {
    const cleanTopic = topic.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    await fetch(`${CLOUD_RELAY_BASE}/${cleanTopic}`, {
      method: "POST",
      headers: {
        "Title": "Xperter Sync",
        "Priority": "high",
      },
      body: JSON.stringify(event),
    });
  } catch {
    // Ignore relay transport failure
  }
}

function handleIncomingRelayEvent(ev: RealtimeEvent) {
  if (!ev || typeof ev !== "object" || !ev.type) return;

  if (ev.type === "FRIEND_REQUEST_SENT" && ev.request) {
    const all = readAllSharedFriendRequests();
    if (!all.some((r) => r.id === ev.request.id)) {
      writeAllSharedFriendRequests([ev.request, ...all]);
    }
    try {
      const fromKey = `lumen.requests.${ev.request.fromUid}`;
      const toKey = `lumen.requests.${ev.request.toUid}`;
      const rawTo = window.localStorage.getItem(toKey);
      const toList = rawTo ? JSON.parse(rawTo) : [];
      window.localStorage.setItem(
        toKey,
        JSON.stringify([ev.request, ...(Array.isArray(toList) ? toList.filter((x: any) => x.id !== ev.request.id) : [])]),
      );
    } catch {}
  } else if (ev.type === "FRIEND_REQUEST_UPDATED") {
    const all = readAllSharedFriendRequests();
    const next = all.map((r) =>
      r.id === ev.requestId ? { ...r, status: ev.status, updatedAtMs: Date.now() } : r,
    );
    writeAllSharedFriendRequests(next);
    try {
      const targetReq = all.find((r) => r.id === ev.requestId);
      if (targetReq) {
        for (const uid of [targetReq.fromUid, targetReq.toUid]) {
          if (!uid) continue;
          const key = `lumen.requests.${uid}`;
          const raw = window.localStorage.getItem(key);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              window.localStorage.setItem(
                key,
                JSON.stringify(list.map((r: any) => r.id === ev.requestId ? { ...r, status: ev.status } : r)),
              );
            }
          }
        }
      }
    } catch {}
  } else if (ev.type === "CONVERSATION_UPSERTED" && ev.conversation) {
    const all = readAllSharedConversations();
    const idx = all.findIndex((c) => c.id === ev.conversation.id);
    let next: RealtimeConversation[];
    if (idx >= 0) {
      next = [...all];
      next[idx] = { ...next[idx]!, ...ev.conversation };
    } else {
      next = [ev.conversation, ...all];
    }
    writeAllSharedConversations(next);
    try {
      for (const uid of ev.conversation.participantIds) {
        if (!uid) continue;
        const key = `lumen.chats.${uid}`;
        const raw = window.localStorage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        const existingIdx = Array.isArray(list) ? list.findIndex((c: any) => c.id === ev.conversation.id) : -1;
        let updatedChats = Array.isArray(list) ? [...list] : [];
        if (existingIdx >= 0) {
          updatedChats[existingIdx] = { ...updatedChats[existingIdx], ...ev.conversation };
        } else {
          updatedChats.unshift(ev.conversation);
        }
        window.localStorage.setItem(key, JSON.stringify(updatedChats));
      }
    } catch {}
  } else if (ev.type === "MESSAGE_SENT" && ev.convId && ev.message) {
    const existing = readSharedMessages(ev.convId);
    if (!existing.some((m) => m.id === ev.message.id)) {
      try {
        window.localStorage.setItem(
          `${SHARED_MESSAGES_KEY_PREFIX}${ev.convId}`,
          JSON.stringify([...existing, ev.message]),
        );
      } catch {}
    }
  }

  notifyListeners(ev);
}

/**
 * Connects the current user to their private cloud relay inbox topic(s).
 * Polls for missed messages while offline (past 24h) and listens live via WebSocket.
 */
export function connectUserCloudRelay(lumenId: string, uid?: string): () => void {
  if (typeof window === "undefined" || (!lumenId && !uid)) return () => {};

  const topics = new Set<string>();
  if (lumenId) {
    const normLumen = normalizeLumenId(lumenId).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "_");
    if (normLumen) topics.add(`xperter_inbox_${normLumen}`);
    const rawLumen = lumenId.trim().replace(/^@+/, "").toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "_");
    if (rawLumen) topics.add(`xperter_inbox_${rawLumen}`);
  }
  if (uid) {
    const cleanUid = sanitizeId(uid).toLowerCase();
    if (cleanUid) topics.add(`xperter_inbox_${cleanUid}`);
  }

  const cleanups: Array<() => void> = [];

  for (const topic of topics) {
    // 1. Immediately retrieve pending offline messages from past 24 hours
    const pollMissed = async () => {
      try {
        const res = await fetch(`${CLOUD_RELAY_BASE}/${topic}/json?poll=1&since=24h`);
        if (!res.ok) return;
        const text = await res.text();
        const lines = text.trim().split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.event === "message" && parsed.message) {
              const ev = JSON.parse(parsed.message) as RealtimeEvent;
              handleIncomingRelayEvent(ev);
            }
          } catch {}
        }
      } catch {}
    };
    void pollMissed();

    // 2. Open live WebSocket with since=24h for zero-gap delivery
    let ws: WebSocket | null = null;
    let isClosed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connectWs = () => {
      if (isClosed) return;
      try {
        ws = new WebSocket(`wss://ntfy.sh/${topic}/ws?since=24h`);
        ws.onmessage = (msgEvent) => {
          try {
            const parsed = JSON.parse(msgEvent.data);
            if (parsed.event === "message" && parsed.message) {
              const ev = JSON.parse(parsed.message) as RealtimeEvent;
              handleIncomingRelayEvent(ev);
            }
          } catch {}
        };
        ws.onclose = () => {
          if (!isClosed) {
            reconnectTimer = setTimeout(connectWs, 3000);
          }
        };
        ws.onerror = () => {
          try { ws?.close(); } catch {}
        };
      } catch {
        if (!isClosed) {
          reconnectTimer = setTimeout(connectWs, 5000);
        }
      }
    };

    connectWs();

    cleanups.push(() => {
      isClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {}
    });
  }

  return () => {
    for (const fn of cleanups) {
      fn();
    }
  };
}

/**
 * Connects the active conversation to its private cloud relay topic for sub-second chat replication.
 */
export function connectConversationCloudRelay(convId: string): () => void {
  if (typeof window === "undefined" || !convId) return () => {};

  const cleanConv = convId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const topic = `xperter_conv_${cleanConv}`;

  const pollMissed = async () => {
    try {
      const res = await fetch(`${CLOUD_RELAY_BASE}/${topic}/json?poll=1&since=24h`);
      if (!res.ok) return;
      const text = await res.text();
      const lines = text.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.event === "message" && parsed.message) {
            const ev = JSON.parse(parsed.message) as RealtimeEvent;
            handleIncomingRelayEvent(ev);
          }
        } catch {}
      }
    } catch {}
  };
  void pollMissed();

  let ws: WebSocket | null = null;
  let isClosed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connectWs = () => {
    if (isClosed) return;
    try {
      ws = new WebSocket(`wss://ntfy.sh/${topic}/ws?since=24h`);
      ws.onmessage = (msgEvent) => {
        try {
          const parsed = JSON.parse(msgEvent.data);
          if (parsed.event === "message" && parsed.message) {
            const ev = JSON.parse(parsed.message) as RealtimeEvent;
            handleIncomingRelayEvent(ev);
          }
        } catch {}
      };
      ws.onclose = () => {
        if (!isClosed) {
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      };
      ws.onerror = () => {
        try { ws?.close(); } catch {}
      };
    } catch {
      if (!isClosed) {
        reconnectTimer = setTimeout(connectWs, 5000);
      }
    }
  };

  connectWs();

  return () => {
    isClosed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try {
      ws?.close();
    } catch {}
  };
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

  // Sync to per-user legacy keys for safety
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

  // Relay to recipient's private cloud inbox
  const targetTopics = new Set<string>();
  if (req.toLumenId) {
    const norm = normalizeLumenId(req.toLumenId).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "_");
    if (norm) targetTopics.add(`xperter_inbox_${norm}`);
    const raw = req.toLumenId.trim().replace(/^@+/, "").toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "_");
    if (raw) targetTopics.add(`xperter_inbox_${raw}`);
  }
  if (req.toUid) {
    const cleanUid = sanitizeId(req.toUid).toLowerCase();
    if (cleanUid) targetTopics.add(`xperter_inbox_${cleanUid}`);
  }
  for (const topic of targetTopics) {
    void publishToCloudRelay(topic, { type: "FRIEND_REQUEST_SENT", request: req });
  }
}

export function updateSharedFriendRequestStatus(
  requestId: string,
  status: "accepted" | "declined",
  targetLumenId?: string,
): void {
  const all = readAllSharedFriendRequests();
  const targetReq = all.find((r) => r.id === requestId);
  const next = all.map((r) =>
    r.id === requestId ? { ...r, status, updatedAtMs: Date.now() } : r,
  );
  writeAllSharedFriendRequests(next);
  broadcastRealtimeEvent({ type: "FRIEND_REQUEST_UPDATED", requestId, status });

  // Relay status to the sender's private cloud inbox
  const senderTopics = new Set<string>();
  const fromLumen = targetLumenId || targetReq?.fromLumenId;
  if (fromLumen) {
    const norm = normalizeLumenId(fromLumen).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "_");
    if (norm) senderTopics.add(`xperter_inbox_${norm}`);
    const raw = fromLumen.trim().replace(/^@+/, "").toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "_");
    if (raw) senderTopics.add(`xperter_inbox_${raw}`);
  }
  if (targetReq?.fromUid) {
    const cleanUid = sanitizeId(targetReq.fromUid).toLowerCase();
    if (cleanUid) senderTopics.add(`xperter_inbox_${cleanUid}`);
  }
  for (const topic of senderTopics) {
    void publishToCloudRelay(topic, { type: "FRIEND_REQUEST_UPDATED", requestId, status });
  }
}

export function getSharedFriendRequestsForUser(
  lumenId: string,
  uid?: string,
): RealtimeFriendRequest[] {
  const all = readAllSharedFriendRequests();
  const normLumen = normalizeLumenId(lumenId).toLowerCase();
  const rawLumen = (lumenId || "").trim().toLowerCase().replace(/^@+/, "");
  const cleanUid = uid ? sanitizeId(uid).toLowerCase() : "";
  return all.filter((r) => {
    const targetLumen = normalizeLumenId(r.toLumenId).toLowerCase();
    const rawTarget = (r.toLumenId || "").trim().toLowerCase().replace(/^@+/, "");
    const targetUid = sanitizeId(r.toUid).toLowerCase();
    const matchesLumen = Boolean(normLumen && (targetLumen === normLumen || rawTarget === normLumen || targetLumen === rawLumen));
    const matchesUid = Boolean(cleanUid && (targetUid === cleanUid || targetUid === `usr_${normLumen}` || targetUid === `dir_${normLumen}`));
    return matchesLumen || matchesUid;
  });
}

export function getSharedFriendRequestsSentByUser(
  lumenId: string,
  uid?: string,
): RealtimeFriendRequest[] {
  const all = readAllSharedFriendRequests();
  const normLumen = normalizeLumenId(lumenId).toLowerCase();
  const rawLumen = (lumenId || "").trim().toLowerCase().replace(/^@+/, "");
  const cleanUid = uid ? sanitizeId(uid).toLowerCase() : "";
  return all.filter((r) => {
    const fromLumen = normalizeLumenId(r.fromLumenId).toLowerCase();
    const rawFrom = (r.fromLumenId || "").trim().toLowerCase().replace(/^@+/, "");
    const fromUid = sanitizeId(r.fromUid).toLowerCase();
    const matchesLumen = Boolean(normLumen && (fromLumen === normLumen || rawFrom === normLumen || fromLumen === rawLumen));
    const matchesUid = Boolean(cleanUid && fromUid === cleanUid);
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

  // Sync to per-user contacts keys
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

  // Relay conversation to participants
  for (const pLumen of conv.participantLumenIds) {
    const norm = normalizeLumenId(pLumen).toLowerCase();
    if (norm) {
      const topic = `xperter_inbox_${norm.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      void publishToCloudRelay(topic, { type: "CONVERSATION_UPSERTED", conversation: conv });
    }
  }
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

  // Relay message to conversation topic
  const cleanConv = convId.replace(/[^a-zA-Z0-9_-]/g, "_");
  void publishToCloudRelay(`xperter_conv_${cleanConv}`, {
    type: "MESSAGE_SENT",
    convId,
    message,
  });
}

export function readAllSharedDirectoryUsers(): RealtimeDirectoryUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SHARED_USER_DIRECTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RealtimeDirectoryUser[]) : [];
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
