import { useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  CheckCheck,
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GlassCard } from "@/components/GlassCard";
import {
  playSettingsLiquidSound,
  triggerSettingsHaptic,
} from "@/components/SettingsControl";
import {
  countUnreadAnnouncements,
  countUnreadNotifications,
  filterAnnouncements,
  filterNotifications,
  type AnnouncementCategory,
  type AppAnnouncement,
  type AppNotification,
  type NotificationPrefs,
} from "@/lib/notifications";

interface HeaderControlsProps {
  notifications: AppNotification[];
  announcements: AppAnnouncement[];
  readAnnouncementIds: string[];
  prefs: NotificationPrefs;
  inboxOpen: boolean;
  onToggleInbox: () => void;
  onUpdatePrefs: (next: NotificationPrefs) => void;
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  onSelectConversation: (conversationId: string) => void;
  onAcceptFriendRequest?: (friendRequestId: string) => void;
  onRemoveFriendRequest?: (friendRequestId: string) => void;
  onOpenAnnouncement: (announcementId?: string) => void;
}

export function MessagesHeaderInboxControls({
  notifications,
  announcements,
  readAnnouncementIds,
  prefs,
  inboxOpen,
  onToggleInbox,
  onUpdatePrefs,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onSelectConversation,
  onAcceptFriendRequest,
  onRemoveFriendRequest,
  onOpenAnnouncement,
}: HeaderControlsProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState<"all" | "unread" | "requests" | "announcements">("all");

  const unreadNotifCount = countUnreadNotifications(notifications);
  const unreadAnnCount = countUnreadAnnouncements(announcements, readAnnouncementIds);
  const visibleNotifications = filterNotifications(notifications, notifTab);

  const handleNotifOpenChange = (nextOpen: boolean) => {
    setNotifOpen((prev) => {
      if (prev !== nextOpen) {
        triggerSettingsHaptic(nextOpen);
        playSettingsLiquidSound(nextOpen);
      }
      return nextOpen;
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {/* Overall App Announcements Inbox Trigger Button */}
      <button
        type="button"
        onClick={() => {
          triggerSettingsHaptic(!inboxOpen);
          playSettingsLiquidSound(!inboxOpen);
          onToggleInbox();
        }}
        aria-label="Open app announcements inbox"
        title="App Announcements Inbox"
        data-testid="announcements-inbox-trigger"
        className={`glass-input liquid-press relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors sm:h-10 sm:w-10 ${
          inboxOpen ? "btn-ink" : "text-foreground/90 hover:bg-glass-strong hover:text-foreground"
        }`}
      >
        <Inbox className="h-4 w-4" />
        {unreadAnnCount > 0 && (
          <span
            data-testid="announcements-unread-badge"
            className={`absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums shadow-xs ${
              inboxOpen
                ? "bg-background text-foreground"
                : "btn-ink"
            }`}
          >
            {unreadAnnCount}
          </span>
        )}
      </button>

      {/* Messaging Notifications Popover Button */}
      <Popover open={notifOpen} onOpenChange={handleNotifOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={notifOpen ? "Close notifications" : "Open notifications"}
            title="Notifications"
            data-testid="notifications-bell-trigger"
            className={`glass-input liquid-press relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors sm:h-10 sm:w-10 ${
              notifOpen ? "btn-ink" : "text-foreground/90 hover:bg-glass-strong hover:text-foreground"
            }`}
          >
            {prefs.muteAll ? (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            {!prefs.muteAll && unreadNotifCount > 0 && (
              <span
                data-testid="notifications-unread-badge"
                className="btn-ink absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums shadow-xs"
              >
                {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          aria-labelledby="notifications-popover-title"
          className="settings-popover glass z-[70] w-[19rem] max-w-[calc(100vw-1.5rem)] rounded-[1.75rem] p-4 text-foreground"
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h2 id="notifications-popover-title" className="text-base font-medium leading-none">
                Notifications
              </h2>
              {unreadNotifCount > 0 && (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-glass px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                  {unreadNotifCount} new
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdatePrefs({ ...prefs, soundEnabled: !prefs.soundEnabled })
                }
                aria-label={
                  prefs.soundEnabled ? "Mute notification sound" : "Enable notification sound"
                }
                title={prefs.soundEnabled ? "Sound alerts on" : "Sound alerts muted"}
                className={`flex h-7.5 w-7.5 items-center justify-center rounded-full transition-colors ${
                  prefs.soundEnabled
                    ? "bg-glass-strong text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {prefs.soundEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onUpdatePrefs({ ...prefs, muteAll: !prefs.muteAll })}
                aria-label={prefs.muteAll ? "Disable Do Not Disturb" : "Enable Do Not Disturb"}
                title={prefs.muteAll ? "Do Not Disturb active" : "Do Not Disturb off"}
                className={`flex h-7.5 w-7.5 items-center justify-center rounded-full transition-colors ${
                  prefs.muteAll
                    ? "bg-destructive/15 text-destructive"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {prefs.muteAll ? (
                  <BellOff className="h-3.5 w-3.5" />
                ) : (
                  <Bell className="h-3.5 w-3.5" />
                )}
              </button>

              {unreadNotifCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllNotificationsRead}
                  aria-label="Mark all notifications as read"
                  title="Mark all as read"
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-full bg-glass text-muted-foreground transition-colors hover:bg-glass-strong hover:text-foreground"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => handleNotifOpenChange(false)}
                aria-label="Close notifications"
                title="Close"
                className="flex h-7.5 w-7.5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {prefs.muteAll && (
            <div className="mt-2.5 flex items-center justify-between rounded-xl bg-glass px-3 py-1.5 text-xs text-muted-foreground">
              <span>Do Not Disturb is active</span>
              <button
                type="button"
                onClick={() => onUpdatePrefs({ ...prefs, muteAll: false })}
                className="font-medium text-foreground hover:underline"
              >
                Resume alerts
              </button>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="mt-3 flex items-center gap-1 rounded-full bg-glass p-1 text-xs">
            {(
              [
                ["all", "All"],
                ["unread", "Unread"],
                ["requests", "Requests"],
                ["announcements", "Updates"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setNotifTab(key)}
                className={`flex-1 whitespace-nowrap rounded-full py-1 font-medium transition-all ${
                  notifTab === key
                    ? "btn-ink shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Notifications List */}
          <div className="glass-scroll mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
            {visibleNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Bell className="h-6 w-6 text-muted-foreground/60" />
                <p className="mt-2 text-xs font-medium text-foreground/85">
                  You&apos;re all caught up
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  New messages, friend requests, and app updates appear here.
                </p>
              </div>
            ) : (
              visibleNotifications.map((item) => (
                <div
                  key={item.id}
                  className={`group rounded-2xl p-2.5 text-left transition-colors ${
                    item.read ? "bg-glass/45 hover:bg-glass" : "bg-glass-strong"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground">
                      {item.kind === "friend_request" ? (
                        <UserPlus className="h-3.5 w-3.5" />
                      ) : item.kind === "announcement" ? (
                        <Megaphone className="h-3.5 w-3.5" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => {
                          onMarkNotificationRead(item.id);
                          if (item.conversationId) {
                            onSelectConversation(item.conversationId);
                            handleNotifOpenChange(false);
                          } else if (item.announcementId || item.kind === "announcement") {
                            onOpenAnnouncement(item.announcementId);
                            handleNotifOpenChange(false);
                          }
                        }}
                        className="block w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-foreground">
                            {item.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                            {item.time}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {item.body}
                        </p>
                      </button>

                      {item.kind === "friend_request" &&
                        item.friendRequestId &&
                        !item.read &&
                        onAcceptFriendRequest && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onMarkNotificationRead(item.id);
                                onAcceptFriendRequest(item.friendRequestId!);
                                handleNotifOpenChange(false);
                              }}
                              className="btn-ink liquid-press inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium"
                            >
                              <Check className="h-3 w-3" />
                              <span>Accept &amp; Chat</span>
                            </button>
                            {onRemoveFriendRequest && (
                              <button
                                type="button"
                                onClick={() => {
                                  onMarkNotificationRead(item.id);
                                  onRemoveFriendRequest(item.friendRequestId!);
                                }}
                                className="rounded-full bg-glass px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                Dismiss
                              </button>
                            )}
                          </div>
                        )}
                    </div>

                    {!item.read && (
                      <button
                        type="button"
                        onClick={() => onMarkNotificationRead(item.id)}
                        aria-label={`Mark ${item.title} as read`}
                        title="Mark as read"
                        className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-glass hover:text-foreground"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer shortcut to Overall App Announcements Inbox */}
          <div className="mt-3 border-t border-glass-edge pt-3">
            <button
              type="button"
              onClick={() => {
                handleNotifOpenChange(false);
                onOpenAnnouncement();
              }}
              className="glass-input liquid-press flex w-full items-center justify-between rounded-xl px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-glass-strong"
            >
              <span className="flex items-center gap-2">
                <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Open App Announcements Inbox</span>
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {unreadAnnCount > 0 ? `${unreadAnnCount} new` : "View all"}
              </span>
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function AnnouncementsSidebarBanner({
  announcements,
  readAnnouncementIds,
  active,
  onOpen,
}: {
  announcements: AppAnnouncement[];
  readAnnouncementIds: string[];
  active: boolean;
  onOpen: () => void;
}) {
  const unreadCount = countUnreadAnnouncements(announcements, readAnnouncementIds);
  const latest = announcements[0];

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="sidebar-announcements-item"
      className={`mt-2.5 flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors ${
        active ? "bg-glass-strong ring-1 ring-glass-edge" : "bg-glass/60 hover:bg-glass"
      }`}
    >
      <div className="bg-pearl flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-glass-edge sm:h-11 sm:w-11">
        <Megaphone className="h-4.5 w-4.5 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <span className="truncate text-sm font-medium">App Announcements</span>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {latest?.version ?? "Inbox"}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {latest ? latest.title : "Official workspace updates & releases"}
          </p>
          {unreadCount > 0 ? (
            <span className="btn-ink flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-medium tabular-nums">
              {unreadCount}
            </span>
          ) : (
            <span className="shrink-0 text-[10px] text-muted-foreground">Inbox</span>
          )}
        </div>
      </div>
    </button>
  );
}

interface AnnouncementsInboxViewProps {
  announcements: AppAnnouncement[];
  readAnnouncementIds: string[];
  selectedAnnouncementId?: string | null;
  onBack: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onToggleAcknowledge: (id: string) => void;
  onCreateAnnouncement: (payload: {
    title: string;
    summary: string;
    body: string;
    category: AnnouncementCategory;
    version: string;
    pinned: boolean;
  }) => void;
}

export function AnnouncementsInboxView({
  announcements,
  readAnnouncementIds,
  onBack,
  onMarkRead,
  onMarkAllRead,
  onToggleAcknowledge,
  onCreateAnnouncement,
}: AnnouncementsInboxViewProps) {
  const [category, setCategory] = useState<"all" | AnnouncementCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState<AnnouncementCategory>("update");
  const [newVersion, setNewVersion] = useState("v2.5");
  const [newPinned, setNewPinned] = useState(false);

  const readSet = new Set(readAnnouncementIds);
  const unreadCount = countUnreadAnnouncements(announcements, readAnnouncementIds);
  const filtered = filterAnnouncements(announcements, category, searchQuery);

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSummary.trim()) return;
    onCreateAnnouncement({
      title: newTitle.trim(),
      summary: newSummary.trim(),
      body: newBody.trim() || newSummary.trim(),
      category: newCategory,
      version: newVersion.trim() || "v2.5",
      pinned: newPinned,
    });
    setNewTitle("");
    setNewSummary("");
    setNewBody("");
    setNewPinned(false);
    setComposeOpen(false);
  };

  const categoryLabel = (cat: AnnouncementCategory) => {
    if (cat === "feature") return "New Feature";
    if (cat === "security") return "Security Notice";
    return "Platform Update";
  };

  return (
    <GlassCard
      as="section"
      variant="panel"
      padding="none"
      data-testid="announcements-inbox-view"
      className="frost-panel relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between gap-2 border-b border-glass-edge py-2.5 pl-13 pr-2.5 sm:gap-3 sm:py-3.5 sm:pl-16 sm:pr-5 md:pl-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            aria-label="Back to conversations"
            onClick={onBack}
            className="glass-input flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9 md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="bg-pearl hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-glass-edge sm:flex sm:h-11 sm:w-11">
            <Megaphone className="h-5 w-5 text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-medium leading-tight sm:text-base">
                <span className="sm:hidden">Announcements Inbox</span>
                <span className="hidden sm:inline">App Announcements Inbox</span>
              </h2>
              <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                · {unreadCount} unread
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              Official Xperter releases, workspace updates &amp; security notices
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              aria-label="Mark all announcements as read"
              className="glass-input liquid-press hidden h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-foreground/90 hover:bg-glass-strong hover:text-foreground sm:inline-flex"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark all read</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            aria-label="New announcement"
            data-testid="new-announcement-btn"
            className="btn-ink liquid-press inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium sm:px-4"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="whitespace-nowrap sm:hidden">New</span>
            <span className="hidden whitespace-nowrap sm:inline">New Announcement</span>
          </button>
        </div>
      </header>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-2.5 border-b border-glass-edge bg-glass/40 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-1 overflow-x-auto rounded-full bg-glass p-1 text-xs">
          {(
            [
              ["all", "All"],
              ["update", "Updates"],
              ["feature", "Features"],
              ["security", "Security"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={`whitespace-nowrap rounded-full px-3 py-1 font-medium transition-all ${
                category === key
                  ? "btn-ink shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="glass-input flex h-9 items-center gap-2 rounded-full px-3.5 sm:w-64">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search announcements…"
            aria-label="Search announcements"
            className="w-full bg-transparent text-xs outline-none placeholder:text-faint"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear announcement search"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Announcements Feed */}
      <div className="glass-scroll flex-1 space-y-3 overflow-y-auto px-3.5 py-4 sm:px-6">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-60" />
            <p className="mt-2 text-sm font-medium text-foreground/85">
              No matching announcements
            </p>
            <p className="mt-1 max-w-xs text-xs">
              Try clearing your search filter or publish a new workspace announcement.
            </p>
          </div>
        ) : (
          filtered.map((ann) => {
            const isRead = readSet.has(ann.id);
            return (
              <article
                key={ann.id}
                onClick={() => {
                  if (!isRead) onMarkRead(ann.id);
                }}
                className={`glass-input rounded-3xl p-4 transition-all sm:p-5 ${
                  !isRead ? "ring-1 ring-foreground/25" : "opacity-90"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      {ann.category === "security" ? (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      <span>{categoryLabel(ann.category)}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[11px] tabular-nums">{ann.version}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ann.author}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{ann.date}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isRead ? (
                      <span className="btn-ink rounded-full px-2.5 py-0.5 text-[10px] font-medium">
                        Unread
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Read</span>
                    )}
                  </div>
                </div>

                <h3 className="mt-2 text-base font-medium text-foreground sm:text-lg">
                  {ann.title}
                </h3>
                <p className="mt-1 text-xs font-medium text-foreground/85 sm:text-sm">
                  {ann.summary}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {ann.body}
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-glass-edge pt-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleAcknowledge(ann.id);
                    }}
                    aria-pressed={Boolean(ann.acknowledgedByMe)}
                    className={`liquid-press inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      ann.acknowledgedByMe
                        ? "btn-ink"
                        : "bg-glass text-muted-foreground hover:bg-glass-strong hover:text-foreground"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Acknowledged</span>
                    <span className="tabular-nums">· {ann.acknowledgedCount}</span>
                  </button>

                  {!isRead && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkRead(ann.id);
                      }}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Compose New Announcement Dialog */}
      {composeOpen && (
        <Dialog open onOpenChange={(o) => !o && setComposeOpen(false)}>
          <DialogContent className="glass max-w-md rounded-[2rem] border-0 bg-transparent p-6 text-foreground">
            <DialogTitle className="text-xl font-light">Publish App Announcement</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Broadcast an official update to the overall app announcements inbox.
            </DialogDescription>
            <form onSubmit={handlePublish} className="mt-3 space-y-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={120}
                placeholder="Announcement title…"
                aria-label="Announcement title"
                required
                className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm outline-none placeholder:text-faint"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as AnnouncementCategory)}
                  aria-label="Announcement category"
                  className="glass-input rounded-xl px-3 py-2 text-xs text-foreground outline-none"
                >
                  <option value="update">Platform Update</option>
                  <option value="feature">New Feature</option>
                  <option value="security">Security Notice</option>
                </select>
                <input
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  maxLength={16}
                  placeholder="Version (e.g. v2.5)"
                  aria-label="Release version"
                  className="glass-input rounded-xl px-3 py-2 font-mono text-xs outline-none placeholder:text-faint"
                />
              </div>
              <input
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                maxLength={240}
                placeholder="Short one-line summary…"
                aria-label="Announcement summary"
                required
                className="glass-input w-full rounded-xl px-3.5 py-2 text-sm outline-none placeholder:text-faint"
              />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                maxLength={1200}
                rows={3}
                placeholder="Full announcement details…"
                aria-label="Announcement details"
                className="glass-input w-full resize-none rounded-xl px-3.5 py-2.5 text-sm outline-none placeholder:text-faint"
              />
              <div className="flex items-center justify-between pt-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={newPinned}
                    onChange={(e) => setNewPinned(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-foreground"
                  />
                  <span>Pin to top of inbox</span>
                </label>
                <button
                  type="submit"
                  className="btn-ink liquid-press rounded-full px-5 py-2 text-xs font-medium"
                >
                  Publish Announcement
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </GlassCard>
  );
}
