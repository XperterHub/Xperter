export type AnnouncementCategory = "update" | "feature" | "security";

export type AppAnnouncement = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: AnnouncementCategory;
  version: string;
  author: string;
  date: string;
  createdAtMs: number;
  pinned?: boolean;
  acknowledgedCount: number;
  acknowledgedByMe?: boolean;
};

export type NotificationKind = "message" | "friend_request" | "announcement" | "system";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  createdAtMs: number;
  read: boolean;
  conversationId?: string;
  friendRequestId?: string;
  announcementId?: string;
  senderName?: string;
  peerLumenId?: string;
};

export type NotificationPrefs = {
  soundEnabled: boolean;
  muteAll: boolean;
  desktopAlerts: boolean;
  announcementAlerts: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  soundEnabled: true,
  muteAll: false,
  desktopAlerts: false,
  announcementAlerts: true,
};

export const READ_ANN_KEY = "lumen.inbox.readAnnouncements";
export const READ_NOTIF_KEY = "lumen.inbox.readNotifications";
export const CUSTOM_ANN_KEY = "lumen.inbox.customAnnouncements";
export const NOTIF_PREFS_KEY = "lumen.inbox.prefs";

export function getCustomAnnouncements(): AppAnnouncement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_ANN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomAnnouncement(ann: AppAnnouncement): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getCustomAnnouncements();
    const next = [ann, ...existing.filter((a) => a.id !== ann.id)];
    window.localStorage.setItem(CUSTOM_ANN_KEY, JSON.stringify(next));
  } catch {}
}

export const INITIAL_APP_ANNOUNCEMENTS: AppAnnouncement[] = [
  {
    id: "ann_lumen_2_4",
    title: "Xperter 2.4 · Chrome & Liquid Glass Workspace",
    summary:
      "Refined liquid-lens refraction, adaptive frost controls, and zero-shift modal navigation across desktop, tablet, and mobile.",
    body: "Welcome to Xperter 2.4. This release introduces hardware-accelerated liquid glass surfaces, per-account theme and frost persistence synced with Cloud Firestore, and a unified Announcements Inbox to keep every workspace member informed on platform updates.",
    category: "update",
    version: "v2.4",
    author: "Xperter Core Team",
    date: "Today",
    createdAtMs: 1761264000000,
    pinned: true,
    acknowledgedCount: 28,
    acknowledgedByMe: false,
  },
  {
    id: "ann_realtime_notifications",
    title: "Instant Thread Notifications & Live Presence",
    summary:
      "Real-time online status via Firebase Realtime Database, live typing indicators in chat headers, and customizable notification alerts.",
    body: "Stay on top of active conversations with instant notifications for incoming messages, friend requests, and platform announcements. Toggle notification sound chimes or enable Do Not Disturb mode directly from the Messages notification center.",
    category: "feature",
    version: "v2.3",
    author: "Xperter Engineering",
    date: "Yesterday",
    createdAtMs: 1761177600000,
    pinned: true,
    acknowledgedCount: 19,
    acknowledgedByMe: false,
  },
  {
    id: "ann_voice_polls",
    title: "HD Spatial Voice Notes & Live Thread Polls",
    summary:
      "Record waveform voice notes with variable playback speed (1x, 1.5x, 2x) and run instant multi-option polls inside any conversation.",
    body: "Use the microphone button in the message composer to capture voice notes with interactive waveform scrubbing, or open the attachment menu to launch a real-time poll for quick team decisions.",
    category: "feature",
    version: "v2.2",
    author: "Xperter Product",
    date: "Oct 21",
    createdAtMs: 1761004800000,
    pinned: false,
    acknowledgedCount: 34,
    acknowledgedByMe: true,
  },
  {
    id: "ann_security_vault",
    title: "Zero-Trust Firestore Rules & Shareable User IDs",
    summary:
      "Strict attribute-based access control, PII isolation, and shareable Xperter User IDs (XPT-XXXXXX) for private friend connections.",
    body: "All conversation threads and user directory lookups are protected by hardened Firestore security rules. Connect with teammates using your unique Xperter User ID without exposing personal email addresses.",
    category: "security",
    version: "v2.1",
    author: "Xperter Security",
    date: "Oct 18",
    createdAtMs: 1760745600000,
    pinned: false,
    acknowledgedCount: 41,
    acknowledgedByMe: true,
  },
];

