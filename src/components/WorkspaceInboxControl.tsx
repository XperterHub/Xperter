import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  FolderLock,
  Inbox,
  Megaphone,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  playSettingsLiquidSound,
  triggerSettingsHaptic,
} from "@/components/SettingsControl";
import { useAuthState } from "@/lib/auth";
import { createConversationBetweenUsers } from "@/lib/conversations";
import { db, normalizeLumenId, sanitizeId } from "@/lib/firebase";
import {
  buildAnnouncementItem,
  countUnreadAnnouncements,
  countUnreadNotifications,
  DEFAULT_NOTIFICATION_PREFS,
  INITIAL_APP_ANNOUNCEMENTS,
  playNotificationChime,
  synthesizeWorkspaceNotifications,
  type AnnouncementCategory,
  type AppAnnouncement,
  type AppNotification,
  type NotificationPrefs,
} from "@/lib/notifications";
import { formatVaultFolderName } from "@/lib/username-id";

export function InboxAnimatedIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      {open ? (
        <g
          className="origin-center transition-transform duration-300"
          style={{ transformBox: "fill-box" }}
        >
          <path
            d="M6.5 6.5L17.5 17.5"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <path
            d="M17.5 6.5L6.5 17.5"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g className="transition-transform duration-500">
          {/* Tray body */}
          <path
            d="M4 13.2V17.2C4 18.4 4.98 19.4 6.2 19.4H17.8C19.02 19.4 20 18.4 20 17.2V13.2L17.4 6.4C17.1 5.65 16.38 5.15 15.56 5.15H8.44C7.62 5.15 6.9 5.65 6.6 6.4L4 13.2Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Tray lip */}
          <path
            d="M4.2 13.3H8.8L10.1 15.2H13.9L15.2 13.3H19.8"
            stroke="currentColor"
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity="0.72"
          />
          {/* Floating notification dot that animates on group hover */}
          <circle
            cx="12"
            cy="9.2"
            r="1.85"
            fill="currentColor"
            className="transition-transform duration-500 ease-out group-hover:-translate-y-[2.5px] group-hover:scale-110"
          />
        </g>
      )}
    </svg>
  );
}

interface FriendReqRecord {
  id: string;
  fromUid: string;
  fromLumenId: string;
  fromName: string;
  toUid: string;
  toLumenId: string;
  toName: string;
  status: "pending" | "accepted" | "declined";
  createdAtMs: number;
}

interface ConvSummary {
  id: string;
  name: string;
  unread?: number;
  lastMessageText: string;
  lastMessageTime: string;
  updatedAtMs: number;
}

const READ_ANN_KEY = "lumen.inbox.readAnnouncements";
const READ_NOTIF_KEY = "lumen.inbox.readNotifications";
const CUSTOM_ANN_KEY = "lumen.inbox.customAnnouncements";
const LOCAL_FREQ_KEY = "lumen.inbox.localFriendRequests";
const NOTIF_PREFS_KEY = "lumen.inbox.prefs";

