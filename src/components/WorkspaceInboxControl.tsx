import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  CheckCheck,
  FolderLock,
  Inbox,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  query,
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
import { db } from "@/lib/firebase";
import {
  countUnreadAnnouncements,
  DEFAULT_NOTIFICATION_PREFS,
  INITIAL_APP_ANNOUNCEMENTS,
  playNotificationChime,
  synthesizeWorkspaceNotifications,
  type AppAnnouncement,
  type AppNotification,
  type NotificationPrefs,
  READ_ANN_KEY,
  READ_NOTIF_KEY,
  CUSTOM_ANN_KEY,
  NOTIF_PREFS_KEY,
} from "@/lib/notifications";

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

interface ConvSummary {
  id: string;
  name: string;
  unread?: number;
  lastMessageText: string;
  lastMessageTime: string;
  updatedAtMs: number;
}

function readStringArray(key: string, fallback: string[] = []): string[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function WorkspaceInboxControl({
  onRequestCloseSidebar,
}: {
  onRequestCloseSidebar?: () => void;
}) {
  const nav = useNavigate();
  const { user } = useAuthState();
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<AppAnnouncement[]>(INITIAL_APP_ANNOUNCEMENTS);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  // Load local state & preferences
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawPrefs = window.localStorage.getItem(NOTIF_PREFS_KEY);
      if (rawPrefs) {
        setPrefs({ ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(rawPrefs) });
      }
      const rawAnn = window.localStorage.getItem(CUSTOM_ANN_KEY);
      if (rawAnn) {
        const custom = JSON.parse(rawAnn) as AppAnnouncement[];
        if (Array.isArray(custom)) {
          setAnnouncements([...custom, ...INITIAL_APP_ANNOUNCEMENTS]);
        }
      }
      setReadAnnouncementIds(
        readStringArray(
          READ_ANN_KEY,
          INITIAL_APP_ANNOUNCEMENTS.map((a) => a.id),
        ),
      );
      setReadNotificationIds(readStringArray(READ_NOTIF_KEY, []));
    } catch {}
  }, []);

  const [cloudConversations, setCloudConversations] = useState<ConvSummary[]>([]);

  // Subscribe to Firestore conversations when cloud-authenticated
  useEffect(() => {
    if (!user?.isCloudUser || !user.uid) {
      setCloudConversations([]);
      return;
    }

    const convQuery = query(
      collection(db, "conversations"),
      where("participantIds", "array-contains", user.uid),
    );

    const unsubConv = onSnapshot(
      convQuery,
      (snap) => {
        const items: ConvSummary[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          const ts = data.updatedAt as Timestamp | undefined;
          const otherName =
            Array.isArray(data.participantNames) && data.participantNames.length > 0
              ? data.participantNames.find((n: string) => n && n !== user.name) || "Chat"
              : "Chat";
          const unreadCount = typeof data.unread === "number" ? data.unread : 0;
          items.push({
            id: d.id,
            name: String(data.name || otherName),
            unread: unreadCount,
            lastMessageText: String(data.lastMessageText || ""),
            lastMessageTime: String(data.lastMessageTime || ""),
            updatedAtMs: ts ? ts.toMillis() : Date.now(),
          });
        }
        setCloudConversations(items.sort((a, b) => b.updatedAtMs - a.updatedAtMs));
      },
      () => {},
    );

    return () => {
      unsubConv();
    };
  }, [user]);

  const activeConversations = cloudConversations;

  const synthesizedNotifications = useMemo(() => {
    return synthesizeWorkspaceNotifications({
      currentUserUid: user?.uid,
      contacts: activeConversations,
      friendRequests: [],
      announcements,
      readAnnouncementIds,
      readNotificationIds,
      customNotifications: [],
    });
  }, [
    user?.uid,
    activeConversations,
    announcements,
    readAnnouncementIds,
    readNotificationIds,
  ]);

  // Only display notifications from overall app, no friend request clutter
  const notificationItems = useMemo(() => {
    return synthesizedNotifications.filter((item) => item.kind !== "friend_request");
  }, [synthesizedNotifications]);

  const unreadNotifCount = notificationItems.filter((i) => !i.read).length;
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
    const allNotifIds = notificationItems.map((n) => n.id);
    const allAnnIds = announcements.map((a) => a.id);
    setReadNotificationIds(allNotifIds);
    setReadAnnouncementIds(allAnnIds);
    writeJson(READ_NOTIF_KEY, allNotifIds);
    writeJson(READ_ANN_KEY, allAnnIds);
    toast.success("All notifications marked as read");
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          data-testid="sidebar-inbox-trigger"
          aria-label={open ? "Close inbox" : "Open inbox"}
          title="Workspace Inbox — Announcements & Notifications"
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
          className="settings-popover glass fixed left-1/2 top-1/2 z-[80] flex max-h-[82dvh] w-[min(92vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[2rem] p-5 text-foreground outline-none sm:p-6"
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
                  Latest announcements and updates across your workspace
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
                  title="Mark all notifications as read"
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

          {/* Clean Notifications Feed */}
          <div className="glass-scroll mt-4 min-h-[260px] flex-1 space-y-2.5 overflow-y-auto pr-1">
            {notificationItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Inbox className="h-9 w-9 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground/85">
                  All caught up!
                </p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  New announcements, workspace updates, and message notifications will appear here.
                </p>
              </div>
            ) : (
              notificationItems.map((item) => (
                <div
                  key={item.id}
                  className={`group rounded-2xl border border-glass-edge p-3.5 transition-all ${
                    item.read
                      ? "bg-glass/40 hover:bg-glass/70"
                      : "bg-glass-strong ring-1 ring-foreground/15 shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/10 text-foreground">
                      {item.kind === "announcement" ? (
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

                      {/* Action buttons */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
              ))
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