export function filterAnnouncements(
  announcements: AppAnnouncement[],
  category: "all" | AnnouncementCategory,
  searchQuery: string,
): AppAnnouncement[] {
  const q = searchQuery.trim().toLowerCase();
  const filtered = announcements.filter((item) => {
    if (category !== "all" && item.category !== category) {
      return false;
    }
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.body.toLowerCase().includes(q) ||
      item.version.toLowerCase().includes(q) ||
      item.author.toLowerCase().includes(q)
    );
  });

  return [...filtered].sort((a, b) => {
    if (Boolean(b.pinned) !== Boolean(a.pinned)) {
      return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    }
    return b.createdAtMs - a.createdAtMs;
  });
}

export function countUnreadAnnouncements(
  announcements: AppAnnouncement[],
  readIds: string[],
): number {
  const readSet = new Set(readIds);
  return announcements.reduce((acc, item) => (readSet.has(item.id) ? acc : acc + 1), 0);
}

export function countUnreadNotifications(notifications: AppNotification[]): number {
  return notifications.reduce((acc, item) => (item.read ? acc : acc + 1), 0);
}

export function filterNotifications(
  notifications: AppNotification[],
  tab: "all" | "unread" | "requests" | "announcements",
): AppNotification[] {
  const sorted = [...notifications].sort((a, b) => b.createdAtMs - a.createdAtMs);
  if (tab === "unread") {
    return sorted.filter((n) => !n.read);
  }
  if (tab === "requests") {
    return sorted.filter((n) => n.kind === "friend_request");
  }
  if (tab === "announcements") {
    return sorted.filter((n) => n.kind === "announcement");
  }
  return sorted;
}

export function markNotificationReadById(
  notifications: AppNotification[],
  id: string,
): AppNotification[] {
  return notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
}

export function markAllNotificationsAsRead(notifications: AppNotification[]): AppNotification[] {
  return notifications.map((n) => (n.read ? n : { ...n, read: true }));
}

export function buildAnnouncementItem(input: {
  title: string;
  summary: string;
  body?: string;
  category: AnnouncementCategory;
  version?: string;
  author: string;
  pinned?: boolean;
  nowMs?: number;
}): AppAnnouncement {
  const nowMs = input.nowMs ?? Date.now();
  const cleanTitle = input.title.trim().slice(0, 120);
  const cleanSummary = input.summary.trim().slice(0, 240);
  const cleanBody = (input.body?.trim() || cleanSummary).slice(0, 1200);
  const cleanVersion = (input.version?.trim() || "v2.4").slice(0, 16);
  const cleanAuthor = (input.author.trim() || "Workspace Admin").slice(0, 60);

  return {
    id: `ann_${nowMs}_${Math.random().toString(36).slice(2, 7)}`,
    title: cleanTitle,
    summary: cleanSummary,
    body: cleanBody,
    category: input.category,
    version: cleanVersion,
    author: cleanAuthor,
    date: "Just now",
    createdAtMs: nowMs,
    pinned: Boolean(input.pinned),
    acknowledgedCount: 1,
    acknowledgedByMe: true,
  };
}