function readStringArray(key: string, fallback: string[] = []): string[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

export function WorkspaceInboxControl({
  onRequestCloseSidebar,
}: {
  onRequestCloseSidebar?: () => void;
}) {
  const nav = useNavigate();
  const { user } = useAuthState();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "all" | "announcements" | "requests" | "messages" | "info"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [friendIdInput, setFriendIdInput] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState<AnnouncementCategory>("update");

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [announcements, setAnnouncements] = useState<AppAnnouncement[]>(
    INITIAL_APP_ANNOUNCEMENTS,
  );
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>([
    "ann_voice_polls",
    "ann_security_vault",
  ]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [cloudFriendRequests, setCloudFriendRequests] = useState<FriendReqRecord[]>([]);
  const [localFriendRequests, setLocalFriendRequests] = useState<FriendReqRecord[]>([]);

  useEffect(() => {
    try {
      const rawPrefs = window.localStorage.getItem(NOTIF_PREFS_KEY);
      if (rawPrefs) {
        setPrefs({
          ...DEFAULT_NOTIFICATION_PREFS,
          ...(JSON.parse(rawPrefs) as Partial<NotificationPrefs>),
        });
      }
      const rawAnn = window.localStorage.getItem(CUSTOM_ANN_KEY);
      if (rawAnn) {
        const custom = JSON.parse(rawAnn) as AppAnnouncement[];
        if (Array.isArray(custom)) {
          setAnnouncements([...custom, ...INITIAL_APP_ANNOUNCEMENTS]);
        }
      }
      setReadAnnouncementIds(
        readStringArray(READ_ANN_KEY, ["ann_voice_polls", "ann_security_vault"]),
      );
      setReadNotificationIds(readStringArray(READ_NOTIF_KEY, []));
      const rawFreq = window.localStorage.getItem(LOCAL_FREQ_KEY);
      if (rawFreq) {
        const parsed = JSON.parse(rawFreq);
        if (Array.isArray(parsed)) {
          setLocalFriendRequests(parsed);
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }, []);

  const [cloudConversations, setCloudConversations] = useState<ConvSummary[]>([]);

  // Subscribe to Firestore friendRequests & conversations when cloud-authenticated
  useEffect(() => {
    if (!user?.isCloudUser || !user.uid) {
      setCloudFriendRequests([]);
      setCloudConversations([]);
      return;
    }

    const freqToQuery = query(
      collection(db, "friendRequests"),
      where("toUid", "==", user.uid),
    );
    const freqFromQuery = query(
      collection(db, "friendRequests"),
      where("fromUid", "==", user.uid),
    );

    const byId = new Map<string, FriendReqRecord>();
    const syncFreq = () => {
      setCloudFriendRequests(
        Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs),
      );
    };

    const unsubTo = onSnapshot(
      freqToQuery,
      (snap) => {
        for (const d of snap.docs) {
          const data = d.data();
          const ts = data.createdAt as Timestamp | undefined;
          byId.set(d.id, {
            id: d.id,
            fromUid: String(data.fromUid ?? ""),
            fromLumenId: String(data.fromLumenId ?? ""),
            fromName: String(data.fromName ?? "User"),
            toUid: String(data.toUid ?? ""),
            toLumenId: String(data.toLumenId ?? ""),
            toName: String(data.toName ?? "User"),
            status:
              data.status === "accepted" || data.status === "declined"
                ? data.status
                : "pending",
            createdAtMs: ts ? ts.toMillis() : Date.now(),
          });
        }
        syncFreq();
      },
      () => {},
    );

    const unsubFrom = onSnapshot(
      freqFromQuery,
      (snap) => {
        for (const d of snap.docs) {
          const data = d.data();
          const ts = data.createdAt as Timestamp | undefined;
          byId.set(d.id, {
            id: d.id,
            fromUid: String(data.fromUid ?? ""),
            fromLumenId: String(data.fromLumenId ?? ""),
            fromName: String(data.fromName ?? "User"),
            toUid: String(data.toUid ?? ""),
            toLumenId: String(data.toLumenId ?? ""),
            toName: String(data.toName ?? "User"),
            status:
              data.status === "accepted" || data.status === "declined"
                ? data.status
                : "pending",
            createdAtMs: ts ? ts.toMillis() : Date.now(),
          });
        }
        syncFreq();
      },
      () => {},
    );

    const convQuery = query(
      collection(db, "conversations"),
      where("participantIds", "array-contains", user.uid),
    );
    const unsubConv = onSnapshot(
      convQuery,
      (snap) => {
        const items: ConvSummary[] = snap.docs.map((d) => {
          const data = d.data();
          const ts = data.updatedAt as Timestamp | undefined;
          return {
            id: d.id,
            name: String(data.name ?? "Conversation"),
            unread: typeof data.unread === "number" ? data.unread : 0,
            lastMessageText: String(data.lastMessageText ?? ""),
            lastMessageTime: String(data.lastMessageTime ?? "Recent"),
            updatedAtMs: ts ? ts.toMillis() : Date.now(),
          };
        });
        setCloudConversations(items);
      },
      () => {},
    );

    return () => {
      unsubTo();
      unsubFrom();
      unsubConv();
    };
  }, [user?.isCloudUser, user?.uid]);

  const allFriendRequests = useMemo(() => {
    const map = new Map<string, FriendReqRecord>();
    for (const r of localFriendRequests) map.set(r.id, r);
    for (const r of cloudFriendRequests) map.set(r.id, r);
    return Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [localFriendRequests, cloudFriendRequests]);

  const effectiveContacts: ConvSummary[] = useMemo(() => {
    if (cloudConversations.length > 0) return cloudConversations;
    return [
      {
        id: "aria",
        name: "Aria Vance",
        unread: 2,
        lastMessageText: "Shared the updated design specs in the thread.",
        lastMessageTime: "10:24 AM",
        updatedAtMs: 1761265000000,
      },
      {
        id: "core_team",
        name: "Lumen Core Studio",
        unread: 0,
        lastMessageText: "All unique User IDs are active for friend requests.",
        lastMessageTime: "09:15 AM",
        updatedAtMs: 1761262000000,
      },
    ];
  }, [cloudConversations]);

  const systemInfoNotifications: AppNotification[] = useMemo(() => {
    const activeId = user?.lumenId || "lumen_user";
    const folderName = formatVaultFolderName(activeId);
    return [
      {
        id: "sys_vault_drive_folder",
        kind: "system",
        title: `Google Drive Vault · ${folderName}`,
        body: `Your personal documents in Profile are automatically organized in Google Drive folder "${folderName}" with standardized filenames (${activeId}_aadharcard, ${activeId}_voterd, etc.).`,
        time: "Active",
        createdAtMs: 1761261000000,
        read: readNotificationIds.includes("sys_vault_drive_folder"),
      },
      {
        id: "sys_unique_userid_privacy",
        kind: "system",
        title: `Privacy Shield · Unique ID (${activeId})`,
        body: `Others can search and send you friend requests using "${activeId}" without ever seeing your phone number or private documents.`,
        time: "Verified",
        createdAtMs: 1761259000000,
        read: readNotificationIds.includes("sys_unique_userid_privacy"),
      },
    ];
  }, [user?.lumenId, readNotificationIds]);

  const synthesizedNotifications = useMemo(() => {
    return synthesizeWorkspaceNotifications({
      currentUserUid: user?.uid || "usr_me",
      contacts: effectiveContacts,
      friendRequests: allFriendRequests,
      announcements,
      readAnnouncementIds,
      readNotificationIds,
      customNotifications: systemInfoNotifications,
    });
  }, [
    user?.uid,
    effectiveContacts,
    allFriendRequests,
    announcements,
    readAnnouncementIds,
    readNotificationIds,
    systemInfoNotifications,
  ]);

  const unreadNotifCount = countUnreadNotifications(synthesizedNotifications);
  const unreadAnnCount = countUnreadAnnouncements(announcements, readAnnouncementIds);
  const pendingReqCount = allFriendRequests.filter((r) => r.status === "pending").length;
  const totalBadgeCount = unreadNotifCount;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen((prev) => {
      if (prev !== nextOpen) {
        triggerSettingsHaptic(nextOpen);
        playSettingsLiquidSound(nextOpen);
      }
      return nextOpen;
    });
  };

  const updatePrefs = (next: NotificationPrefs) => {
    setPrefs(next);
    writeJson(NOTIF_PREFS_KEY, next);
  };

  const markNotifRead = (id: string) => {
    setReadNotificationIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      writeJson(READ_NOTIF_KEY, next);
      return next;
    });
  };

  const markAllRead = () => {
    const allNotifIds = synthesizedNotifications.map((n) => n.id);
    const allAnnIds = announcements.map((a) => a.id);
    setReadNotificationIds(allNotifIds);
    setReadAnnouncementIds(allAnnIds);
    writeJson(READ_NOTIF_KEY, allNotifIds);
    writeJson(READ_ANN_KEY, allAnnIds);
    toast.success("All inbox items marked as read");
  };

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawTarget = friendIdInput.trim();
    if (!rawTarget) return;
    const targetLumenId = normalizeLumenId(rawTarget);
    if (targetLumenId.length < 4) {
      toast.error("Enter a valid Unique User ID (at least 4 characters)");
      return;
    }
    if (user?.lumenId && targetLumenId.toLowerCase() === user.lumenId.toLowerCase()) {
      toast.error("That is your own Unique User ID");
      return;
    }

    const reqId = sanitizeId(`freq_${user?.uid || "local"}_${targetLumenId}_${Date.now()}`);
    const newReq: FriendReqRecord = {
      id: reqId,
      fromUid: user?.uid || "usr_me",
      fromLumenId: user?.lumenId || "lumen_user",
      fromName: user?.name || "Lumen User",
      toUid: sanitizeId(`usr_${targetLumenId.toLowerCase()}`),
      toLumenId: targetLumenId,
      toName: `User ${targetLumenId}`,
      status: "pending",
      createdAtMs: Date.now(),
    };

    if (user?.isCloudUser) {
      try {
        await setDoc(doc(db, "friendRequests", reqId), {
          fromUid: newReq.fromUid,
          fromLumenId: newReq.fromLumenId,
          fromName: newReq.fromName,
          toUid: newReq.toUid,
          toLumenId: newReq.toLumenId,
          toName: newReq.toName,
          status: "pending",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Fallback to local request record if offline
      }
    }

    const nextLocal = [newReq, ...localFriendRequests];
    setLocalFriendRequests(nextLocal);
    writeJson(LOCAL_FREQ_KEY, nextLocal);
    setFriendIdInput("");
    playNotificationChime(prefs);
    toast.success(`Friend request sent to Unique ID ${targetLumenId}`);
  };

  const handleAcceptRequest = async (req: FriendReqRecord) => {
    const nextLocal = localFriendRequests.map((r) =>
      r.id === req.id ? { ...r, status: "accepted" as const } : r,
    );
    setLocalFriendRequests(nextLocal);
    writeJson(LOCAL_FREQ_KEY, nextLocal);

    if (user?.isCloudUser) {
      try {
        await updateDoc(doc(db, "friendRequests", req.id), {
          status: "accepted",
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore if local sample request
      }
    }

    if (user) {
      try {
        await createConversationBetweenUsers(user, {
          uid: req.fromUid === user.uid ? req.toUid : req.fromUid,
          lumenId: req.fromUid === user.uid ? req.toLumenId : req.fromLumenId,
          displayName: req.fromUid === user.uid ? req.toName : req.fromName,
        });
      } catch {
        // Ignore conversation creation error in demo mode
      }
    }

    toast.success(`Accepted friend request from ${req.fromName}`);
    handleOpenChange(false);
    onRequestCloseSidebar?.();
    nav({ to: "/app/messages" });
  };

  const handleDismissRequest = async (req: FriendReqRecord) => {
    const nextLocal = localFriendRequests.filter((r) => r.id !== req.id);
    setLocalFriendRequests(nextLocal);
    writeJson(LOCAL_FREQ_KEY, nextLocal);

    if (user?.isCloudUser) {
      try {
        await deleteDoc(doc(db, "friendRequests", req.id));
      } catch {
        // Ignore if local sample
      }
    }
    toast.success("Friend request dismissed");
  };

  const handlePublishAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSummary.trim()) return;
    const item = buildAnnouncementItem({
      title: newTitle,
      summary: newSummary,
      body: newBody || newSummary,
      category: newCategory,
      version: "v2.5",
      author: user?.name || "Workspace Admin",
      pinned: true,
    });
    const next = [item, ...announcements];
    setAnnouncements(next);
    const customOnly = next.filter(
      (a) => !INITIAL_APP_ANNOUNCEMENTS.some((init) => init.id === a.id),
    );
    writeJson(CUSTOM_ANN_KEY, customOnly);
    setNewTitle("");
    setNewSummary("");
    setNewBody("");
    setComposeOpen(false);
    toast.success("Announcement published to workspace inbox");
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return synthesizedNotifications.filter((item) => {
      if (activeTab === "announcements" && item.kind !== "announcement") return false;
      if (activeTab === "requests" && item.kind !== "friend_request") return false;
      if (activeTab === "messages" && item.kind !== "message") return false;
      if (activeTab === "info" && item.kind !== "system") return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.body.toLowerCase().includes(q) ||
        (item.peerLumenId && item.peerLumenId.toLowerCase().includes(q))
      );
    });
  }, [synthesizedNotifications, activeTab, searchQuery]);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          data-testid="sidebar-inbox-trigger"
          aria-label={open ? "Close inbox" : "Open inbox"}
          title="Workspace Inbox — Announcements, Friend Requests & Notifications"
          className="group glass settings-trigger-btn relative z-[60] flex h-11 w-11 items-center justify-center rounded-full text-foreground/90 hover:text-foreground"
        >
          <InboxAnimatedIcon open={open} />
          {!prefs.muteAll && totalBadgeCount > 0 && (
            <span
              data-testid="sidebar-inbox-badge"
              className="btn-ink absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums shadow-xs"
            >
              {totalBadgeCount > 99 ? "99+" : totalBadgeCount}
            </span>
          )}
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[75] animate-in fade-in duration-200" />
        <Dialog.Content
          data-testid="workspace-inbox-modal"
          aria-describedby="workspace-inbox-desc"
          className="settings-popover glass fixed left-1/2 top-1/2 z-[80] flex max-h-[82dvh] w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[2rem] p-5 text-foreground outline-none sm:p-6"
        >
          {/* Modal Header */}
          <div className="flex items-start justify-between gap-3 border-b border-glass-edge pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="bg-pearl flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-glass-edge">
                <Inbox className="h-5 w-5 text-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Dialog.Title className="text-lg font-medium leading-tight sm:text-xl">
                    Workspace Inbox
                  </Dialog.Title>
                  <span className="rounded-full bg-glass px-2.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground tabular-nums">
                    {unreadNotifCount} unread
                  </span>
                </div>
                <Dialog.Description
                  id="workspace-inbox-desc"
                  className="mt-0.5 truncate text-xs text-muted-foreground"
                >
                  Announcements, friend requests by Unique ID, message alerts &amp; vault notices
                </Dialog.Description>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => updatePrefs({ ...prefs, soundEnabled: !prefs.soundEnabled })}
                aria-label={prefs.soundEnabled ? "Mute inbox sound" : "Enable inbox sound"}
                title={prefs.soundEnabled ? "Sound chimes active" : "Sound chimes muted"}
                className={`settings-trigger-btn flex h-8.5 w-8.5 items-center justify-center rounded-full transition-colors ${
                  prefs.soundEnabled
                    ? "bg-glass-strong text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {prefs.soundEnabled ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() => updatePrefs({ ...prefs, muteAll: !prefs.muteAll })}
                aria-label={prefs.muteAll ? "Disable Do Not Disturb" : "Enable Do Not Disturb"}
                title={prefs.muteAll ? "Do Not Disturb on" : "Do Not Disturb off"}
                className={`settings-trigger-btn flex h-8.5 w-8.5 items-center justify-center rounded-full transition-colors ${
                  prefs.muteAll
                    ? "bg-destructive/15 text-destructive"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {prefs.muteAll ? (
                  <BellOff className="h-4 w-4" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
              </button>

              {unreadNotifCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  title="Mark all inbox items as read"
                  className="glass-pill liquid-press hidden h-8.5 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground sm:inline-flex"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Mark all read</span>
                </button>
              )}

              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close inbox"
                  title="Close inbox"
                  className="settings-trigger-btn h-8.5 w-8.5 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          {/* Filter Tabs & Search */}
          <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 overflow-x-auto rounded-full bg-glass p-1 text-xs">
              {(
                [
                  ["all", "All", unreadNotifCount],
                  ["announcements", "Announcements", unreadAnnCount],
                  ["requests", "Friend Requests", pendingReqCount],
                  ["messages", "Messages", 0],
                  ["info", "Info", 0],
                ] as const
              ).map(([key, label, badge]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  data-testid={`inbox-tab-${key}`}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-all ${
                    activeTab === key
                      ? "btn-ink shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{label}</span>
                  {badge > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] tabular-nums ${
                        activeTab === key
                          ? "bg-background/20 text-primary-foreground"
                          : "bg-glass-strong text-foreground"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="glass-input flex h-9 items-center gap-2 rounded-full px-3.5 sm:w-56">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search inbox…"
                aria-label="Search inbox"
                className="w-full bg-transparent text-xs outline-none placeholder:text-faint"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear inbox search"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Friend Request by Unique User ID bar (shown in All or Friend Requests tab) */}
          {(activeTab === "all" || activeTab === "requests") && (
            <form
              onSubmit={handleSendFriendRequest}
              className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-glass-edge bg-glass/50 p-2.5"
            >
              <div className="flex min-w-[200px] flex-1 items-center gap-2 px-2">
                <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={friendIdInput}
                  onChange={(e) => setFriendIdInput(e.target.value)}
                  placeholder="Add friend by Unique User ID (e.g. arjun_mehta or LMN-7K4P9X)…"
                  aria-label="Add friend by Unique User ID"
                  className="w-full bg-transparent font-mono text-xs outline-none placeholder:font-sans placeholder:text-faint"
                />
              </div>
              <button
                type="submit"
                className="btn-ink liquid-press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium"
              >
                Send Friend Request
              </button>
            </form>
          )}

          {/* New Announcement composer toggle when on Announcements tab */}
          {activeTab === "announcements" && (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-glass-edge bg-glass/45 px-3.5 py-2">
              <span className="text-xs text-muted-foreground">
                Broadcast a release note or security update to all workspace members
              </span>
              <button
                type="button"
                onClick={() => setComposeOpen((v) => !v)}
                className="btn-ink liquid-press inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{composeOpen ? "Cancel" : "New Announcement"}</span>
              </button>
            </div>
          )}

          {composeOpen && activeTab === "announcements" && (
            <form
              onSubmit={handlePublishAnnouncement}
              className="mt-2.5 space-y-2 rounded-2xl border border-glass-edge bg-glass/65 p-3.5"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Announcement title…"
                  required
                  className="glass-input rounded-xl px-3 py-2 text-xs outline-none sm:col-span-2"
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as AnnouncementCategory)}
                  className="glass-input rounded-xl px-3 py-2 text-xs text-foreground outline-none"
                >
                  <option value="update">Platform Update</option>
                  <option value="feature">New Feature</option>
                  <option value="security">Security Notice</option>
                </select>
              </div>
              <input
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                placeholder="Brief summary…"
                required
                className="glass-input w-full rounded-xl px-3 py-2 text-xs outline-none"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="btn-ink liquid-press rounded-full px-4 py-1.5 text-xs font-medium"
                >
                  Publish to Inbox
                </button>
              </div>
            </form>
          )}

          {/* Unified Inbox Feed */}
          <div className="glass-scroll mt-3.5 min-h-[240px] flex-1 space-y-2.5 overflow-y-auto pr-1">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground/60" />
                <p className="mt-2.5 text-sm font-medium text-foreground/85">
                  No items in this inbox view
                </p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Announcements, friend requests by Unique ID, message notifications, and vault updates appear here.
                </p>
              </div>
            ) : (
              filteredItems.map((item) => {
                const matchingReq = item.friendRequestId
                  ? allFriendRequests.find((r) => r.id === item.friendRequestId)
                  : undefined;

                return (
                  <div
                    key={item.id}
                    className={`group rounded-2xl border border-glass-edge p-3.5 transition-all ${
                      item.read
                        ? "bg-glass/45 hover:bg-glass"
                        : "bg-glass-strong ring-1 ring-foreground/15"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/10 text-foreground">
                        {item.kind === "friend_request" ? (
                          <UserPlus className="h-4 w-4" />
                        ) : item.kind === "announcement" ? (
                          <Megaphone className="h-4 w-4" />
                        ) : item.kind === "system" ? (
                          <FolderLock className="h-4 w-4" />
                        ) : (
                          <MessageSquare className="h-4 w-4" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground sm:text-sm">
                              {item.title}
                            </span>
                            {item.peerLumenId && (
                              <span className="rounded-full bg-glass px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {item.peerLumenId}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                              {item.time}
                            </span>
                            {!item.read && (
                              <span className="btn-ink rounded-full px-2 py-0.5 text-[10px] font-medium">
                                New
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {item.body}
                        </p>

                        {/* Action bar per item type */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          {item.kind === "friend_request" &&
                            matchingReq &&
                            matchingReq.status === "pending" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleAcceptRequest(matchingReq)}
                                  className="btn-ink liquid-press inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium"
                                >
                                  <Check className="h-3 w-3" />
                                  <span>Accept &amp; Chat</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDismissRequest(matchingReq)}
                                  className="glass-pill liquid-press rounded-full px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                                >
                                  Decline
                                </button>
                              </>
                            )}

                          {item.kind === "message" && (
                            <button
                              type="button"
                              onClick={() => {
                                markNotifRead(item.id);
                                handleOpenChange(false);
                                onRequestCloseSidebar?.();
                                nav({ to: "/app/messages" });
                              }}
                              className="glass-pill liquid-press inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium text-foreground hover:bg-glass-strong"
                            >
                              <MessageSquare className="h-3 w-3" />
                              <span>Open Conversation</span>
                            </button>
                          )}

                          {item.kind === "system" && (
                            <button
                              type="button"
                              onClick={() => {
                                markNotifRead(item.id);
                                handleOpenChange(false);
                                onRequestCloseSidebar?.();
                                nav({ to: "/app/page-2" });
                              }}
                              className="glass-pill liquid-press inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium text-foreground hover:bg-glass-strong"
                            >
                              <ShieldCheck className="h-3 w-3" />
                              <span>Open Profile &amp; Vault</span>
                            </button>
                          )}

                          {!item.read && (
                            <button
                              type="button"
                              onClick={() => {
                                markNotifRead(item.id);
                                if (item.announcementId) {
                                  const nextAnn = [...readAnnouncementIds, item.announcementId];
                                  setReadAnnouncementIds(nextAnn);
                                  writeJson(READ_ANN_KEY, nextAnn);
                                }
                              }}
                              className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer status bar */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-glass-edge pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-foreground" />
              <span>
                Your Unique ID:{" "}
                <strong className="font-mono text-foreground">
                  {user?.lumenId || "lumen_user"}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  handleOpenChange(false);
                  onRequestCloseSidebar?.();
                  nav({ to: "/app/page-2" });
                }}
                className="font-medium text-foreground hover:underline"
              >
                Manage Profile &amp; Vault →
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