export function synthesizeWorkspaceNotifications(params: {
  currentUserUid?: string;
  contacts: Array<{
    id: string;
    name: string;
    unread?: number;
    lastMessageText: string;
    lastMessageTime: string;
    updatedAtMs: number;
  }>;
  friendRequests: Array<{
    id: string;
    fromUid: string;
    fromLumenId: string;
    fromName: string;
    toUid: string;
    toLumenId: string;
    toName: string;
    status: "pending" | "accepted" | "declined";
    createdAtMs: number;
  }>;
  announcements: AppAnnouncement[];
  readAnnouncementIds: string[];
  readNotificationIds: string[];
  customNotifications: AppNotification[];
}): AppNotification[] {
  const readNotifSet = new Set(params.readNotificationIds);
  const readAnnSet = new Set(params.readAnnouncementIds);
  const byId = new Map<string, AppNotification>();

  for (const custom of params.customNotifications) {
    byId.set(custom.id, {
      ...custom,
      read: custom.read || readNotifSet.has(custom.id),
    });
  }

  for (const c of params.contacts) {
    const hasUnread = (c.unread ?? 0) > 0;
    const hasRecentMsg = Boolean(c.lastMessageText && c.lastMessageText.trim().length > 0);
    if (hasUnread || hasRecentMsg) {
      const notifId = `notif_conv_${c.id}_${c.updatedAtMs}`;
      const isRead = !hasUnread || readNotifSet.has(notifId);
      byId.set(notifId, {
        id: notifId,
        kind: "message",
        title: hasUnread
          ? `${c.name} (${c.unread} unread)`
          : `Message in ${c.name}`,
        body: c.lastMessageText || "Sent a message",
        time: c.lastMessageTime || "Recent",
        createdAtMs: c.updatedAtMs,
        read: isRead,
        conversationId: c.id,
        senderName: c.name,
      });
    }
  }

  for (const req of params.friendRequests) {
    const isIncoming =
      params.currentUserUid &&
      req.toUid === params.currentUserUid &&
      req.fromUid !== params.currentUserUid;
    const notifId = `notif_freq_${req.id}_${req.status}`;
    if (req.status === "pending") {
      byId.set(notifId, {
        id: notifId,
        kind: "friend_request",
        title: isIncoming
          ? `Friend request from ${req.fromName}`
          : `Friend request sent to ${req.toName}`,
        body: isIncoming
          ? `User ID ${req.fromLumenId} wants to connect with you.`
          : `Connected with User ID ${req.toLumenId}.`,
        time: "Recent",
        createdAtMs: req.createdAtMs,
        read: readNotifSet.has(notifId),
        friendRequestId: req.id,
        senderName: isIncoming ? req.fromName : req.toName,
        peerLumenId: isIncoming ? req.fromLumenId : req.toLumenId,
      });
    } else if (req.status === "accepted") {
      byId.set(notifId, {
        id: notifId,
        kind: "friend_request",
        title: `Connected with ${isIncoming ? req.fromName : req.toName}`,
        body: `Friend connection active (${isIncoming ? req.fromLumenId : req.toLumenId}).`,
        time: "Accepted",
        createdAtMs: req.createdAtMs,
        read: true,
        friendRequestId: req.id,
        senderName: isIncoming ? req.fromName : req.toName,
        peerLumenId: isIncoming ? req.fromLumenId : req.toLumenId,
      });
    }
  }

  for (const ann of params.announcements.slice(0, 3)) {
    const notifId = `notif_ann_${ann.id}`;
    byId.set(notifId, {
      id: notifId,
      kind: "announcement",
      title: `Announcement · ${ann.title}`,
      body: ann.summary,
      time: ann.date,
      createdAtMs: ann.createdAtMs,
      read: readAnnSet.has(ann.id) || readNotifSet.has(notifId),
      announcementId: ann.id,
      senderName: ann.author,
    });
  }

  return Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

let notifAudioCtx: AudioContext | null = null;

export function playNotificationChime(prefs: NotificationPrefs) {
  if (!prefs.soundEnabled || prefs.muteAll) return;
  try {
    if (typeof window === "undefined") return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!notifAudioCtx || notifAudioCtx.state === "closed") {
      notifAudioCtx = new AudioCtx();
    }
    const ctx = notifAudioCtx;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "triangle";

    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.14); // E5

    osc2.frequency.setValueAtTime(659.25, now + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(783.99, now + 0.24); // G5

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.06);
    osc1.stop(now + 0.28);
    osc2.stop(now + 0.3);
  } catch {
    // Ignore audio errors if blocked by browser autoplay policy
  }
}
