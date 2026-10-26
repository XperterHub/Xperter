import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Phone,
  Video,
  Mic,
  Send,
  Search,
  Square,
  PhoneOff,
  MicOff,
  VideoOff,
  ArrowLeft,
  X,
  Check,
  Plus,
  Copy,
  Play,
  Pause,
  LogIn,
  Trash2,
  UserPlus,
  Users,
  Megaphone,
  MoreVertical,
  Info,
  MinusCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import {
  buildAnnouncementItem,
  saveCustomAnnouncement,
  type AnnouncementCategory,
} from "@/lib/notifications";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GlassCard } from "@/components/GlassCard";
import {
  playSettingsLiquidSound,
  triggerSettingsHaptic,
} from "@/components/SettingsControl";
import { listAllDictionaryAccounts, signInWithGoogle, useAuthState } from "@/lib/auth";
import {
  createConversationBetweenUsers,
  searchUsersInFirestore,
  type DirectoryUser,
} from "@/lib/conversations";
import {
  broadcastRealtimeEvent,
  getSharedConversationsForUser,
  getSharedFriendRequestsForUser,
  getSharedFriendRequestsSentByUser,
  readSharedMessages,
  saveSharedConversation,
  saveSharedFriendRequest,
  saveSharedMessage,
  subscribeToRealtimeEvents,
  updateSharedFriendRequestStatus,
  type RealtimeFriendRequest,
} from "@/lib/realtime-sync";
import {
  BLUEPRINT_LIMITS,
  db,
  handleFirestoreError,
  normalizeLumenId,
  OperationType,
  sanitizeId,
} from "@/lib/firebase";
import { useRealtimePresence } from "@/lib/presence";
import {
  startWebRTCCall,
  answerWebRTCCall,
  declineWebRTCCall,
  listenForIncomingCalls,
  type CallDocData,
  type CallKind,
  type CallStatus,
  type ActiveCallControls,
  ringtone,
} from "@/lib/webrtc-calling";

export const Route = createFileRoute("/app/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Lumen" },
      { name: "description", content: "Chat with friends by text, voice and video in Lumen." },
      { property: "og:title", content: "Messages — Lumen" },
      { property: "og:description", content: "Chat with friends by text, voice and video in Lumen." },
    ],
  }),
  component: Messages,
});

type PollOption = { id: string; label: string; votes: number; votedByMe?: boolean };
type PollData = { question: string; options: PollOption[] };
type AttachmentData = { name: string; size: string; url: string; isImage: boolean };

type Msg = {
  id: string;
  me: boolean;
  senderName: string;
  dateGroup: string;
  kind: "text" | "poll" | "attachment" | "voice";
  text?: string | undefined;
  audio?: string | undefined;
  audioDuration?: number | undefined;
  attachment?: AttachmentData | undefined;
  poll?: PollData | undefined;
  pollOptionsRaw: string[];
  pollVotesRaw: string[];
  reactionsRaw: string[];
  time: string;
  edited?: boolean;
  replyToId?: string | undefined;
  forwardedFrom?: string | undefined;
  reactions?: Record<string, { count: number; me: boolean }>;
  status?: "sent" | "read";
  createdAtMs: number;
};

type Contact = {
  id: string;
  name: string;
  handle: string;
  role: string;
  online: boolean;
  isGroup?: boolean;
  memberCount?: number;
  pinned?: boolean;
  unread?: number;
  pinnedMsgId?: string | undefined;
  lastMessageText: string;
  lastMessageTime: string;
  updatedAtMs: number;
  participantIds?: string[];
  participantLumenIds?: string[];
  peerUserId?: string;
  peerLumenId?: string;
  typingUserId?: string;
  typingUserName?: string;
};

type FriendRequestItem = {
  id: string;
  fromUid: string;
  fromLumenId: string;
  fromName: string;
  toUid: string;
  toLumenId: string;
  toName: string;
  status: "pending" | "accepted" | "declined";
  createdAtMs: number;
};

const PRIMARY_REACTIONS = [
  { emoji: "⭐", label: "Star" },
  { emoji: "❤️", label: "Heart" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "😊", label: "Smile" },
  { emoji: "👍", label: "Thumbs Up" },
];

const EXTRA_REACTIONS = [
  { emoji: "🎉", label: "Party" },
  { emoji: "😂", label: "Laugh" },
  { emoji: "😮", label: "Wow" },
  { emoji: "👏", label: "Clap" },
  { emoji: "🚀", label: "Rocket" },
  { emoji: "💯", label: "100" },
  { emoji: "⚡", label: "Zap" },
  { emoji: "🙏", label: "Thanks" },
];

const nowTime = () =>
  new Date()
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    .slice(0, BLUEPRINT_LIMITS.MAX_TIME_LENGTH);

function toMillis(ts: unknown): number {
  if (ts && typeof ts === "object" && "toMillis" in ts && typeof (ts as Timestamp).toMillis === "function") {
    return (ts as Timestamp).toMillis();
  }
  return Date.now();
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/* Custom 2D theme-oriented vector icons crafted for Lumen */
function LumenIcon({
  name,
  className = "h-4 w-4",
}: {
  name:
    | "pin"
    | "reply"
    | "edit"
    | "forward"
    | "trash"
    | "attach"
    | "poll"
    | "group"
    | "sent"
    | "read";
  className?: string;
}) {
  switch (name) {
    case "pin":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M8.5 4.5H15.5L14.5 10.5L17.5 13.5V15H6.5V13.5L9.5 10.5L8.5 4.5Z"
            fill="currentColor"
            fillOpacity="0.16"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M12 15V20.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case "reply":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M9.5 7L4.5 12L9.5 17"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 12H14.5C17.2614 12 19.5 14.2386 19.5 17V18"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M14.5 5.5L18.5 9.5M5 19L6.2 14.2L15.7 4.7C16.5 3.9 17.7 3.9 18.5 4.7L19.3 5.5C20.1 6.3 20.1 7.5 19.3 8.3L9.8 17.8L5 19Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "forward":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M14.5 7L19.5 12L14.5 17"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M19 12H9.5C6.73858 12 4.5 14.2386 4.5 17V18"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "trash":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M5 7H19M9.5 7V5C9.5 4.44772 9.94772 4 10.5 4H13.5C14.0523 4 14.5 4.44772 14.5 5V7M7.5 7L8.3 18.2C8.36 19.2 9.2 20 10.2 20H13.8C14.8 20 15.64 19.2 15.7 18.2L16.5 7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "attach":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <rect
            x="4"
            y="4"
            width="16"
            height="16"
            rx="5"
            fill="currentColor"
            fillOpacity="0.12"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path d="M12 8.2V15.8M8.2 12H15.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "poll":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <rect x="4.5" y="12.5" width="3.5" height="6.5" rx="1.2" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.6" />
          <rect x="10.25" y="5.5" width="3.5" height="13.5" rx="1.2" fill="currentColor" strokeWidth="1.6" />
          <rect x="16" y="9" width="3.5" height="10" rx="1.2" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "group":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle cx="9" cy="9.5" r="3" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.65" />
          <circle cx="15.5" cy="10.5" r="2.4" stroke="currentColor" strokeWidth="1.55" />
          <path d="M4.2 18.2C4.8 15.6 6.7 14.3 9 14.3C11.3 14.3 13.2 15.6 13.8 18.2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
          <path d="M14.2 18C14.6 16.1 16 15.1 17.7 15.1C19 15.1 20 15.7 20.5 17.2" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
        </svg>
      );
    case "sent":
      return (
        <svg viewBox="0 0 14 12" className={className} fill="none" aria-hidden="true">
          <path d="M1.5 6.2L5 9.6L12.2 2.4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "read":
    default:
      return (
        <svg viewBox="0 0 18 12" className={className} fill="none" aria-hidden="true">
          <path d="M1.5 6.2L4.8 9.5L11.2 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.8 6.2L10.1 9.5L16.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

const WAVEFORM_BARS = [
  10, 16, 22, 14, 19, 25, 12, 18, 24, 15, 21, 13, 17, 23, 11, 19, 24, 16, 12, 20,
];

function VoiceNotePlayer({ src, duration = 5 }: { src: string; duration?: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState<1 | 1.5 | 2>(1);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.playbackRate = rate;
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const cycleRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next: 1 | 1.5 | 2 = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seekAt = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const ratio = (idx + 1) / WAVEFORM_BARS.length;
    setProgress(ratio);
    const el = audioRef.current;
    if (el && Number.isFinite(el.duration) && el.duration > 0) {
      el.currentTime = ratio * el.duration;
    }
  };

  const currentSec = Math.round(progress * duration);
  const fmt = (s: number) => `0:${String(s).padStart(2, "0")}`;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex min-w-[210px] items-center gap-2.5 py-0.5 sm:min-w-[240px]"
    >
      {src && (
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration > 0) setProgress(el.currentTime / el.duration);
          }}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
        />
      )}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current/20 bg-background/25 transition-transform active:scale-95"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-0.5">
          {WAVEFORM_BARS.map((h, idx) => {
            const activeBar = idx / WAVEFORM_BARS.length <= progress;
            return (
              <button
                key={idx}
                type="button"
                onClick={(e) => seekAt(idx, e)}
                aria-label={`Seek to ${Math.round(((idx + 1) / WAVEFORM_BARS.length) * 100)}%`}
                className="group/bar flex h-6 items-center px-[1px]"
              >
                <span
                  className={`w-1 rounded-full transition-all ${
                    activeBar ? "bg-current opacity-100" : "bg-current opacity-35 group-hover/bar:opacity-65"
                  }`}
                  style={{ height: `${h}px` }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] opacity-75">
          <span className="tabular-nums">
            {playing || progress > 0 ? `${fmt(currentSec)} / ${fmt(duration)}` : fmt(duration)}
          </span>
          <span>Voice note</span>
        </div>
      </div>

      <button
        type="button"
        onClick={cycleRate}
        aria-label={`Playback speed ${rate}x`}
        className="rounded-full border border-current/20 bg-background/20 px-2 py-0.5 text-[10px] font-semibold tabular-nums transition-colors hover:bg-background/35"
      >
        {rate}x
      </button>
    </div>
  );
}

function Avatar({
  name,
  online,
  isGroup,
}: {
  name: string;
  online?: boolean;
  isGroup?: boolean;
}) {
  return (
    <div className="relative shrink-0">
      <div className="bg-pearl flex h-10 w-10 items-center justify-center rounded-full border border-glass-edge text-sm font-medium sm:h-11 sm:w-11">
        {isGroup ? (
          <LumenIcon name="group" className="h-5 w-5" />
        ) : (
          name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((s) => s[0]?.toUpperCase())
            .join("") || "U"
        )}
      </div>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${
            online ? "bg-chart-2" : "bg-faint"
          }`}
        />
      )}
    </div>
  );
}

type FolderFilter = "all" | "unread" | "groups";

function Messages() {
  const nav = useNavigate();
  const { user, authReady } = useAuthState();
  const { resolveContactOnline } = useRealtimePresence(user);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, Msg[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [folder, setFolder] = useState<FolderFilter>("all");
  const [q, setQ] = useState("");
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadQuery, setThreadQuery] = useState("");
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const [contactInfoOpen, setContactInfoOpen] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editingMsg, setEditingMsg] = useState<Msg | null>(null);
  const [forwardingMsg, setForwardingMsg] = useState<Msg | null>(null);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatMode, setNewChatMode] = useState<"menu" | "friend" | "direct" | "group" | "announcement">("menu");
  const [newChatName, setNewChatName] = useState("");
  const [newChatRole, setNewChatRole] = useState("");
  const [newChatIsGroup, setNewChatIsGroup] = useState(false);
  const [friendTargetId, setFriendTargetId] = useState("");
  const [friendTargetName, setFriendTargetName] = useState("");
  const [friendRequests, setFriendRequests] = useState<FriendRequestItem[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);
  const [liveUserResults, setLiveUserResults] = useState<DirectoryUser[]>([]);
  const [sentRequestMap, setSentRequestMap] = useState<Record<string, boolean>>({});
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementCategory, setAnnouncementCategory] = useState<AnnouncementCategory>("update");
  const [announcementSummary, setAnnouncementSummary] = useState("");
  const [directoryUsersCache, setDirectoryUsersCache] = useState<
    Record<string, { displayName: string; handle: string }>
  >({});

  useEffect(() => {
    if (authReady && !user) {
      nav({ to: "/sign-in" });
    }
  }, [authReady, user, nav]);

  const handleNewChatOpenChange = (nextOpen: boolean) => {
    setNewChatOpen((prev) => {
      if (prev !== nextOpen) {
        triggerSettingsHaptic(nextOpen);
        playSettingsLiquidSound(nextOpen);
      }
      if (!nextOpen) {
        setNewChatMode("menu");
        setFriendTargetId("");
        setLiveUserResults([]);
      }
      return nextOpen;
    });
  };

  // Live user directory search (Instagram-style live lookup)
  useEffect(() => {
    const trimmed = friendTargetId.trim();
    if (!trimmed || newChatMode !== "friend") {
      setLiveUserResults([]);
      setIsSearchingLive(false);
      return;
    }

    setIsSearchingLive(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchUsersInFirestore(trimmed, user);
        const queryClean = trimmed.toLowerCase().replace(/^@+/, "");
        const contactMatches: DirectoryUser[] = contacts
          .filter(
            (c) =>
              !c.isGroup &&
              (c.name.toLowerCase().includes(queryClean) ||
                c.handle.toLowerCase().includes(queryClean) ||
                (c.peerLumenId && c.peerLumenId.toLowerCase().includes(queryClean))),
          )
          .map((c) => ({
            uid: c.peerUserId || c.id,
            lumenId: c.peerLumenId || c.id,
            displayName: c.name,
            handle: c.handle,
            photoURL: "",
          }));

        const map = new Map<string, DirectoryUser>();
        for (const u of [...results, ...contactMatches]) {
          if (u.lumenId === user?.lumenId || u.uid === user?.uid) continue;
          const key = normalizeLumenId(u.lumenId) || u.uid;
          if (!map.has(key)) map.set(key, u);
        }
        setLiveUserResults(Array.from(map.values()));
      } catch {
        setLiveUserResults([]);
      } finally {
        setIsSearchingLive(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [friendTargetId, newChatMode, user, contacts]);

  const handlePublishAnnouncementFromPopup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementSummary.trim()) return;
    const ann = buildAnnouncementItem({
      title: announcementTitle,
      summary: announcementSummary,
      body: announcementSummary,
      category: announcementCategory,
      version: "v2.5",
      author: user?.name || "Workspace Admin",
      pinned: true,
    });
    saveCustomAnnouncement(ann);
    setAnnouncementTitle("");
    setAnnouncementSummary("");
    setNewChatMode("menu");
    handleNewChatOpenChange(false);
    toast.success("Announcement broadcasted to workspace inbox");
  };

  const handleHeaderMenuOpenChange = (nextOpen: boolean) => {
    setMobileHeaderMenuOpen((prev) => {
      if (prev !== nextOpen) {
        triggerSettingsHaptic(nextOpen);
        playSettingsLiquidSound(nextOpen);
      }
      return nextOpen;
    });
  };

  // 2-second hover reaction popup state
  const [reactionPopupMsgId, setReactionPopupMsgId] = useState<string | null>(null);
  const [moreEmojisMsgId, setMoreEmojisMsgId] = useState<string | null>(null);
  const [poppingReaction, setPoppingReaction] = useState<{ msgId: string; emoji: string } | null>(
    null,
  );
  const [peerTypingByLumenId, setPeerTypingByLumenId] = useState<Record<string, boolean>>({});
  const [localTypingByChatId, setLocalTypingByChatId] = useState<Record<string, string>>({});
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBroadcastingTypingRef = useRef<{ convId: string; active: boolean }>({
    convId: "",
    active: false,
  });

  // Right-click context menu state (for Reply, Edit, Copy, Pin, Forward, Delete)
  const [contextMenuMsgId, setContextMenuMsgId] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [incomingCall, setIncomingCall] = useState<CallDocData | null>(null);
  const [activeCallSession, setActiveCallSession] = useState<{
    convId: string;
    kind: "audio" | "video";
    peerName: string;
    peerLumenId?: string;
    peerUid?: string;
    isCaller: boolean;
    incomingData?: CallDocData;
  } | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);

  // Listen in real time for incoming WebRTC calls directed to current user
  useEffect(() => {
    if (!authReady || !user || !user.isCloudUser) return;
    const unsub = listenForIncomingCalls(user.uid, (callDoc) => {
      setIncomingCall(callDoc);
    });
    return () => {
      unsub();
      ringtone.stop();
    };
  }, [authReady, user]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isCloud = Boolean(user?.isCloudUser);

  const saveLocalContacts = (uid: string, next: Contact[]) => {
    setContacts(next);
    try {
      window.localStorage.setItem(`lumen.chats.${uid}`, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  };

  const saveLocalMessages = (uid: string, next: Record<string, Msg[]>) => {
    setMessagesByChat(next);
    try {
      window.localStorage.setItem(`lumen.msgs.${uid}`, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  };

  const saveLocalFriendRequests = (uid: string, next: FriendRequestItem[]) => {
    setFriendRequests(next);
    try {
      window.localStorage.setItem(`lumen.requests.${uid}`, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  };

  // Subscribe to the authenticated user's conversations in Firestore (or load local for default login)
  useEffect(() => {
    if (!authReady || !user) {
      setContacts([]);
      setMessagesByChat({});
      setFriendRequests([]);
      setActiveId(null);
      return;
    }

    if (!user.isCloudUser) {
      try {
        const rawChats = window.localStorage.getItem(`lumen.chats.${user.uid}`);
        const parsedChats = rawChats ? (JSON.parse(rawChats) as Contact[]) : [];
        const rawMsgs = window.localStorage.getItem(`lumen.msgs.${user.uid}`);
        const parsedMsgs = rawMsgs ? (JSON.parse(rawMsgs) as Record<string, Msg[]>) : {};
        const rawReqs = window.localStorage.getItem(`lumen.requests.${user.uid}`);
        const parsedReqs = rawReqs ? (JSON.parse(rawReqs) as FriendRequestItem[]) : [];

        // Merge with shared conversations
        const shared = getSharedConversationsForUser(user.lumenId, user.uid);
        const byId = new Map<string, Contact>();
        for (const c of [...parsedChats, ...shared]) {
          byId.set(c.id, c as Contact);
        }
        const loadedChats = Array.from(byId.values());

        setContacts(loadedChats);
        setMessagesByChat(parsedMsgs && typeof parsedMsgs === "object" ? parsedMsgs : {});
        setFriendRequests(Array.isArray(parsedReqs) ? parsedReqs : []);
        setActiveId((prev) => {
          if (prev && loadedChats.some((c) => c.id === prev)) return prev;
          return loadedChats[0]?.id ?? null;
        });
      } catch {
        setContacts([]);
        setMessagesByChat({});
        setFriendRequests([]);
      }
      return;
    }

    let ownedList: Contact[] = [];
    let participantList: Contact[] = [];
    let participantLumenList: Contact[] = [];
    let sharedList: Contact[] = [];

    const mapDocToContact = (docSnap: { id: string; data: () => Record<string, unknown> }): Contact => {
      const d = docSnap.data();
      const participantIds = Array.isArray(d.participantIds)
        ? d.participantIds.filter((item): item is string => typeof item === "string")
        : undefined;
      const participantLumenIds = Array.isArray(d.participantLumenIds)
        ? d.participantLumenIds.filter((item): item is string => typeof item === "string")
        : undefined;

      const isDirect = !d.isGroup;
      const isOwner = d.ownerId === user?.uid;
      const peerLumenId = isDirect
        ? (isOwner
            ? (d.peerLumenId as string | undefined)
            : participantLumenIds?.find((id) => id !== user?.lumenId) || (d.peerLumenId as string | undefined))
        : undefined;
      const peerUserId = isDirect
        ? (isOwner
            ? (d.peerUserId as string | undefined)
            : participantIds?.find((id) => id !== user?.uid) || (d.ownerId as string | undefined))
        : undefined;

      let name = String(d.name ?? "Conversation");
      let handle = String(d.handle ?? "@thread");
      let role = String(d.role ?? "Direct Thread");

      // For direct conversations, if the current user did not create the conversation,
      // the stored name was the creator's peer name. We resolve the other party's identity!
      if (isDirect && !isOwner && peerLumenId) {
        const cached =
          directoryUsersCache[peerLumenId] ||
          directoryUsersCache[peerLumenId.toLowerCase()] ||
          directoryUsersCache[peerLumenId.toUpperCase()];
        if (cached) {
          name = cached.displayName;
          handle = cached.handle;
        } else {
          handle = `@${peerLumenId.toLowerCase().replace(/[^a-z0-9_-]+/g, ".")}`;
          if (name === user?.name) {
            name = `User ${peerLumenId}`;
          }
        }
        role = `Friend · ${peerLumenId}`;
      }

      return {
        id: docSnap.id,
        name,
        handle,
        role,
        online: true,
        isGroup: Boolean(d.isGroup),
        memberCount: typeof d.memberCount === "number" ? d.memberCount : 2,
        pinned: Boolean(d.pinned),
        unread: typeof d.unread === "number" ? d.unread : 0,
        pinnedMsgId: d.pinnedMsgId ? String(d.pinnedMsgId) : undefined,
        lastMessageText: String(d.lastMessageText ?? ""),
        lastMessageTime: String(d.lastMessageTime ?? ""),
        updatedAtMs: toMillis(d.updatedAt),
        ...(participantIds ? { participantIds } : {}),
        ...(participantLumenIds ? { participantLumenIds } : {}),
        ...(peerUserId ? { peerUserId } : {}),
        ...(peerLumenId ? { peerLumenId } : {}),
        ...(typeof d.typingUserId === "string" ? { typingUserId: d.typingUserId } : {}),
        ...(typeof d.typingUserName === "string" ? { typingUserName: d.typingUserName } : {}),
      };
    };

    const syncMergedContacts = () => {
      const byId = new Map<string, Contact>();
      for (const item of [...ownedList, ...participantList, ...participantLumenList, ...sharedList]) {
        byId.set(item.id, item);
      }
      const loaded = Array.from(byId.values());
      loaded.sort((a, b) => {
        if (Boolean(b.pinned) !== Boolean(a.pinned)) {
          return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
        }
        return b.updatedAtMs - a.updatedAtMs;
      });
      setContacts(loaded);
      setActiveId((prev) => {
        if (prev && loaded.some((c) => c.id === prev)) return prev;
        return loaded[0]?.id ?? null;
      });
    };

    // Load initial shared conversations
    const refreshShared = () => {
      const shared = getSharedConversationsForUser(user.lumenId, user.uid);
      sharedList = shared.map((c) => ({
        id: c.id,
        name: c.name,
        handle: c.handle,
        role: c.role,
        online: true,
        isGroup: c.isGroup,
        memberCount: c.memberCount,
        pinned: c.pinned,
        unread: c.unread,
        pinnedMsgId: c.pinnedMsgId,
        lastMessageText: c.lastMessageText,
        lastMessageTime: c.lastMessageTime,
        updatedAtMs: c.updatedAtMs,
        participantIds: c.participantIds,
        participantLumenIds: c.participantLumenIds,
        peerUserId: c.peerUserId,
        peerLumenId: c.peerLumenId,
      }));
      syncMergedContacts();
    };
    refreshShared();

    // Listen to realtime events for immediate cross-tab conversation upsert
    const unsubRealtime = subscribeToRealtimeEvents((event) => {
      if (event.type === "CONVERSATION_UPSERTED" || event.type === "FRIEND_REQUEST_UPDATED") {
        refreshShared();
      }
    });

    const convOwnerQuery = query(
      collection(db, "conversations"),
      where("ownerId", "==", user.uid),
    );

    const convParticipantQuery = query(
      collection(db, "conversations"),
      where("participantIds", "array-contains", user.uid),
    );

    const convLumenQuery = query(
      collection(db, "conversations"),
      where("participantLumenIds", "array-contains", user.lumenId),
    );

    const unsubOwner = onSnapshot(
      convOwnerQuery,
      (snapshot) => {
        ownedList = snapshot.docs.map(mapDocToContact);
        syncMergedContacts();
      },
      (error) => {
        console.warn("Firestore conversations owner query offline/unreachable:", error);
      },
    );

    const unsubParticipant = onSnapshot(
      convParticipantQuery,
      (snapshot) => {
        participantList = snapshot.docs.map(mapDocToContact);
        syncMergedContacts();
      },
      () => {},
    );

    const unsubLumen = onSnapshot(
      convLumenQuery,
      (snapshot) => {
        participantLumenList = snapshot.docs.map(mapDocToContact);
        syncMergedContacts();
      },
      () => {},
    );

    return () => {
      unsubRealtime();
      unsubOwner();
      unsubParticipant();
      unsubLumen();
    };
  }, [authReady, user, directoryUsersCache]);

  // Dynamically resolve peer profile names from userDirectory for all active direct conversations
  useEffect(() => {
    if (!isCloud || !user) return;
    contacts.forEach(async (c) => {
      if (!c.isGroup && c.peerLumenId && !directoryUsersCache[c.peerLumenId]) {
        try {
          let snap = await getDoc(doc(db, "userDirectory", c.peerLumenId));
          if (!snap.exists() && c.peerLumenId !== c.peerLumenId.toLowerCase()) {
            snap = await getDoc(doc(db, "userDirectory", c.peerLumenId.toLowerCase()));
          }
          if (!snap.exists() && c.peerLumenId !== c.peerLumenId.toUpperCase()) {
            snap = await getDoc(doc(db, "userDirectory", c.peerLumenId.toUpperCase()));
          }
          if (snap.exists()) {
            const data = snap.data();
            if (data.displayName) {
              setDirectoryUsersCache((prev) => ({
                ...prev,
                [c.peerLumenId!]: {
                  displayName: String(data.displayName),
                  handle: String(data.handle || `@${c.peerLumenId!.toLowerCase()}`),
                },
              }));
            }
          }
        } catch {}
      }
    });
  }, [contacts, isCloud, user, directoryUsersCache]);

  // Subscribe in real time to Firestore typing indicators from peer users targeting current user
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "lumen.typing.v1" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as {
            convId?: string;
            uid?: string;
            typing?: boolean;
          };
          if (parsed && parsed.convId) {
            setLocalTypingByChatId((prev) => ({
              ...prev,
              [parsed.convId!]: parsed.typing && parsed.uid ? parsed.uid : "",
            }));
          }
        } catch {
          // Ignore malformed storage payload
        }
      }
    };
    window.addEventListener("storage", onStorage);

    if (!authReady || !user || !user.isCloudUser) {
      return () => window.removeEventListener("storage", onStorage);
    }

    const typingQuery = query(
      collection(db, "userDirectory"),
      where("typingToLumenId", "==", user.lumenId),
    );

    const unsubTyping = onSnapshot(
      typingQuery,
      (snap) => {
        const nextMap: Record<string, boolean> = {};
        for (const docSnap of snap.docs) {
          const d = docSnap.data();
          const fromLumen = normalizeLumenId(String(d.lumenId ?? docSnap.id));
          if (fromLumen && fromLumen !== user.lumenId) {
            nextMap[fromLumen] = true;
          }
        }
        setPeerTypingByLumenId(nextMap);
      },
      () => {},
    );

    return () => {
      window.removeEventListener("storage", onStorage);
      unsubTyping();
    };
  }, [authReady, user]);

  // Subscribe to incoming and outgoing friend requests (both Firestore and Shared Realtime store)
  useEffect(() => {
    if (!authReady || !user) return;

    let outgoingList: FriendRequestItem[] = [];
    let incomingList: FriendRequestItem[] = [];
    let incomingLumenList: FriendRequestItem[] = [];
    let sharedRequests: FriendRequestItem[] = [];

    const mergeRequests = () => {
      const byId = new Map<string, FriendRequestItem>();
      for (const item of [...sharedRequests, ...incomingList, ...incomingLumenList, ...outgoingList]) {
        byId.set(item.id, item);
      }
      const merged = Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
      setFriendRequests(merged);
    };

    const refreshShared = () => {
      const inReqs = getSharedFriendRequestsForUser(user.lumenId, user.uid);
      const outReqs = getSharedFriendRequestsSentByUser(user.lumenId, user.uid);
      sharedRequests = [...inReqs, ...outReqs].map((r) => ({
        id: r.id,
        fromUid: r.fromUid,
        fromLumenId: r.fromLumenId,
        fromName: r.fromName,
        toUid: r.toUid,
        toLumenId: r.toLumenId,
        toName: r.toName,
        status: r.status,
        createdAtMs: r.createdAtMs,
      }));
      mergeRequests();
    };
    refreshShared();

    const unsubRealtime = subscribeToRealtimeEvents((ev) => {
      if (ev.type === "FRIEND_REQUEST_SENT" || ev.type === "FRIEND_REQUEST_UPDATED") {
        refreshShared();
      }
    });

    const parseDoc = (docSnap: { id: string; data: () => Record<string, unknown> }): FriendRequestItem => {
      const d = docSnap.data();
      const statusRaw = String(d.status ?? "pending");
      const status: FriendRequestItem["status"] =
        statusRaw === "accepted" || statusRaw === "declined" ? statusRaw : "pending";
      return {
        id: docSnap.id,
        fromUid: String(d.fromUid ?? ""),
        fromLumenId: String(d.fromLumenId ?? ""),
        fromName: String(d.fromName ?? "User"),
        toUid: String(d.toUid ?? ""),
        toLumenId: String(d.toLumenId ?? ""),
        toName: String(d.toName ?? "Friend"),
        status,
        createdAtMs: toMillis(d.createdAt),
      };
    };

    if (!user.isCloudUser) {
      return () => unsubRealtime();
    }

    const outQuery = query(
      collection(db, "friendRequests"),
      where("fromUid", "==", user.uid),
    );
    const inQuery = query(
      collection(db, "friendRequests"),
      where("toUid", "==", user.uid),
    );
    const inLumenQuery = query(
      collection(db, "friendRequests"),
      where("toLumenId", "==", user.lumenId),
    );

    const unsubOut = onSnapshot(
      outQuery,
      (snap) => {
        outgoingList = snap.docs.map(parseDoc);
        mergeRequests();
      },
      (err) => console.warn("Firestore friendRequests outQuery offline/unreachable:", err),
    );

    const unsubIn = onSnapshot(
      inQuery,
      (snap) => {
        incomingList = snap.docs.map(parseDoc);
        mergeRequests();
      },
      (err) => console.warn("Firestore friendRequests inQuery offline/unreachable:", err),
    );

    const unsubInLumen = onSnapshot(
      inLumenQuery,
      (snap) => {
        incomingLumenList = snap.docs.map(parseDoc);
        mergeRequests();
      },
      (err) => console.warn("Firestore friendRequests inLumenQuery offline/unreachable:", err),
    );

    return () => {
      unsubRealtime();
      unsubOut();
      unsubIn();
      unsubInLumen();
    };
  }, [authReady, user]);

  // Subscribe to messages for the active conversation in Firestore and Shared store
  useEffect(() => {
    if (!authReady || !user || !activeId) return;

    // Load initial messages from shared storage
    const rawShared = readSharedMessages(activeId);
    if (rawShared.length > 0) {
      const mappedShared: Msg[] = rawShared.map((d: any) => ({
        id: d.id,
        me: String(d.senderUid || d.ownerId || "") === user.uid || String(d.senderLumenId || "") === user.lumenId,
        senderName: String(d.senderName || user.name),
        dateGroup: String(d.dateGroup || "Today"),
        kind: d.kind || "text",
        text: d.text ? String(d.text) : undefined,
        audio: d.audio || d.audioUrl,
        audioDuration: d.audioDuration,
        attachment: d.attachment,
        poll: d.poll,
        pollOptionsRaw: d.pollOptionsRaw || [],
        pollVotesRaw: d.pollVotesRaw || [],
        reactionsRaw: d.reactionsRaw || [],
        time: String(d.time || ""),
        edited: Boolean(d.edited),
        replyToId: d.replyToId ? String(d.replyToId) : undefined,
        forwardedFrom: d.forwardedFrom ? String(d.forwardedFrom) : undefined,
        reactions: d.reactions || {},
        status: "read",
        createdAtMs: typeof d.createdAtMs === "number" ? d.createdAtMs : Date.now(),
      }));
      setMessagesByChat((prev) => ({ ...prev, [activeId]: mappedShared }));
    }

    // Subscribe to realtime broadcast events for live message replication
    const unsubBroadcast = subscribeToRealtimeEvents((event) => {
      if (event.type === "MESSAGE_SENT" && event.convId === activeId) {
        const d = event.message;
        const isFromMe = String(d.senderUid || d.ownerId || "") === user.uid || String(d.senderLumenId || "") === user.lumenId;
        const nextMsg: Msg = {
          id: d.id,
          me: isFromMe,
          senderName: String(d.senderName || user.name),
          dateGroup: String(d.dateGroup || "Today"),
          kind: d.kind || "text",
          text: d.text ? String(d.text) : undefined,
          audio: d.audio || d.audioUrl,
          audioDuration: d.audioDuration,
          attachment: d.attachment,
          poll: d.poll,
          pollOptionsRaw: d.pollOptionsRaw || [],
          pollVotesRaw: d.pollVotesRaw || [],
          reactionsRaw: d.reactionsRaw || [],
          time: String(d.time || ""),
          edited: Boolean(d.edited),
          replyToId: d.replyToId ? String(d.replyToId) : undefined,
          forwardedFrom: d.forwardedFrom ? String(d.forwardedFrom) : undefined,
          reactions: d.reactions || {},
          status: "read",
          createdAtMs: typeof d.createdAtMs === "number" ? d.createdAtMs : Date.now(),
        };

        setMessagesByChat((prev) => {
          const currentList = prev[activeId] ?? [];
          if (currentList.some((m) => m.id === nextMsg.id)) return prev;
          return { ...prev, [activeId]: [...currentList, nextMsg] };
        });

        if (!isFromMe) {
          playNotificationChime();
        }
      }
    });

    if (!user.isCloudUser) {
      return () => unsubBroadcast();
    }

    const msgsQuery = query(
      collection(db, "conversations", activeId, "messages"),
    );

    const unsubCloud = onSnapshot(
      msgsQuery,
      (snapshot) => {
        const loaded: Msg[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          const kind = (d.kind as Msg["kind"]) || "text";
          const pollOpts: string[] = Array.isArray(d.pollOptions)
            ? d.pollOptions.map(String)
            : [];
          const pollVotes: string[] = Array.isArray(d.pollVotes)
            ? d.pollVotes.map(String)
            : [];
          const reactionsArr: string[] = Array.isArray(d.reactions)
            ? d.reactions.map(String)
            : [];

          const reactionsMap: Record<string, { count: number; me: boolean }> = {};
          for (const emoji of reactionsArr) {
            reactionsMap[emoji] = { count: 1, me: true };
          }

          const poll: PollData | undefined =
            kind === "poll" && d.pollQuestion
              ? {
                  question: String(d.pollQuestion),
                  options: pollOpts.map((label, idx) => {
                    const votedByMe = pollVotes.includes(label);
                    return {
                      id: `opt-${idx}`,
                      label,
                      votes: votedByMe ? 1 : 0,
                      votedByMe,
                    };
                  }),
                }
              : undefined;

          const attachment: AttachmentData | undefined =
            kind === "attachment" && d.attachmentName
              ? {
                  name: String(d.attachmentName),
                  size: String(d.attachmentSize || "1 KB"),
                  url: String(d.attachmentUrl || ""),
                  isImage: Boolean(d.attachmentIsImage),
                }
              : undefined;

          return {
            id: docSnap.id,
            me: String(d.ownerId ?? "") === user.uid,
            senderName: String(d.senderName || user.name),
            dateGroup: String(d.dateGroup || "Today"),
            kind,
            text: d.text ? String(d.text) : undefined,
            audio: kind === "voice" && d.audioUrl ? String(d.audioUrl) : undefined,
            audioDuration:
              typeof d.audioDuration === "number" && d.audioDuration > 0
                ? d.audioDuration
                : undefined,
            attachment,
            poll,
            pollOptionsRaw: pollOpts,
            pollVotesRaw: pollVotes,
            reactionsRaw: reactionsArr,
            time: String(d.time || ""),
            edited: Boolean(d.edited),
            replyToId: d.replyToId ? String(d.replyToId) : undefined,
            forwardedFrom: d.forwardedFrom ? String(d.forwardedFrom) : undefined,
            reactions: reactionsMap,
            status: d.status === "sent" ? "sent" : "read",
            createdAtMs: toMillis(d.createdAt),
          };
        });

        loaded.sort((a, b) => a.createdAtMs - b.createdAtMs);
        setMessagesByChat((prev) => ({ ...prev, [activeId]: loaded }));
      },
      (error) => {
        console.warn("Firestore messages query offline/unreachable:", error);
      },
    );

    return () => {
      unsubBroadcast();
      unsubCloud();
    };
  }, [authReady, user, activeId]);

  const active = contacts.find((c) => c.id === activeId);
  const activeMsgs = useMemo(
    () => (activeId ? (messagesByChat[activeId] ?? []) : []),
    [messagesByChat, activeId],
  );
  const text = activeId ? (drafts[activeId] ?? "") : "";

  const friendshipLockState = useMemo(() => {
    if (!active || active.isGroup || !user) {
      return { locked: false, isIncoming: false, pendingReq: null as FriendRequestItem | null };
    }
    const peerLumenId = normalizeLumenId(active.peerLumenId || "");
    const peerUid = active.peerUserId;

    // Check if there is an accepted friend request
    const accepted = friendRequests.some(
      (r) =>
        r.status === "accepted" &&
        (((r.fromUid === user.uid || normalizeLumenId(r.fromLumenId) === user.lumenId) &&
          (normalizeLumenId(r.toLumenId) === peerLumenId || (peerUid && r.toUid === peerUid))) ||
         ((r.toUid === user.uid || normalizeLumenId(r.toLumenId) === user.lumenId) &&
          (normalizeLumenId(r.fromLumenId) === peerLumenId || (peerUid && r.fromUid === peerUid)))),
    );
    if (accepted) return { locked: false, isIncoming: false, pendingReq: null };

    // Check if there is a pending request
    const pendingReq = friendRequests.find(
      (r) =>
        r.status === "pending" &&
        ((r.fromUid === user.uid && (normalizeLumenId(r.toLumenId) === peerLumenId || (peerUid && r.toUid === peerUid))) ||
         ((r.toUid === user.uid || normalizeLumenId(r.toLumenId) === user.lumenId) &&
          (normalizeLumenId(r.fromLumenId) === peerLumenId || (peerUid && r.fromUid === peerUid)))),
    );

    if (pendingReq) {
      const isIncoming = pendingReq.toUid === user.uid || normalizeLumenId(pendingReq.toLumenId) === user.lumenId;
      return { locked: true, isIncoming, pendingReq };
    }

    return { locked: false, isIncoming: false, pendingReq: null };
  }, [active, user, friendRequests]);

  const publishTypingStatus = (conv: Contact | undefined, isTyping: boolean) => {
    if (!user || !conv) return;
    const prev = isBroadcastingTypingRef.current;
    if (prev.convId === conv.id && prev.active === isTyping) return;
    isBroadcastingTypingRef.current = { convId: conv.id, active: isTyping };

    try {
      window.localStorage.setItem(
        "lumen.typing.v1",
        JSON.stringify({
          convId: conv.id,
          uid: user.uid,
          typing: isTyping,
          ts: Date.now(),
        }),
      );
    } catch {
      // Ignore storage errors
    }

    if (!isCloud) return;

    void updateDoc(doc(db, "conversations", conv.id), {
      typingUserId: isTyping ? user.uid : "",
      typingUserName: isTyping ? user.name.slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH) : "",
      updatedAt: serverTimestamp(),
    }).catch(() => {});

    const peerLumen =
      conv.peerLumenId ||
      conv.participantLumenIds?.find(
        (id) => normalizeLumenId(id) !== normalizeLumenId(user.lumenId),
      ) ||
      conv.role.toUpperCase().match(/LMN-[A-Z0-9]{4,10}/)?.[0] ||
      "";

    if (user.lumenId) {
      void updateDoc(doc(db, "userDirectory", user.lumenId), {
        typingToLumenId: isTyping && peerLumen ? normalizeLumenId(peerLumen) : "",
        typingFromName: isTyping ? user.name.slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH) : "",
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  };

  const setText = (val: string) => {
    if (!activeId) return;
    setDrafts((prev) => ({ ...prev, [activeId]: val }));
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    const isNowTyping = val.trim().length > 0;
    publishTypingStatus(active, isNowTyping);
    if (isNowTyping) {
      const currentActive = active;
      typingTimeoutRef.current = setTimeout(() => {
        publishTypingStatus(currentActive, false);
      }, 2400);
    }
  };

  // Clear hover and typing timers on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      if (popTimerRef.current) clearTimeout(popTimerRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // Dismiss menus on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenuMsgId(null);
        setReactionPopupMsgId(null);
        setMoreEmojisMsgId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleMsgMouseEnter = (msgId: string) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (reactionPopupMsgId === msgId) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setReactionPopupMsgId(msgId);
    }, 2000);
  };

  const handleMsgMouseLeave = (msgId: string) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (reactionPopupMsgId === msgId) {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = setTimeout(() => {
        setReactionPopupMsgId((curr) => (curr === msgId ? null : curr));
        setMoreEmojisMsgId((curr) => (curr === msgId ? null : curr));
      }, 300);
    }
  };

  const handleStartCall = (kind: "audio" | "video") => {
    if (!active || !user) return;
    if (friendshipLockState.locked) {
      toast.error(
        friendshipLockState.isIncoming
          ? "Please accept their friend request to start voice/video calls."
          : "Calling unlocks once your friend accepts your friend request."
      );
      return;
    }
    const peerUid =
      active.peerUserId ||
      active.participantIds?.find((id) => id !== user.uid) ||
      active.id;
    const peerLumenId =
      active.peerLumenId ||
      active.participantLumenIds?.find((id) => id !== user.lumenId) ||
      "";
    setActiveCallSession({
      convId: active.id,
      kind,
      peerName: active.name,
      peerLumenId,
      peerUid,
      isCaller: true,
    });
  };

  const selectContact = async (id: string) => {
    setActiveId(id);
    setReplyTo(null);
    setEditingMsg(null);
    setContextMenuMsgId(null);
    setReactionPopupMsgId(null);
    setMoreEmojisMsgId(null);

    const target = contacts.find((c) => c.id === id);
    if (user && target && target.unread && target.unread > 0) {
      if (!isCloud) {
        const next = contacts.map((c) => (c.id === id ? { ...c, unread: 0 } : c));
        saveLocalContacts(user.uid, next);
        return;
      }
      const convPath = `conversations/${id}`;
      try {
        await updateDoc(doc(db, "conversations", id), {
          pinned: Boolean(target.pinned),
          unread: 0,
          pinnedMsgId: target.pinnedMsgId ?? "",
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, convPath);
      }
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMsgs.length, activeId]);

  const persistMessage = async (
    targetConvId: string,
    payload: {
      kind: "text" | "poll" | "attachment" | "voice";
      text?: string;
      replyToId?: string;
      forwardedFrom?: string;
      attachment?: AttachmentData;
      audioUrl?: string;
      audioDuration?: number;
      pollQuestion?: string;
      pollOptions?: string[];
    },
  ) => {
    if (!user) return;
    const convId = sanitizeId(targetConvId);
    const msgId = sanitizeId(`msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const timeStr = nowTime();
    const cleanText = (payload.text ?? "").trim().slice(0, BLUEPRINT_LIMITS.MAX_TEXT_LENGTH);

    const cleanPollOptions = (payload.pollOptions ?? [])
      .slice(0, BLUEPRINT_LIMITS.MAX_POLL_OPTIONS)
      .map((o) => o.slice(0, BLUEPRINT_LIMITS.MAX_POLL_OPTION_LENGTH));
    const cleanPollQuestion = (payload.pollQuestion ?? "").slice(
      0,
      BLUEPRINT_LIMITS.MAX_POLL_QUESTION_LENGTH,
    );
    const preview =
      payload.kind === "voice"
        ? "Voice message"
        : payload.kind === "poll"
          ? `Poll: ${cleanPollQuestion}`
          : payload.kind === "attachment"
            ? `Attachment: ${payload.attachment?.name ?? ""}`
            : cleanText;

    const localMsg: Msg = {
      id: msgId,
      me: true,
      senderName: user.name,
      dateGroup: "Today",
      kind: payload.kind,
      text: cleanText || undefined,
      audio: payload.kind === "voice" ? payload.audioUrl : undefined,
      audioDuration: payload.audioDuration,
      attachment: payload.attachment,
      poll:
        payload.kind === "poll" && cleanPollQuestion
          ? {
              question: cleanPollQuestion,
              options: cleanPollOptions.map((label, idx) => ({
                id: `opt-${idx}`,
                label,
                votes: 0,
                votedByMe: false,
              })),
            }
          : undefined,
      pollOptionsRaw: cleanPollOptions,
      pollVotesRaw: [],
      reactionsRaw: [],
      time: timeStr,
      edited: false,
      replyToId: payload.replyToId,
      forwardedFrom: payload.forwardedFrom,
      reactions: {},
      status: "read",
      createdAtMs: Date.now(),
    };

    // 1. Immediately save and broadcast to shared store for live cross-tab/local replication
    saveSharedMessage(convId, {
      ...localMsg,
      senderUid: user.uid,
      senderLumenId: user.lumenId,
    });

    const existingList = messagesByChat[convId] ?? [];
    setMessagesByChat((prev) => ({ ...prev, [convId]: [...existingList, localMsg] }));
    const nextContacts = contacts.map((c) =>
      c.id === convId
        ? {
            ...c,
            lastMessageText: preview.slice(0, BLUEPRINT_LIMITS.MAX_LAST_MESSAGE_TEXT_LENGTH),
            lastMessageTime: timeStr,
            unread: 0,
            updatedAtMs: Date.now(),
          }
        : c,
    );
    setContacts(nextContacts);
    saveLocalContacts(user.uid, nextContacts);

    if (!isCloud) {
      saveLocalMessages(user.uid, { ...messagesByChat, [convId]: [...existingList, localMsg] });
      return;
    }

    const msgPath = `conversations/${convId}/messages/${msgId}`;

    const docData = {
      ownerId: user.uid,
      conversationId: convId,
      senderName: user.name.slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH),
      me: true,
      kind: payload.kind,
      text: cleanText,
      time: timeStr,
      dateGroup: "Today",
      edited: false,
      replyToId: (payload.replyToId ?? "").slice(0, BLUEPRINT_LIMITS.MAX_ID_LENGTH),
      forwardedFrom: (payload.forwardedFrom ?? "").slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH),
      status: "read",
      attachmentName: (payload.attachment?.name ?? "").slice(
        0,
        BLUEPRINT_LIMITS.MAX_ATTACHMENT_NAME_LENGTH,
      ),
      attachmentSize: (payload.attachment?.size ?? "").slice(
        0,
        BLUEPRINT_LIMITS.MAX_ATTACHMENT_SIZE_LENGTH,
      ),
      attachmentUrl: (payload.attachment?.url ?? "").slice(
        0,
        BLUEPRINT_LIMITS.MAX_DATA_URL_LENGTH,
      ),
      attachmentIsImage: Boolean(payload.attachment?.isImage),
      audioUrl: (payload.audioUrl ?? "").slice(0, BLUEPRINT_LIMITS.MAX_DATA_URL_LENGTH),
      audioDuration: Math.min(600, Math.max(0, Math.round(payload.audioDuration ?? 0))),
      pollQuestion: cleanPollQuestion,
      pollOptions: cleanPollOptions,
      pollVotes: [],
      reactions: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, "conversations", convId, "messages", msgId), docData);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, msgPath);
    }

    const convPath = `conversations/${convId}`;
    try {
      await updateDoc(doc(db, "conversations", convId), {
        lastMessageText: preview.slice(0, BLUEPRINT_LIMITS.MAX_LAST_MESSAGE_TEXT_LENGTH),
        lastMessageTime: timeStr,
        unread: 0,
        typingUserId: "",
        typingUserName: "",
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, convPath);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (friendshipLockState.locked) {
      toast.error(
        friendshipLockState.isIncoming
          ? "Please accept their friend request above to send messages."
          : "Messaging unlocks once your friend accepts your friend request."
      );
      return;
    }
    if (!text.trim() || !active || !user) return;

    if (editingMsg) {
      const editedText = text.trim().slice(0, BLUEPRINT_LIMITS.MAX_TEXT_LENGTH);
      const targetMsgId = editingMsg.id;
      setEditingMsg(null);
      setText("");
      if (!isCloud) {
        const updatedList = activeMsgs.map((m) =>
          m.id === targetMsgId ? { ...m, text: editedText, edited: true } : m,
        );
        saveLocalMessages(user.uid, { ...messagesByChat, [active.id]: updatedList });
        toast.success("Message updated");
        return;
      }
      const msgPath = `conversations/${active.id}/messages/${targetMsgId}`;
      try {
        await updateDoc(doc(db, "conversations", active.id, "messages", targetMsgId), {
          text: editedText,
          edited: true,
          updatedAt: serverTimestamp(),
        });
        toast.success("Message updated");
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, msgPath);
      }
      return;
    }

    const outgoing = text.trim();
    const currentReplyId = replyTo?.id;
    setText("");
    setReplyTo(null);
    await persistMessage(active.id, {
      kind: "text",
      text: outgoing,
      replyToId: currentReplyId,
    });
  };

  const copyMessageText = (m: Msg) => {
    const content = m.text ?? m.poll?.question ?? m.attachment?.name ?? "";
    if (content && navigator.clipboard) {
      navigator.clipboard.writeText(content).catch(() => {});
    }
    toast.success("Copied to clipboard");
    setContextMenuMsgId(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !active || !user) return;
    e.target.value = "";

    if (file.size > 350 * 1024) {
      toast.error("Please choose a file under 350 KB");
      return;
    }

    const isImage = file.type.startsWith("image/");
    const size =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;

    try {
      const dataUrl = await readBlobAsDataUrl(file);
      const currentText = text.trim();
      const currentReplyId = replyTo?.id;
      setText("");
      setReplyTo(null);
      setComposerMenuOpen(false);

      await persistMessage(active.id, {
        kind: "attachment",
        text: currentText || undefined,
        replyToId: currentReplyId,
        attachment: {
          name: file.name.slice(0, BLUEPRINT_LIMITS.MAX_ATTACHMENT_NAME_LENGTH),
          size,
          url: dataUrl,
          isImage,
        },
      });
    } catch {
      toast.error("Could not attach file");
    }
  };

  const createPoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !user) return;
    const cleanQ = pollQuestion.trim().slice(0, BLUEPRINT_LIMITS.MAX_POLL_QUESTION_LENGTH);
    const cleanOpts = pollOptions
      .map((o) => o.trim().slice(0, BLUEPRINT_LIMITS.MAX_POLL_OPTION_LENGTH))
      .filter(Boolean)
      .slice(0, BLUEPRINT_LIMITS.MAX_POLL_OPTIONS);
    if (!cleanQ || cleanOpts.length < 2) return;

    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollModalOpen(false);
    setComposerMenuOpen(false);

    await persistMessage(active.id, {
      kind: "poll",
      pollQuestion: cleanQ,
      pollOptions: cleanOpts,
    });
  };

  const createNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const name = newChatName.trim().slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH);
    if (!name) return;

    const isGroupChat = folder === "groups" || newChatMode === "group" || newChatIsGroup;
    const id = sanitizeId(`chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const handleBase = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
    const handle = `@${handleBase || "group"}`.slice(0, BLUEPRINT_LIMITS.MAX_HANDLE_LENGTH);
    const defaultRole = isGroupChat ? "Group Space" : "Direct Thread";
    const role = (newChatRole.trim() || defaultRole).slice(0, BLUEPRINT_LIMITS.MAX_ROLE_LENGTH);

    setNewChatName("");
    setNewChatRole("");
    setNewChatIsGroup(false);
    handleNewChatOpenChange(false);

    if (!isCloud) {
      const nextContact: Contact = {
        id,
        name,
        handle,
        role,
        online: true,
        isGroup: isGroupChat,
        memberCount: isGroupChat ? 3 : 2,
        pinned: false,
        unread: 0,
        pinnedMsgId: undefined,
        lastMessageText: isGroupChat ? "Group created" : "",
        lastMessageTime: nowTime(),
        updatedAtMs: Date.now(),
      };
      saveLocalContacts(user.uid, [nextContact, ...contacts]);
      setActiveId(id);
      toast.success(`Created group ${name}`);
      return;
    }

    const convPath = `conversations/${id}`;
    try {
      await setDoc(doc(db, "conversations", id), {
        ownerId: user.uid,
        participantIds: [user.uid],
        participantLumenIds: [user.lumenId],
        peerUserId: user.uid,
        peerLumenId: user.lumenId,
        name,
        handle,
        role,
        isGroup: isGroupChat,
        memberCount: isGroupChat ? 3 : 2,
        pinned: false,
        unread: 0,
        pinnedMsgId: "",
        lastMessageText: isGroupChat ? "Group created" : "",
        lastMessageTime: nowTime(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActiveId(id);
      toast.success(`Created group ${name}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, convPath);
    }
  };

  const copyMyUserId = () => {
    if (!user?.lumenId) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(user.lumenId).catch(() => {});
    }
    toast.success(`Copied your User ID: ${user.lumenId}`);
  };

  const ensureConversationWithFriend = async (
    friendLumenId: string,
    friendName: string,
    friendUid?: string,
  ): Promise<string> => {
    if (!user) return "";
    const cleanId = normalizeLumenId(friendLumenId);
    const peerUid = sanitizeId(friendUid || `dir_${cleanId}`);
    const handle = `@${cleanId.toLowerCase().replace(/[^a-z0-9_-]+/g, ".")}`.slice(
      0,
      BLUEPRINT_LIMITS.MAX_HANDLE_LENGTH,
    );
    const existingConv = contacts.find(
      (c) =>
        !c.isGroup &&
        (c.peerUserId === peerUid ||
          c.peerLumenId === cleanId ||
          c.participantIds?.includes(peerUid) ||
          c.handle.toLowerCase() === handle.toLowerCase() ||
          c.role.toUpperCase().includes(cleanId)),
    );
    if (existingConv) {
      setActiveId(existingConv.id);
      return existingConv.id;
    }

    const displayName = (friendName.trim() || `User ${cleanId}`).slice(
      0,
      BLUEPRINT_LIMITS.MAX_NAME_LENGTH,
    );

    const created = await createConversationBetweenUsers(user, {
      uid: peerUid,
      lumenId: cleanId,
      displayName,
    });
    setActiveId(created.id);
    return created.id;
  };

  const handleStartChatWithDirectoryUser = async (target: DirectoryUser) => {
    if (!user) return;
    setNewChatOpen(false);
    await ensureConversationWithFriend(target.lumenId, target.displayName, target.uid);
    toast.success(`Started conversation with ${target.displayName}`);
  };

  const handleQuickFriendRequest = async (target: DirectoryUser) => {
    if (!user) return;
    const targetLumenId = normalizeLumenId(target.lumenId);
    let resolvedToUid = sanitizeId(target.uid || "");
    let resolvedToName = (target.displayName.trim() || `User ${targetLumenId}`).slice(
      0,
      BLUEPRINT_LIMITS.MAX_NAME_LENGTH,
    );

    // If target.uid is missing or starts with dir_ or usr_, resolve the REAL auth UID from dictionary or Firestore
    if (!resolvedToUid || resolvedToUid.startsWith("dir_") || resolvedToUid.startsWith("usr_")) {
      const dictMatch = listAllDictionaryAccounts().find(
        (a) => a.usernameId.toLowerCase() === targetLumenId.toLowerCase(),
      );
      if (dictMatch?.uid && !dictMatch.uid.startsWith("usr_") && !dictMatch.uid.startsWith("dir_")) {
        resolvedToUid = sanitizeId(dictMatch.uid);
      } else {
        try {
          let dirSnap = await getDoc(doc(db, "userDirectory", targetLumenId));
          if (!dirSnap.exists() && targetLumenId !== targetLumenId.toLowerCase()) {
            dirSnap = await getDoc(doc(db, "userDirectory", targetLumenId.toLowerCase()));
          }
          if (dirSnap.exists()) {
            const data = dirSnap.data();
            if (data.uid) resolvedToUid = sanitizeId(data.uid);
            if (data.displayName) resolvedToName = data.displayName;
          }
        } catch {}
      }
    }

    if (!resolvedToUid || resolvedToUid.startsWith("dir_")) {
      toast.error(`Could not verify recipient with User ID @${targetLumenId}`);
      return;
    }

    const reqId = sanitizeId(`freq_${user.uid.slice(0, 20)}_${targetLumenId}_${Date.now().toString(36)}`);

    const nextReq: RealtimeFriendRequest = {
      id: reqId,
      fromUid: user.uid,
      fromLumenId: user.lumenId,
      fromName: user.name,
      toUid: resolvedToUid,
      toLumenId: targetLumenId,
      toName: resolvedToName,
      status: "pending",
      createdAtMs: Date.now(),
    };

    // 1. Immediately save and broadcast via realtime-sync for instant delivery to recipient inbox
    saveSharedFriendRequest(nextReq);

    // 2. Save to local per-user state
    saveLocalFriendRequests(user.uid, [nextReq, ...friendRequests]);
    setSentRequestMap((prev) => ({
      ...prev,
      [targetLumenId]: true,
      [target.lumenId]: true,
      [resolvedToUid]: true,
    }));
    toast.success(`Friend request sent to ${resolvedToName} (@${targetLumenId})`);

    // 3. Write to Firestore in background when cloud-authenticated
    if (isCloud) {
      void setDoc(doc(db, "friendRequests", reqId), {
        fromUid: user.uid,
        fromLumenId: user.lumenId,
        fromName: user.name.slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH),
        toUid: resolvedToUid,
        toLumenId: targetLumenId,
        toName: resolvedToName,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        console.warn("Firestore friend request write error:", err);
      });
    }
  };

  const getFriendshipStatus = (
    target: DirectoryUser,
  ): "self" | "connected" | "requested" | "incoming" | "none" => {
    if (!user) return "none";
    const normTarget = normalizeLumenId(target.lumenId);
    if (user.lumenId === normTarget || user.uid === target.uid) return "self";

    // 1. Check if accepted
    const hasAcceptedReq = friendRequests.some(
      (r) =>
        r.status === "accepted" &&
        ((r.fromUid === user.uid && (normalizeLumenId(r.toLumenId) === normTarget || r.toUid === target.uid)) ||
         (r.toUid === user.uid && (normalizeLumenId(r.fromLumenId) === normTarget || r.fromUid === target.uid))),
    );

    const isConnected = hasAcceptedReq || contacts.some(
      (c) =>
        !c.isGroup &&
        (c.participantLumenIds?.some((l) => normalizeLumenId(l) === normTarget) ||
          normalizeLumenId(c.peerLumenId || "") === normTarget ||
          c.peerUserId === target.uid),
    );
    if (isConnected) return "connected";

    if (sentRequestMap[normTarget] || sentRequestMap[target.lumenId] || (target.uid && sentRequestMap[target.uid])) {
      return "requested";
    }

    const hasOutgoing = friendRequests.some(
      (r) =>
        r.status === "pending" &&
        r.fromUid === user.uid &&
        (normalizeLumenId(r.toLumenId) === normTarget || r.toUid === target.uid),
    );
    if (hasOutgoing) return "requested";

    const hasIncoming = friendRequests.some(
      (r) =>
        r.status === "pending" &&
        (r.toUid === user.uid || normalizeLumenId(r.toLumenId) === user.lumenId) &&
        (normalizeLumenId(r.fromLumenId) === normTarget || r.fromUid === target.uid),
    );
    if (hasIncoming) return "incoming";

    return "none";
  };

  const handleSendFriendRequestToLiveUser = async (target: DirectoryUser) => {
    if (!user) return;
    const normTarget = normalizeLumenId(target.lumenId);
    setSentRequestMap((prev) => ({ ...prev, [normTarget]: true, [target.lumenId]: true }));
    triggerSettingsHaptic(true);
    playSettingsLiquidSound(true);
    await handleQuickFriendRequest(target);
  };

  const handleSendFriendRequest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;
    const targetLumenId = normalizeLumenId(friendTargetId);
    if (targetLumenId.length < 4) {
      toast.error("Enter a valid User ID");
      return;
    }
    if (targetLumenId === user.lumenId) {
      toast.error("That is your own User ID");
      return;
    }

    let resolvedToUid = sanitizeId(`dir_${targetLumenId}`);
    let resolvedToName = (friendTargetName.trim() || `User ${targetLumenId}`).slice(
      0,
      BLUEPRINT_LIMITS.MAX_NAME_LENGTH,
    );

    if (isCloud) {
      try {
        let dirSnap = await getDoc(doc(db, "userDirectory", targetLumenId));
        if (!dirSnap.exists() && targetLumenId !== targetLumenId.toLowerCase()) {
          dirSnap = await getDoc(doc(db, "userDirectory", targetLumenId.toLowerCase()));
        }
        if (!dirSnap.exists() && targetLumenId !== targetLumenId.toUpperCase()) {
          dirSnap = await getDoc(doc(db, "userDirectory", targetLumenId.toUpperCase()));
        }
        if (dirSnap.exists()) {
          const dirData = dirSnap.data();
          if (typeof dirData.uid === "string" && dirData.uid) {
            resolvedToUid = sanitizeId(dirData.uid);
          }
          if (typeof dirData.displayName === "string" && dirData.displayName) {
            resolvedToName = dirData.displayName.slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH);
          }
        } else {
          toast.error(`User ID "@${targetLumenId}" does not exist.`);
          return;
        }
      } catch (err) {
        console.error("Directory lookup failed:", err);
      }
    }

    const reqId = sanitizeId(`freq_${user.uid.slice(0, 20)}_${targetLumenId}_${Date.now().toString(36)}`);
    setFriendTargetId("");
    setFriendTargetName("");
    handleNewChatOpenChange(false);

    if (!isCloud) {
      const nextReq: FriendRequestItem = {
        id: reqId,
        fromUid: user.uid,
        fromLumenId: user.lumenId,
        fromName: user.name,
        toUid: resolvedToUid,
        toLumenId: targetLumenId,
        toName: resolvedToName,
        status: "pending",
        createdAtMs: Date.now(),
      };
      saveLocalFriendRequests(user.uid, [nextReq, ...friendRequests]);
      await ensureConversationWithFriend(targetLumenId, resolvedToName, resolvedToUid);
      toast.success(`Added friend ${resolvedToName} (@${targetLumenId})`);
      return;
    }

    const reqPath = `friendRequests/${reqId}`;
    try {
      await setDoc(doc(db, "friendRequests", reqId), {
        fromUid: user.uid,
        fromLumenId: user.lumenId,
        fromName: user.name.slice(0, BLUEPRINT_LIMITS.MAX_NAME_LENGTH),
        toUid: resolvedToUid,
        toLumenId: targetLumenId,
        toName: resolvedToName,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await ensureConversationWithFriend(targetLumenId, resolvedToName, resolvedToUid);
      toast.success(`Sent friend request to ${resolvedToName} (@${targetLumenId})`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, reqPath);
    }
  };

  const handleDirectStartByUserId = async () => {
    if (!user) return;
    const targetLumenId = normalizeLumenId(friendTargetId);
    if (targetLumenId.length < 4) {
      toast.error("Enter a valid User ID");
      return;
    }
    let resolvedName = friendTargetName.trim() || `User ${targetLumenId}`;
    let resolvedUid = sanitizeId(`dir_${targetLumenId}`);
    if (isCloud) {
      try {
        let dirSnap = await getDoc(doc(db, "userDirectory", targetLumenId));
        if (!dirSnap.exists() && targetLumenId !== targetLumenId.toLowerCase()) {
          dirSnap = await getDoc(doc(db, "userDirectory", targetLumenId.toLowerCase()));
        }
        if (!dirSnap.exists() && targetLumenId !== targetLumenId.toUpperCase()) {
          dirSnap = await getDoc(doc(db, "userDirectory", targetLumenId.toUpperCase()));
        }
        if (dirSnap.exists()) {
          const dirData = dirSnap.data();
          if (typeof dirData.uid === "string" && dirData.uid) {
            resolvedUid = sanitizeId(dirData.uid);
          }
          if (typeof dirData.displayName === "string" && dirData.displayName) {
            resolvedName = dirData.displayName;
          }
        } else {
          toast.error(`User ID "@${targetLumenId}" does not exist.`);
          return;
        }
      } catch (err) {
        console.error("Directory lookup failed:", err);
      }
    }
    setFriendTargetId("");
    setFriendTargetName("");
    setNewChatOpen(false);
    await ensureConversationWithFriend(targetLumenId, resolvedName, resolvedUid);
    toast.success(`Started conversation with ${resolvedName}`);
  };

  const acceptFriendRequestAndStartConvo = async (req: FriendRequestItem) => {
    if (!user) return;
    const isIncoming =
      (req.toUid === user.uid || normalizeLumenId(req.toLumenId) === user.lumenId) &&
      req.fromUid !== user.uid;
    const friendLumenId = isIncoming ? req.fromLumenId : req.toLumenId;
    const friendName = isIncoming ? req.fromName : req.toName;
    const friendUid = isIncoming ? req.fromUid : req.toUid;

    // 1. Immediately update status in shared realtime store
    updateSharedFriendRequestStatus(req.id, "accepted");

    // 2. Update local state
    const updatedReqs = friendRequests.map((r) =>
      r.id === req.id ? { ...r, status: "accepted" as const } : r,
    );
    saveLocalFriendRequests(user.uid, updatedReqs);

    // 3. Update in Firestore when cloud-authenticated
    if (isCloud && req.status === "pending") {
      void updateDoc(doc(db, "friendRequests", req.id), {
        status: "accepted",
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }

    setNewChatOpen(false);
    await ensureConversationWithFriend(friendLumenId, friendName, friendUid);
    toast.success(`Connected with ${friendName} (${friendLumenId})`);
  };

  const removeFriendRequest = async (req: FriendRequestItem) => {
    if (!user) return;
    if (!isCloud) {
      saveLocalFriendRequests(
        user.uid,
        friendRequests.filter((r) => r.id !== req.id),
      );
      toast.success("Friend request removed");
      return;
    }
    const reqPath = `friendRequests/${req.id}`;
    try {
      await deleteDoc(doc(db, "friendRequests", req.id));
      toast.success("Friend request removed");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, reqPath);
    }
  };

  const deleteConversation = async (convId: string) => {
    if (!user) return;
    if (!isCloud) {
      const nextContacts = contacts.filter((c) => c.id !== convId);
      const nextMsgs = { ...messagesByChat };
      delete nextMsgs[convId];
      saveLocalContacts(user.uid, nextContacts);
      saveLocalMessages(user.uid, nextMsgs);
      if (activeId === convId) {
        setActiveId(nextContacts[0]?.id ?? null);
      }
      toast.success("Conversation removed");
      return;
    }
    const msgs = messagesByChat[convId] ?? [];
    for (const m of msgs) {
      const mPath = `conversations/${convId}/messages/${m.id}`;
      try {
        await deleteDoc(doc(db, "conversations", convId, "messages", m.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, mPath);
      }
    }
    const convPath = `conversations/${convId}`;
    try {
      await deleteDoc(doc(db, "conversations", convId));
      toast.success("Conversation removed");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, convPath);
    }
  };

  const clearConversationMessages = async (convId: string) => {
    if (!user) return;
    if (!isCloud) {
      const nextMsgs = { ...messagesByChat, [convId]: [] };
      const nextContacts = contacts.map((c) =>
        c.id === convId ? { ...c, lastMessageText: "", pinnedMsgId: undefined } : c,
      );
      saveLocalMessages(user.uid, nextMsgs);
      saveLocalContacts(user.uid, nextContacts);
      toast.success("Chat cleared");
      return;
    }
    const msgs = messagesByChat[convId] ?? [];
    for (const m of msgs) {
      const mPath = `conversations/${convId}/messages/${m.id}`;
      try {
        await deleteDoc(doc(db, "conversations", convId, "messages", m.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, mPath);
      }
    }
    const convPath = `conversations/${convId}`;
    try {
      await updateDoc(doc(db, "conversations", convId), {
        lastMessageText: "",
        pinnedMsgId: "",
        updatedAt: serverTimestamp(),
      });
      toast.success("Chat cleared");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, convPath);
    }
  };

  const togglePinConversation = async (conv: Contact) => {
    if (!user) return;
    if (!isCloud) {
      const nextContacts = contacts.map((c) =>
        c.id === conv.id ? { ...c, pinned: !c.pinned } : c,
      );
      saveLocalContacts(user.uid, nextContacts);
      return;
    }
    const convPath = `conversations/${conv.id}`;
    try {
      await updateDoc(doc(db, "conversations", conv.id), {
        pinned: !conv.pinned,
        unread: conv.unread ?? 0,
        pinnedMsgId: conv.pinnedMsgId ?? "",
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, convPath);
    }
  };

  const votePoll = async (msg: Msg, optionLabel: string) => {
    if (!active || !user) return;
    const hasVoted = msg.pollVotesRaw.includes(optionLabel);
    const nextVotes = hasVoted
      ? msg.pollVotesRaw.filter((l) => l !== optionLabel)
      : [...msg.pollVotesRaw, optionLabel].slice(0, BLUEPRINT_LIMITS.MAX_POLL_OPTIONS);

    if (!isCloud) {
      const updatedList = activeMsgs.map((m) => {
        if (m.id !== msg.id) return m;
        const poll: PollData | undefined = m.poll
          ? {
              question: m.poll.question,
              options: m.pollOptionsRaw.map((label, idx) => {
                const votedByMe = nextVotes.includes(label);
                return {
                  id: `opt-${idx}`,
                  label,
                  votes: votedByMe ? 1 : 0,
                  votedByMe,
                };
              }),
            }
          : undefined;
        return { ...m, pollVotesRaw: nextVotes, poll };
      });
      saveLocalMessages(user.uid, { ...messagesByChat, [active.id]: updatedList });
      return;
    }

    const msgPath = `conversations/${active.id}/messages/${msg.id}`;
    try {
      await updateDoc(doc(db, "conversations", active.id, "messages", msg.id), {
        pollVotes: nextVotes,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, msgPath);
    }
  };

  const toggleReaction = async (msgId: string, emoji: string, fromPopover = false) => {
    if (!active || !user) return;
    const targetMsg = activeMsgs.find((m) => m.id === msgId);
    if (!targetMsg) return;

    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(8);
      }
    } catch {
      // Ignore haptic errors on unsupported contexts
    }

    setPoppingReaction({ msgId, emoji });
    if (popTimerRef.current) clearTimeout(popTimerRef.current);

    if (fromPopover) {
      popTimerRef.current = setTimeout(() => {
        setReactionPopupMsgId(null);
        setMoreEmojisMsgId(null);
        setPoppingReaction(null);
      }, 150);
    } else {
      popTimerRef.current = setTimeout(() => {
        setPoppingReaction(null);
      }, 340);
    }

    const exists = targetMsg.reactionsRaw.includes(emoji);
    const nextReactions = exists
      ? targetMsg.reactionsRaw.filter((r) => r !== emoji)
      : [...targetMsg.reactionsRaw, emoji].slice(0, BLUEPRINT_LIMITS.MAX_REACTIONS);

    if (!isCloud) {
      const reactionsMap: Record<string, { count: number; me: boolean }> = {};
      for (const em of nextReactions) {
        reactionsMap[em] = { count: 1, me: true };
      }
      const updatedList = activeMsgs.map((m) =>
        m.id === msgId ? { ...m, reactionsRaw: nextReactions, reactions: reactionsMap } : m,
      );
      saveLocalMessages(user.uid, { ...messagesByChat, [active.id]: updatedList });
      return;
    }

    const msgPath = `conversations/${active.id}/messages/${msgId}`;
    try {
      await updateDoc(doc(db, "conversations", active.id, "messages", msgId), {
        reactions: nextReactions,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, msgPath);
    }
  };

  const togglePinMessage = async (msgId: string) => {
    if (!active || !user) return;
    const nextPinnedId = active.pinnedMsgId === msgId ? "" : msgId;
    setContextMenuMsgId(null);
    if (!isCloud) {
      const nextContacts = contacts.map((c) =>
        c.id === active.id ? { ...c, pinnedMsgId: nextPinnedId || undefined } : c,
      );
      saveLocalContacts(user.uid, nextContacts);
      return;
    }
    const convPath = `conversations/${active.id}`;
    try {
      await updateDoc(doc(db, "conversations", active.id), {
        pinned: Boolean(active.pinned),
        unread: active.unread ?? 0,
        pinnedMsgId: nextPinnedId,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, convPath);
    }
  };

  const deleteMessage = async (msgId: string) => {
    if (!active || !user) return;
    setContextMenuMsgId(null);
    if (!isCloud) {
      const updatedList = activeMsgs.filter((m) => m.id !== msgId);
      saveLocalMessages(user.uid, { ...messagesByChat, [active.id]: updatedList });
      if (active.pinnedMsgId === msgId) {
        const nextContacts = contacts.map((c) =>
          c.id === active.id ? { ...c, pinnedMsgId: undefined } : c,
        );
        saveLocalContacts(user.uid, nextContacts);
      }
      toast.success("Message deleted");
      return;
    }
    const msgPath = `conversations/${active.id}/messages/${msgId}`;
    try {
      await deleteDoc(doc(db, "conversations", active.id, "messages", msgId));
      if (active.pinnedMsgId === msgId) {
        await updateDoc(doc(db, "conversations", active.id), {
          pinned: Boolean(active.pinned),
          unread: active.unread ?? 0,
          pinnedMsgId: "",
          updatedAt: serverTimestamp(),
        });
      }
      toast.success("Message deleted");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, msgPath);
    }
  };

  const forwardMessageTo = async (targetContactId: string) => {
    if (!forwardingMsg || !active || !user) return;
    const target = contacts.find((c) => c.id === targetContactId);
    const msgToForward = forwardingMsg;
    setForwardingMsg(null);
    setContextMenuMsgId(null);

    await persistMessage(targetContactId, {
      kind: msgToForward.kind,
      text: msgToForward.text,
      attachment: msgToForward.attachment,
      audioUrl: msgToForward.audio,
      audioDuration: msgToForward.audioDuration,
      pollQuestion: msgToForward.poll?.question,
      pollOptions: msgToForward.pollOptionsRaw,
      forwardedFrom: msgToForward.me ? "You" : active.name,
    });
    toast.success(`Forwarded to ${target?.name ?? "conversation"}`);
  };

  const toggleRecord = async () => {
    if (!active || !user) return;
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: "audio/webm" });
        if (blob.size > 350 * 1024) {
          toast.error("Voice note is too long for Firestore document limit");
          return;
        }
        const dataUrl = await readBlobAsDataUrl(blob);
        const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const currentReplyId = replyTo?.id;
        setReplyTo(null);
        await persistMessage(active.id, {
          kind: "voice",
          audioUrl: dataUrl,
          audioDuration: durationSec,
          replyToId: currentReplyId,
        });
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      toast.error("Microphone permission is required to record voice notes");
    }
  };

  const list = useMemo(() => {
    return contacts.filter((c) => {
      if (folder === "unread" && !c.unread) return false;
      if (folder === "groups" && !c.isGroup) return false;
      if (!q.trim()) return true;
      const queryStr = q.toLowerCase();
      const chatMsgs = messagesByChat[c.id] ?? [];
      return (
        c.name.toLowerCase().includes(queryStr) ||
        c.handle.toLowerCase().includes(queryStr) ||
        c.lastMessageText.toLowerCase().includes(queryStr) ||
        chatMsgs.some((m) => m.text?.toLowerCase().includes(queryStr))
      );
    });
  }, [contacts, folder, q, messagesByChat]);

  const pinnedMessage = useMemo(
    () => activeMsgs.find((m) => m.id === active?.pinnedMsgId),
    [activeMsgs, active?.pinnedMsgId],
  );

  const visibleMessages = useMemo(() => {
    if (!threadQuery.trim()) return activeMsgs;
    const tq = threadQuery.toLowerCase();
    return activeMsgs.filter(
      (m) =>
        m.text?.toLowerCase().includes(tq) ||
        m.poll?.question.toLowerCase().includes(tq) ||
        m.attachment?.name.toLowerCase().includes(tq),
    );
  }, [activeMsgs, threadQuery]);

  const scrollToMessage = (id: string) => {
    const el = msgRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  if (authReady && !user) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-4">
        <GlassCard
          as="section"
          variant="panel"
          padding="lg"
          className="frost-panel flex max-w-md flex-col items-center text-center"
        >
          <div className="bg-pearl mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-glass-edge">
            <LogIn className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-light">Sign in to your workspace</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Connect with your Google account to create real conversations, groups, polls, and messages persisted in Cloud Firestore.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={async () => {
                try {
                  await signInWithGoogle();
                  toast.success("Signed in with Google");
                } catch {
                  toast.error("Google sign-in could not be completed");
                }
              }}
              className="btn-ink liquid-press inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-medium"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Continue with Google</span>
            </button>
            <Link
              to="/sign-in"
              className="glass-input liquid-press rounded-full px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Open sign-in page
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  const isGroupPopover = folder === "groups" || newChatMode === "group";

  return (
    <div
      onClick={() => {
        setContextMenuMsgId(null);
        setReactionPopupMsgId(null);
        setMoreEmojisMsgId(null);
      }}
      className="flex h-full min-h-0 flex-col gap-3 md:flex-row md:gap-4"
    >
      {/* Left Sidebar: Clean Minimalist Chat List */}
      <GlassCard
        as="section"
        variant="panel"
        padding="sm"
        className={`frost-panel relative flex h-full min-h-0 w-full flex-col md:w-72 lg:w-80 ${
          active ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="flex min-h-11 w-full items-center justify-between gap-2 pl-13 pr-1 sm:pl-14">
          <h1 className="min-w-0 truncate text-2xl sm:text-3xl">Messages</h1>
        </div>

        <div className="glass-input mt-3.5 flex items-center gap-2 rounded-xl px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            aria-label="Search contacts"
            className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Clean 3-Tab Filter */}
        <div className="mt-2.5 flex items-center gap-1 rounded-full bg-glass p-1 text-xs">
          {(
            [
              ["all", "All"],
              ["unread", "Unread"],
              ["groups", "Groups"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFolder(key);
                setNewChatMode(key === "groups" ? "group" : "friend");
              }}
              className={`flex-1 rounded-full py-1 font-medium transition-all ${
                folder === key
                  ? "btn-ink shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <div className="mt-6 flex flex-1 flex-col items-center justify-center px-4 pb-14 text-center">
            <p className="text-sm font-medium text-foreground/85">
              {folder === "groups" ? "No groups yet" : "No conversations yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {folder === "groups"
                ? "Tap the + button below to create a new group space."
                : "Tap the + button below to add a friend by User ID."}
            </p>
          </div>
        ) : (
          <ul className="glass-scroll mt-3 flex-1 space-y-1 overflow-y-auto pb-16 sm:mt-3.5">
            {list.map((c) => {
              const chatMsgs = messagesByChat[c.id] ?? [];
              const last = chatMsgs[chatMsgs.length - 1];
              const draftText = c.id !== activeId ? drafts[c.id]?.trim() : "";
              const lastPreview = last
                ? last.audio
                  ? "Voice message"
                  : last.poll
                    ? `Poll: ${last.poll.question}`
                    : last.attachment
                      ? `Attachment: ${last.attachment.name}`
                      : (last.text ?? "Message")
                : c.lastMessageText || "No messages yet";
              const displayTime = last?.time || c.lastMessageTime;
              const isOnline = resolveContactOnline(c);

              return (
                <li key={c.id}>
                  <button
                    onClick={() => selectContact(c.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors ${
                      c.id === activeId ? "bg-glass-strong" : "hover:bg-glass"
                    }`}
                  >
                    <Avatar name={c.name} online={isOnline} isGroup={c.isGroup} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{c.name}</span>
                          {!c.isGroup && (
                            <span
                              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                isOnline
                                  ? "bg-chart-2/15 text-chart-2"
                                  : "bg-glass text-muted-foreground"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isOnline ? "bg-chart-2" : "bg-faint"
                                }`}
                              />
                              <span>{isOnline ? "Online" : "Offline"}</span>
                            </span>
                          )}
                        </div>
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                          {last?.me && (
                            <LumenIcon
                              name={last.status === "sent" ? "sent" : "read"}
                              className="h-3 w-3 text-foreground/80"
                            />
                          )}
                          {c.pinned && (
                            <LumenIcon name="pin" className="h-3 w-3 text-foreground/70" />
                          )}
                          <span>{displayTime}</span>
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        {draftText ? (
                          <p className="truncate text-xs">
                            <span className="font-medium text-chart-5">Draft: </span>
                            <span className="text-muted-foreground">{draftText}</span>
                          </p>
                        ) : (
                          <p className="truncate text-xs text-muted-foreground">
                            {last?.me ? "You: " : ""}
                            {lastPreview}
                          </p>
                        )}
                        {c.unread ? (
                          <span className="btn-ink flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1.5 text-[10px] font-medium">
                            {c.unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Bottom-Right + Button */}
        <div className="absolute bottom-3.5 right-3.5 z-30">
          <button
            type="button"
            onClick={() => handleNewChatOpenChange(true)}
            title="New conversation & actions"
            aria-label="New conversation & actions"
            className="group glass settings-trigger-btn relative z-30 flex h-11 w-11 items-center justify-center rounded-full text-foreground/90 hover:text-foreground"
          >
            <Plus
              className={`h-5 w-5 transition-transform duration-300 ${
                newChatOpen ? "rotate-45" : "rotate-0"
              }`}
            />
          </button>
        </div>

        {/* Big Centered Modal Popup */}
        <RadixDialog.Root open={newChatOpen} onOpenChange={handleNewChatOpenChange}>
          <RadixDialog.Portal>
            <RadixDialog.Overlay className="workspace-nav-overlay fixed inset-0 z-[75] animate-in fade-in duration-200" />
            <RadixDialog.Content
              aria-describedby="new-chat-dialog-desc"
              className="settings-popover glass fixed left-1/2 top-1/2 z-[80] flex max-h-[88dvh] w-[min(94vw,42rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto glass-scroll rounded-[2.5rem] border border-glass-edge p-6 text-foreground outline-none shadow-2xl backdrop-blur-2xl sm:p-7"
            >
              {newChatMode === "menu" && (
                <div className="flex flex-col min-h-0">
                  <div className="flex items-center justify-between border-b border-glass-edge pb-4">
                    <div>
                      <RadixDialog.Title className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                        New conversation
                      </RadixDialog.Title>
                      <RadixDialog.Description id="new-chat-dialog-desc" className="mt-1 text-xs text-muted-foreground sm:text-sm">
                        Choose an action below to start collaborating
                      </RadixDialog.Description>
                    </div>
                    <RadixDialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Close"
                        title="Close"
                        className="settings-trigger-btn flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </RadixDialog.Close>
                  </div>

                  {/* Big Action Cards with custom emerald icons */}
                  <div className="space-y-3 pt-5">
                    <button
                      type="button"
                      onClick={() => setNewChatMode("group")}
                      className="group flex w-full items-center gap-4 rounded-2xl border border-glass-edge bg-glass/40 p-4 text-left transition-all hover:bg-glass hover:border-emerald-500/30 hover:shadow-md"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/25 transition-transform duration-200 group-hover:scale-110">
                        <Users className="h-6 w-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-foreground">New group</p>
                        <p className="text-xs text-muted-foreground sm:text-sm">Create a multi-member chat with team members</p>
                      </div>
                      <span className="text-muted-foreground group-hover:text-foreground text-sm font-medium">→</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewChatMode("friend")}
                      className="group flex w-full items-center gap-4 rounded-2xl border border-glass-edge bg-glass/40 p-4 text-left transition-all hover:bg-glass hover:border-emerald-500/30 hover:shadow-md"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/25 transition-transform duration-200 group-hover:scale-110">
                        <UserPlus className="h-6 w-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-foreground">New contact</p>
                        <p className="text-xs text-muted-foreground sm:text-sm">Add friend by Unique User ID (@LMN-...)</p>
                      </div>
                      <span className="text-muted-foreground group-hover:text-foreground text-sm font-medium">→</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewChatMode("announcement")}
                      className="group flex w-full items-center gap-4 rounded-2xl border border-glass-edge bg-glass/40 p-4 text-left transition-all hover:bg-glass hover:border-emerald-500/30 hover:shadow-md"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/25 transition-transform duration-200 group-hover:scale-110">
                        <Megaphone className="h-6 w-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-foreground">New announcement</p>
                        <p className="text-xs text-muted-foreground sm:text-sm">Broadcast updates and notices to the workspace</p>
                      </div>
                      <span className="text-muted-foreground group-hover:text-foreground text-sm font-medium">→</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Big Add Friend / Instagram Live User Search */}
              {newChatMode === "friend" && (
                <div className="flex flex-col min-h-0">
                  <div className="flex items-center justify-between border-b border-glass-edge pb-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setFriendTargetId("");
                          setLiveUserResults([]);
                          setNewChatMode("menu");
                        }}
                        aria-label="Back to menu"
                        className="settings-trigger-btn flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div>
                        <RadixDialog.Title className="text-xl font-semibold text-foreground sm:text-2xl">
                          Add Friend by User ID
                        </RadixDialog.Title>
                        <RadixDialog.Description className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                          Enter your friend's unique ID to send a direct friend request
                        </RadixDialog.Description>
                      </div>
                    </div>
                    <RadixDialog.Close asChild>
                      <button
                        type="button"
                        className="settings-trigger-btn flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </RadixDialog.Close>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">
                        Friend's User ID
                      </label>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" />
                        <input
                          value={friendTargetId}
                          onChange={(e) => setFriendTargetId(e.target.value)}
                          maxLength={BLUEPRINT_LIMITS.MAX_LUMEN_ID_LENGTH}
                          placeholder="e.g. LMN-CYXEJ4 or username"
                          aria-label="Friend's User ID or username"
                          autoFocus
                          className="glass-input h-12 w-full rounded-2xl pl-11 pr-10 text-sm font-mono outline-none ring-1 ring-emerald-500/35 transition-all focus:ring-emerald-500/80 placeholder:font-sans placeholder:text-muted-foreground/60 shadow-inner"
                        />
                        {friendTargetId && (
                          <button
                            type="button"
                            onClick={() => {
                              setFriendTargetId("");
                              setLiveUserResults([]);
                            }}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        User IDs are case-insensitive and allow private connections without sharing phone numbers or personal emails.
                      </p>
                    </div>

                    {/* Live Searching Indicator */}
                    {isSearchingLive && (
                      <div className="flex items-center gap-2 py-3 px-1 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                        <span>Searching directory for "{friendTargetId}"...</span>
                      </div>
                    )}

                    {/* Live Matching User Results - Instagram Searching Style */}
                    {liveUserResults.length > 0 && (
                      <div className="space-y-2.5 pt-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Matching Users ({liveUserResults.length})
                        </p>
                        <div className="space-y-2 max-h-[35vh] overflow-y-auto glass-scroll pr-1">
                          {liveUserResults.map((target) => {
                            const status = getFriendshipStatus(target);
                            return (
                              <div
                                key={target.lumenId || target.uid}
                                className="flex items-center justify-between gap-3 rounded-2xl border border-glass-edge bg-glass/40 p-3.5 transition-all hover:bg-glass/70 hover:border-emerald-500/30"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30 font-semibold text-emerald-400 text-sm">
                                    {target.displayName.slice(0, 2).toUpperCase()}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">
                                      {target.displayName}
                                    </p>
                                    <p className="truncate font-mono text-xs text-muted-foreground">
                                      {target.handle?.startsWith("@") ? target.handle : `@${target.lumenId}`}
                                    </p>
                                  </div>
                                </div>

                                <div className="shrink-0">
                                  {status === "connected" && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        handleNewChatOpenChange(false);
                                        await ensureConversationWithFriend(target.lumenId, target.displayName, target.uid);
                                      }}
                                      className="btn-ink rounded-full px-4 py-1.5 text-xs font-medium"
                                    >
                                      Message
                                    </button>
                                  )}
                                  {status === "requested" && (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1.5 text-xs font-medium text-emerald-400">
                                      <Check className="h-3.5 w-3.5" />
                                      Requested
                                    </span>
                                  )}
                                  {status === "incoming" && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const incomingReq = friendRequests.find(
                                          (r) =>
                                            r.status === "pending" &&
                                            (r.toUid === user?.uid || normalizeLumenId(r.toLumenId) === user?.lumenId) &&
                                            (normalizeLumenId(r.fromLumenId) === normalizeLumenId(target.lumenId) || r.fromUid === target.uid),
                                        );
                                        if (incomingReq) acceptFriendRequestAndStartConvo(incomingReq);
                                      }}
                                      className="btn-ink rounded-full px-4 py-1.5 text-xs font-medium"
                                    >
                                      Accept
                                    </button>
                                  )}
                                  {status === "none" && (
                                    <button
                                      type="button"
                                      onClick={() => handleSendFriendRequestToLiveUser(target)}
                                      className="btn-ink liquid-press inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium shadow-sm hover:scale-[1.02] active:scale-95 transition-all"
                                    >
                                      <UserPlus className="h-3.5 w-3.5" />
                                      <span>Send Request</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Direct Request Card if typed ID has no matches */}
                    {friendTargetId.trim().length >= 3 && !isSearchingLive && liveUserResults.length === 0 && (
                      <div className="rounded-2xl border border-glass-edge bg-glass/25 p-5 text-center">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive mb-2.5">
                          <XCircle className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-medium text-foreground">No user found with ID "{friendTargetId.trim()}"</p>
                        <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                          The User ID must match an existing registered account to appear in search and receive friend requests.
                        </p>
                      </div>
                    )}

                    {/* Empty State Prompt */}
                    {!friendTargetId.trim() && (
                      <div className="py-6 text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2.5">
                          <Search className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-medium text-foreground">Search for friends</p>
                        <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                          Enter a username or Unique User ID (@username, LMN-...) to find users and send friend requests lively.
                        </p>
                      </div>
                    )}

                    {/* Pending Incoming Friend Requests */}
                    {friendRequests.filter(
                      (r) => r.status === "pending" && (r.toUid === user?.uid || r.toLumenId === user?.lumenId)
                    ).length > 0 && (
                      <div className="mt-6 border-t border-glass-edge pt-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          Incoming Requests ({friendRequests.filter(
                            (r) => r.status === "pending" && (r.toUid === user?.uid || r.toLumenId === user?.lumenId)
                          ).length})
                        </h4>
                        <div className="space-y-2.5">
                          {friendRequests
                            .filter(
                              (r) => r.status === "pending" && (r.toUid === user?.uid || r.toLumenId === user?.lumenId)
                            )
                            .map((req) => (
                              <div
                                key={req.id}
                                className="flex items-center justify-between gap-3 rounded-2xl border border-glass-edge bg-glass/40 p-3.5"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-foreground">{req.fromName}</p>
                                  <p className="truncate font-mono text-xs text-muted-foreground">@{req.fromLumenId}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => acceptFriendRequestAndStartConvo(req)}
                                    className="btn-ink rounded-full px-3.5 py-1.5 text-xs font-medium"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeFriendRequest(req)}
                                    className="settings-trigger-btn flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                                    title="Decline"
                                    aria-label="Decline"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Big Create Group Form */}
              {newChatMode === "group" && (
                <div className="flex flex-col min-h-0">
                  <div className="flex items-center justify-between border-b border-glass-edge pb-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setNewChatMode("menu")}
                        aria-label="Back to menu"
                        className="settings-trigger-btn flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div>
                        <RadixDialog.Title className="text-xl font-semibold text-foreground sm:text-2xl">
                          Create New Group
                        </RadixDialog.Title>
                        <RadixDialog.Description className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                          Create a shared conversation space for your team or project
                        </RadixDialog.Description>
                      </div>
                    </div>
                    <RadixDialog.Close asChild>
                      <button
                        type="button"
                        className="settings-trigger-btn flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </RadixDialog.Close>
                  </div>

                  <form onSubmit={createNewChat} className="mt-6 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">
                        Group Name
                      </label>
                      <input
                        value={newChatName}
                        onChange={(e) => setNewChatName(e.target.value)}
                        maxLength={BLUEPRINT_LIMITS.MAX_NAME_LENGTH}
                        placeholder="e.g. Design Studio, Alpha Launch, Marketing"
                        required
                        autoFocus
                        className="glass-input h-12 w-full rounded-2xl px-4 text-sm outline-none placeholder:text-muted-foreground/60 ring-1 ring-glass-edge focus:ring-primary"
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        className="btn-ink liquid-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-medium"
                      >
                        <Users className="h-4 w-4" />
                        <span>Create Group</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Big Create Announcement Form */}
              {newChatMode === "announcement" && (
                <div className="flex flex-col min-h-0">
                  <div className="flex items-center justify-between border-b border-glass-edge pb-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setNewChatMode("menu")}
                        aria-label="Back to menu"
                        className="settings-trigger-btn flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div>
                        <RadixDialog.Title className="text-xl font-semibold text-foreground sm:text-2xl">
                          Create Announcement
                        </RadixDialog.Title>
                        <RadixDialog.Description className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                          Broadcast platform notes or security alerts to all workspace users
                        </RadixDialog.Description>
                      </div>
                    </div>
                    <RadixDialog.Close asChild>
                      <button
                        type="button"
                        className="settings-trigger-btn flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </RadixDialog.Close>
                  </div>

                  <form onSubmit={handlePublishAnnouncementFromPopup} className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-foreground mb-1.5">
                          Title
                        </label>
                        <input
                          value={announcementTitle}
                          onChange={(e) => setAnnouncementTitle(e.target.value)}
                          placeholder="e.g. Platform 2.5 Release Notes"
                          required
                          autoFocus
                          className="glass-input h-11 w-full rounded-xl px-3.5 text-xs outline-none placeholder:text-muted-foreground/60"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5">
                          Category
                        </label>
                        <select
                          value={announcementCategory}
                          onChange={(e) => setAnnouncementCategory(e.target.value as AnnouncementCategory)}
                          className="glass-input h-11 w-full rounded-xl px-3 text-xs text-foreground outline-none"
                        >
                          <option value="update">Platform Update</option>
                          <option value="feature">New Feature</option>
                          <option value="security">Security Notice</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">
                        Announcement Summary &amp; Details
                      </label>
                      <textarea
                        value={announcementSummary}
                        onChange={(e) => setAnnouncementSummary(e.target.value)}
                        placeholder="Write the message that will be broadcasted to all workspace inboxes..."
                        required
                        rows={4}
                        className="glass-input w-full resize-none rounded-xl p-3.5 text-xs outline-none placeholder:text-muted-foreground/60 leading-relaxed"
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        className="btn-ink liquid-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-medium"
                      >
                        <Megaphone className="h-4 w-4" />
                        <span>Broadcast Announcement</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>
      </GlassCard>

      {/* Right Chatting Bar */}
      {active ? (
        <GlassCard
          as="section"
          variant="panel"
          padding="none"
          className="frost-panel relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          {/* Minimalist Chat Header */}
          <header className="flex items-center justify-between gap-2 border-b border-glass-edge py-2.5 pl-13 pr-2.5 sm:gap-3 sm:py-3.5 sm:pl-16 sm:pr-5 md:pl-5">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <button
                type="button"
                aria-label="Back"
                onClick={() => setActiveId(null)}
                className="glass-input flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9 md:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <Avatar
                name={active.name}
                online={resolveContactOnline(active)}
                isGroup={active.isGroup}
              />
              <div className="min-w-[84px] flex-1">
                <p className="truncate text-sm font-medium leading-tight">{active.name}</p>
                {(() => {
                  const peerLumen =
                    active.peerLumenId ||
                    active.participantLumenIds?.find(
                      (id) =>
                        user && normalizeLumenId(id) !== normalizeLumenId(user.lumenId),
                    ) ||
                    active.role.toUpperCase().match(/LMN-[A-Z0-9]{4,10}/)?.[0] ||
                    "";
                  const isOtherTyping =
                    Boolean(active.typingUserId && active.typingUserId !== user?.uid) ||
                    Boolean(peerLumen && peerTypingByLumenId[normalizeLumenId(peerLumen)]) ||
                    Boolean(
                      localTypingByChatId[active.id] &&
                        localTypingByChatId[active.id] !== user?.uid,
                    );

                  if (isOtherTyping) {
                    return (
                      <p
                        data-testid="chat-header-typing"
                        className="truncate text-xs font-medium text-chart-2 animate-pulse"
                      >
                        User is typing...
                      </p>
                    );
                  }

                  return (
                    <p className="truncate text-xs text-muted-foreground">
                      {active.isGroup
                        ? `${active.memberCount ?? 3} members · ${active.role}`
                        : `${resolveContactOnline(active) ? "Online" : "Offline"} · ${active.handle}`}
                    </p>
                  );
                })()}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                aria-label="Voice call"
                title="Voice call"
                onClick={() => handleStartCall("audio")}
                className="glass-input liquid-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-glass-strong sm:h-10 sm:w-10"
              >
                <Phone className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Video call"
                title="Video call"
                onClick={() => handleStartCall("video")}
                className="glass-input liquid-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-glass-strong sm:h-10 sm:w-10"
              >
                <Video className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Search in conversation"
                title="Search in conversation"
                onClick={() => {
                  setThreadSearchOpen((o) => !o);
                  setThreadQuery("");
                }}
                className={`glass-input liquid-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-glass-strong sm:h-10 sm:w-10 ${
                  threadSearchOpen ? "btn-ink" : ""
                }`}
              >
                <Search className="h-4 w-4" />
              </button>

              <Popover open={mobileHeaderMenuOpen} onOpenChange={handleHeaderMenuOpenChange}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="More conversation options"
                    title="More options"
                    className={`group glass settings-trigger-btn relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/90 hover:text-foreground sm:h-10 sm:w-10 ${
                      mobileHeaderMenuOpen ? "bg-glass-strong" : ""
                    }`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="end"
                  sideOffset={10}
                  collisionPadding={12}
                  updatePositionStrategy="always"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  aria-label="Conversation options"
                  className="settings-popover glass z-[70] w-56 rounded-[1.5rem] p-2 text-xs text-foreground shadow-xl outline-none"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleHeaderMenuOpenChange(false);
                        setContactInfoOpen(true);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-glass-strong focus-visible:bg-glass-strong"
                    >
                      <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{active.isGroup ? "Group info" : "Contact info"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        togglePinConversation(active);
                        handleHeaderMenuOpenChange(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-glass-strong focus-visible:bg-glass-strong"
                    >
                      <LumenIcon name="pin" className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{active.pinned ? "Unpin conversation" : "Pin conversation"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleHeaderMenuOpenChange(false);
                        setActiveId(null);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-glass-strong focus-visible:bg-glass-strong"
                    >
                      <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>Close chat</span>
                    </button>

                    <div className="my-1 border-t border-glass-edge" />

                    <button
                      type="button"
                      onClick={() => {
                        handleHeaderMenuOpenChange(false);
                        handleStartCall("audio");
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-glass-strong focus-visible:bg-glass-strong"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>Voice call</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleHeaderMenuOpenChange(false);
                        handleStartCall("video");
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-glass-strong focus-visible:bg-glass-strong"
                    >
                      <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>Video call</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleHeaderMenuOpenChange(false);
                        setFolder("groups");
                        setNewChatMode("group");
                        handleNewChatOpenChange(true);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-glass-strong focus-visible:bg-glass-strong"
                    >
                      <LumenIcon name="group" className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>New group</span>
                    </button>

                    <div className="my-1 border-t border-glass-edge" />

                    <button
                      type="button"
                      onClick={() => {
                        handleHeaderMenuOpenChange(false);
                        void clearConversationMessages(active.id);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-glass-strong focus-visible:bg-glass-strong"
                    >
                      <MinusCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>Clear chat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleHeaderMenuOpenChange(false);
                        void deleteConversation(active.id);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-destructive outline-none transition-colors hover:bg-destructive/15 focus-visible:bg-destructive/15"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      <span>Delete chat</span>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </header>

          {/* In-Thread Search Bar */}
          {threadSearchOpen && (
            <div className="flex items-center gap-2 border-b border-glass-edge bg-glass px-4 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={threadQuery}
                onChange={(e) => setThreadQuery(e.target.value)}
                placeholder="Filter messages in this thread…"
                aria-label="Filter messages in this thread"
                autoFocus
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-faint"
              />
              <span className="text-[11px] text-muted-foreground">
                {visibleMessages.length} {visibleMessages.length === 1 ? "match" : "matches"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setThreadSearchOpen(false);
                  setThreadQuery("");
                }}
                aria-label="Close thread search"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Pinned Message Banner */}
          {pinnedMessage && (
            <div className="flex items-center justify-between gap-3 border-b border-glass-edge bg-glass/70 px-4 py-2 text-xs backdrop-blur-md">
              <button
                type="button"
                onClick={() => scrollToMessage(pinnedMessage.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                  <LumenIcon name="pin" className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Pinned Message
                  </span>
                  <span className="block truncate text-foreground/90">
                    {pinnedMessage.text ??
                      pinnedMessage.poll?.question ??
                      pinnedMessage.attachment?.name ??
                      "Voice note"}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => togglePinMessage(pinnedMessage.id)}
                aria-label="Unpin message"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Messages Stream */}
          <div className="glass-scroll flex-1 overflow-y-auto px-3.5 py-4 sm:px-6">
            {visibleMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <p className="text-sm font-medium text-foreground/80">No messages in this thread yet</p>
                <p className="mt-1 text-xs">
                  Send a message, voice note, file attachment, or live poll below.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleMessages.map((m, idx) => {
                  const prevMsg = idx > 0 ? visibleMessages[idx - 1] : undefined;
                  const showDateHeader = m.dateGroup && m.dateGroup !== prevMsg?.dateGroup;
                  const repliedMsg = m.replyToId
                    ? activeMsgs.find((x) => x.id === m.replyToId)
                    : undefined;
                  const reactionEntries = Object.entries(m.reactions ?? {});
                  const showReactionsPopup = reactionPopupMsgId === m.id;
                  const showMoreEmojis = moreEmojisMsgId === m.id;
                  const showContextMenu = contextMenuMsgId === m.id;
                  const totalVotes =
                    m.poll?.options.reduce((acc, o) => acc + o.votes, 0) ?? 0;

                  return (
                    <div key={m.id}>
                      {showDateHeader && (
                        <div className="my-3 flex justify-center">
                          <span className="glass rounded-full px-3.5 py-1 text-[11px] font-medium text-muted-foreground">
                            {m.dateGroup}
                          </span>
                        </div>
                      )}

                      <div
                        ref={(el) => {
                          msgRefs.current[m.id] = el;
                        }}
                        onMouseEnter={() => handleMsgMouseEnter(m.id)}
                        onMouseLeave={() => handleMsgMouseLeave(m.id)}
                        onDoubleClick={() => {
                          setReplyTo(m);
                          setEditingMsg(null);
                        }}
                        className={`group relative flex items-end gap-2 pt-2 ${
                          m.me ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`relative flex max-w-[85%] flex-col sm:max-w-[72%] ${
                            m.me ? "items-end" : "items-start"
                          }`}
                        >
                          {/* 2-Second Hover Reaction Popup Div */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`glass reaction-popover-pill absolute -top-11 z-30 flex items-center gap-1 rounded-full px-2.5 py-1 text-sm shadow-lg ${
                              m.me ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left"
                            } ${
                              showReactionsPopup
                                ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                                : "pointer-events-none translate-y-1.5 scale-90 opacity-0"
                            }`}
                          >
                            {PRIMARY_REACTIONS.map((r) => {
                              const isSelected = Boolean(m.reactions?.[r.emoji]?.me);
                              const isPopping =
                                poppingReaction?.msgId === m.id &&
                                poppingReaction?.emoji === r.emoji;
                              return (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  onClick={() => toggleReaction(m.id, r.emoji, true)}
                                  aria-pressed={isSelected}
                                  className={`reaction-emoji-btn relative flex h-7.5 w-7.5 items-center justify-center rounded-full text-base ${
                                    isSelected
                                      ? "bg-glass-strong ring-1 ring-foreground/25"
                                      : ""
                                  } ${isPopping ? "reaction-emoji-pop" : ""}`}
                                  title={r.label}
                                  aria-label={`React ${r.label}`}
                                >
                                  <span className="leading-none select-none">{r.emoji}</span>
                                  {isSelected && (
                                    <span
                                      aria-hidden="true"
                                      className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-foreground/75"
                                    />
                                  )}
                                </button>
                              );
                            })}
                            {showMoreEmojis &&
                              EXTRA_REACTIONS.map((r) => {
                                const isSelected = Boolean(m.reactions?.[r.emoji]?.me);
                                const isPopping =
                                  poppingReaction?.msgId === m.id &&
                                  poppingReaction?.emoji === r.emoji;
                                return (
                                  <button
                                    key={r.emoji}
                                    type="button"
                                    onClick={() => toggleReaction(m.id, r.emoji, true)}
                                    aria-pressed={isSelected}
                                    className={`reaction-emoji-btn relative flex h-7.5 w-7.5 items-center justify-center rounded-full text-base ${
                                      isSelected
                                        ? "bg-glass-strong ring-1 ring-foreground/25"
                                        : ""
                                    } ${isPopping ? "reaction-emoji-pop" : ""}`}
                                    title={r.label}
                                    aria-label={`React ${r.label}`}
                                  >
                                    <span className="leading-none select-none">{r.emoji}</span>
                                    {isSelected && (
                                      <span
                                        aria-hidden="true"
                                        className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-foreground/75"
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            <button
                              type="button"
                              onClick={() =>
                                setMoreEmojisMsgId((prev) => (prev === m.id ? null : m.id))
                              }
                              title={showMoreEmojis ? "Fewer emojis" : "More emojis"}
                              aria-label="More emojis"
                              className="reaction-emoji-btn flex h-7.5 w-7.5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                            >
                              <Plus
                                className={`h-3.5 w-3.5 transition-transform duration-300 ${
                                  showMoreEmojis ? "rotate-45" : ""
                                }`}
                              />
                            </button>
                          </div>

                          {/* Right-Click Context Menu */}
                          {showContextMenu && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`glass absolute top-full z-40 mt-1.5 flex w-44 flex-col gap-0.5 rounded-2xl p-1.5 text-xs shadow-2xl ${
                                m.me ? "right-0" : "left-0"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyTo(m);
                                  setEditingMsg(null);
                                  setContextMenuMsgId(null);
                                }}
                                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-glass-strong"
                              >
                                <LumenIcon name="reply" className="h-3.5 w-3.5" />
                                <span>Reply</span>
                              </button>
                              {m.me && m.text && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMsg(m);
                                    setReplyTo(null);
                                    setText(m.text ?? "");
                                    setContextMenuMsgId(null);
                                  }}
                                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-glass-strong"
                                >
                                  <LumenIcon name="edit" className="h-3.5 w-3.5" />
                                  <span>Edit</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => copyMessageText(m)}
                                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-glass-strong"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copy</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => togglePinMessage(m.id)}
                                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-glass-strong"
                              >
                                <LumenIcon name="pin" className="h-3.5 w-3.5" />
                                <span>{active.pinnedMsgId === m.id ? "Unpin" : "Pin"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setForwardingMsg(m);
                                  setContextMenuMsgId(null);
                                }}
                                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-glass-strong"
                              >
                                <LumenIcon name="forward" className="h-3.5 w-3.5" />
                                <span>Forward</span>
                              </button>
                              <div className="my-0.5 border-t border-glass-edge" />
                              <button
                                type="button"
                                onClick={() => deleteMessage(m.id)}
                                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-destructive hover:bg-destructive/15"
                              >
                                <LumenIcon name="trash" className="h-3.5 w-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}

                          {/* Message Bubble */}
                          <div
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenuMsgId(m.id);
                              setReactionPopupMsgId(null);
                            }}
                            className={`animate-liquid relative cursor-pointer rounded-3xl px-4 py-2.5 text-sm transition-shadow ${
                              m.me ? "btn-ink rounded-br-md" : "glass-input rounded-bl-md"
                            } ${showContextMenu ? "ring-2 ring-foreground/35" : ""}`}
                          >
                            {!m.me && m.senderName && (
                              <p className="mb-1 text-[11px] font-semibold opacity-80">
                                {m.senderName}
                              </p>
                            )}

                            {m.forwardedFrom && (
                              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] opacity-75">
                                <LumenIcon name="forward" className="h-3 w-3" />
                                <span>Forwarded from {m.forwardedFrom}</span>
                              </div>
                            )}

                            {repliedMsg && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  scrollToMessage(repliedMsg.id);
                                }}
                                className="mb-2 block w-full rounded-xl border-l-2 border-current bg-background/15 px-2.5 py-1 text-left text-xs opacity-85 hover:opacity-100"
                              >
                                <span className="block font-medium">
                                  {repliedMsg.me ? "You" : repliedMsg.senderName || active.name}
                                </span>
                                <span className="block truncate opacity-80">
                                  {repliedMsg.text ??
                                    repliedMsg.poll?.question ??
                                    repliedMsg.attachment?.name ??
                                    "Voice message"}
                                </span>
                              </button>
                            )}

                            {m.attachment && (
                              <div className="mb-2 overflow-hidden rounded-2xl border border-glass-edge bg-background/20">
                                {m.attachment.isImage ? (
                                  <img
                                    src={m.attachment.url}
                                    alt={m.attachment.name}
                                    className="max-h-56 w-full object-cover"
                                  />
                                ) : (
                                  <a
                                    href={m.attachment.url}
                                    download={m.attachment.name}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-3 p-3 text-xs hover:underline"
                                  >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-foreground/15">
                                      <LumenIcon name="attach" className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-medium">{m.attachment.name}</p>
                                      <p className="opacity-70">{m.attachment.size}</p>
                                    </div>
                                  </a>
                                )}
                              </div>
                            )}

                            {m.poll && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="my-1 min-w-[220px] space-y-2 sm:min-w-[260px]"
                              >
                                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider opacity-75">
                                  <LumenIcon name="poll" className="h-3.5 w-3.5" />
                                  <span>Poll · {totalVotes} votes</span>
                                </div>
                                <p className="font-medium">{m.poll.question}</p>
                                <div className="space-y-1.5 pt-1">
                                  {m.poll.options.map((opt) => {
                                    const pct =
                                      totalVotes > 0
                                        ? Math.round((opt.votes / totalVotes) * 100)
                                        : 0;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => votePoll(m, opt.label)}
                                        className="relative block w-full overflow-hidden rounded-xl border border-current/20 bg-background/15 px-3 py-2 text-left text-xs transition-transform active:scale-[0.99]"
                                      >
                                        <span
                                          aria-hidden="true"
                                          className="pointer-events-none absolute inset-y-0 left-0 bg-current/15 transition-all duration-500"
                                          style={{ width: `${pct}%` }}
                                        />
                                        <span className="relative flex items-center justify-between gap-2">
                                          <span className="flex items-center gap-1.5 font-medium">
                                            {opt.votedByMe && (
                                              <Check className="h-3.5 w-3.5 shrink-0" />
                                            )}
                                            <span>{opt.label}</span>
                                          </span>
                                          <span className="tabular-nums opacity-80">{pct}%</span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {m.audio ? (
                              <VoiceNotePlayer src={m.audio} duration={m.audioDuration ?? 5} />
                            ) : (
                              m.text && <p className="leading-relaxed break-words">{m.text}</p>
                            )}

                            <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] opacity-65">
                              {active.pinnedMsgId === m.id && (
                                <LumenIcon name="pin" className="h-2.5 w-2.5" />
                              )}
                              {m.edited && <span>edited</span>}
                              <span>{m.time}</span>
                              {m.me && (
                                <LumenIcon
                                  name={m.status === "sent" ? "sent" : "read"}
                                  className="h-3 w-3"
                                />
                              )}
                            </div>
                          </div>

                          {/* Reaction Chips */}
                          {reactionEntries.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {reactionEntries.map(([emoji, info]) => {
                                const isChipPopping =
                                  poppingReaction?.msgId === m.id &&
                                  poppingReaction?.emoji === emoji;
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    aria-pressed={info.me}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleReaction(m.id, emoji, false);
                                    }}
                                    className={`liquid-press inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${
                                      info.me
                                        ? "border-foreground/35 bg-glass-strong text-foreground shadow-[inset_0_1px_0_var(--glass-inner-shine)]"
                                        : "border-glass-edge bg-glass text-muted-foreground hover:text-foreground"
                                    } ${isChipPopping ? "reaction-chip-pop" : ""}`}
                                  >
                                    <span className="leading-none select-none">{emoji}</span>
                                    <span className="text-[11px] font-medium tabular-nums">
                                      {info.count}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {/* Active Reply or Edit Banner above Composer */}
          {(replyTo || editingMsg) && (
            <div className="flex items-center justify-between gap-2 border-t border-glass-edge bg-glass/80 px-4 py-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <LumenIcon
                  name={editingMsg ? "edit" : "reply"}
                  className="h-3.5 w-3.5 shrink-0 text-foreground"
                />
                <div className="min-w-0">
                  <span className="font-medium">
                    {editingMsg
                      ? "Editing message"
                      : `Replying to ${
                          replyTo?.me ? "yourself" : replyTo?.senderName || active.name
                        }`}
                  </span>
                  <p className="truncate text-muted-foreground">
                    {(editingMsg ?? replyTo)?.text ??
                      (editingMsg ?? replyTo)?.poll?.question ??
                      "Voice or media message"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReplyTo(null);
                  setEditingMsg(null);
                  if (editingMsg) setText("");
                }}
                aria-label="Cancel reply or edit"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Instagram-style Friend Request Gating Banner */}
          {friendshipLockState.locked && (
            <div className="border-t border-glass-edge bg-glass-strong/95 p-3.5 backdrop-blur-xl">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                    <UserPlus className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-foreground sm:text-sm">
                      {friendshipLockState.isIncoming
                        ? `${active.name} (@${active.peerLumenId}) sent you a friend request`
                        : `Friend request pending with ${active.name}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {friendshipLockState.isIncoming
                        ? "Accept to start messaging and view each other's full profile."
                        : "Messaging and profile details will unlock once they accept your request."}
                    </p>
                  </div>
                </div>

                {friendshipLockState.isIncoming && friendshipLockState.pendingReq && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => acceptFriendRequestAndStartConvo(friendshipLockState.pendingReq!)}
                      className="btn-ink liquid-press inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Accept Request</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFriendRequest(friendshipLockState.pendingReq!)}
                      className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Decline</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Clean Minimal Composer Bar */}
          <form onSubmit={send} className="relative flex items-center gap-1.5 p-2.5 sm:gap-2 sm:p-4">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
            />

            {composerMenuOpen && !friendshipLockState.locked && (
              <div className="glass absolute bottom-16 left-4 z-30 flex flex-col gap-1 rounded-2xl p-2 text-xs shadow-xl">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-glass-strong"
                >
                  <LumenIcon name="attach" className="h-4 w-4" />
                  <span>Attach Photo or File</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPollModalOpen(true);
                    setComposerMenuOpen(false);
                  }}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-glass-strong"
                >
                  <LumenIcon name="poll" className="h-4 w-4" />
                  <span>Create Poll</span>
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={friendshipLockState.locked}
              onClick={() => setComposerMenuOpen((o) => !o)}
              aria-label="Attach media or poll"
              title="Attach media or poll"
              className={`glass-input liquid-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11 md:h-12 md:w-12 disabled:opacity-40 disabled:cursor-not-allowed ${
                composerMenuOpen ? "btn-ink" : ""
              }`}
            >
              <LumenIcon name="attach" className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </button>

            <div className="glass-input flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full px-3.5 sm:h-11 sm:px-5 md:h-12">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => publishTypingStatus(active, false)}
                maxLength={BLUEPRINT_LIMITS.MAX_TEXT_LENGTH}
                placeholder={
                  friendshipLockState.locked
                    ? friendshipLockState.isIncoming
                      ? "Accept friend request above to message"
                      : "Waiting for friend to accept request..."
                    : recording
                      ? "Recording… tap stop to send"
                      : "Write a message…"
                }
                aria-label="Message"
                disabled={recording || friendshipLockState.locked}
                className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-faint disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <button
              type="button"
              disabled={friendshipLockState.locked}
              onClick={toggleRecord}
              aria-label={recording ? "Stop recording" : "Record voice message"}
              title={recording ? "Stop recording" : "Record voice note"}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11 md:h-12 md:w-12 disabled:opacity-40 disabled:cursor-not-allowed ${
                recording
                  ? "animate-pulse bg-destructive text-destructive-foreground"
                  : "glass-input"
              }`}
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="submit"
              disabled={friendshipLockState.locked}
              aria-label="Send"
              className="btn-ink liquid-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11 md:h-12 md:w-12 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </GlassCard>
      ) : (
        <GlassCard
          as="section"
          variant="panel"
          padding="md"
          className="frost-panel hidden flex-1 flex-col items-center justify-center text-center text-muted-foreground md:flex"
        >
          <p className="text-sm font-medium text-foreground/85">
            {contacts.length === 0 ? "Your workspace is ready" : "Select a conversation"}
          </p>
          <p className="mt-1 max-w-xs text-xs">
            {contacts.length === 0
              ? "Click the + button to start a new direct thread or group space stored in Cloud Firestore."
              : "Choose a conversation on the left to view messages."}
          </p>
        </GlassCard>
      )}

      {/* Forward Message Dialog */}
      {forwardingMsg && (
        <Dialog open onOpenChange={(o) => !o && setForwardingMsg(null)}>
          <DialogContent className="glass max-w-sm rounded-[2rem] border-0 bg-transparent p-6 text-foreground">
            <DialogTitle className="text-xl font-light">Forward Message</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Choose a conversation to forward this message.
            </DialogDescription>
            <div className="mt-3 space-y-1.5">
              {contacts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => forwardMessageTo(c.id)}
                  className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-glass-strong"
                >
                  <Avatar name={c.name} online={c.online} isGroup={c.isGroup} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.role}</p>
                  </div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Contact / Group Info Dialog */}
      {active && contactInfoOpen && (
        <Dialog open onOpenChange={(o) => !o && setContactInfoOpen(false)}>
          <DialogContent className="glass max-w-sm rounded-[2rem] border-0 bg-transparent p-6 text-foreground">
            <DialogTitle className="text-xl font-light">
              {active.isGroup ? "Group info" : "Contact info"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {active.isGroup
                ? `${active.memberCount ?? 3} members · ${active.role}`
                : `${resolveContactOnline(active) ? "Online" : "Offline"} · ${active.handle}`}
            </DialogDescription>
            <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-glass-edge bg-glass/60 p-4 text-center">
              <Avatar
                name={active.name}
                online={resolveContactOnline(active)}
                isGroup={active.isGroup}
              />
              <div>
                <p className="text-base font-medium">{active.name}</p>
                <p className="text-xs text-muted-foreground">{active.handle}</p>
              </div>
              {active.peerLumenId && (
                <div className="mt-1 flex items-center gap-2 rounded-full bg-glass px-3 py-1 text-xs">
                  <span className="font-mono">{active.peerLumenId}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.clipboard && active.peerLumenId) {
                        navigator.clipboard.writeText(active.peerLumenId).catch(() => {});
                      }
                      toast.success(`Copied User ID: ${active.peerLumenId}`);
                    }}
                    aria-label="Copy User ID"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Poll Dialog */}
      {pollModalOpen && (
        <Dialog open onOpenChange={(o) => !o && setPollModalOpen(false)}>
          <DialogContent className="glass max-w-md rounded-[2rem] border-0 bg-transparent p-6 text-foreground">
            <DialogTitle className="text-xl font-light">New Poll</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Ask a question and let participants vote in real time.
            </DialogDescription>
            <form onSubmit={createPoll} className="mt-3 space-y-3">
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.MAX_POLL_QUESTION_LENGTH}
                placeholder="Poll question…"
                required
                className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm outline-none placeholder:text-faint"
              />
              <div className="space-y-2">
                {pollOptions.map((opt, idx) => (
                  <input
                    key={idx}
                    value={opt}
                    onChange={(e) =>
                      setPollOptions((prev) =>
                        prev.map((item, i) => (i === idx ? e.target.value : item)),
                      )
                    }
                    maxLength={BLUEPRINT_LIMITS.MAX_POLL_OPTION_LENGTH}
                    placeholder={`Option ${idx + 1}`}
                    required={idx < 2}
                    className="glass-input w-full rounded-xl px-3.5 py-2 text-sm outline-none placeholder:text-faint"
                  />
                ))}
              </div>
              <div className="flex items-center justify-between pt-2">
                {pollOptions.length < 4 ? (
                  <button
                    type="button"
                    onClick={() => setPollOptions((prev) => [...prev, ""])}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    + Add option
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  className="btn-ink liquid-press rounded-full px-5 py-2 text-xs font-medium"
                >
                  Publish Poll
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {activeCallSession && user && (
        <LiveWebRTCCallModal
          session={activeCallSession}
          currentUser={{ uid: user.uid, name: user.name, lumenId: user.lumenId }}
          onClose={() => setActiveCallSession(null)}
        />
      )}

      {incomingCall && !activeCallSession && (
        <IncomingCallModal
          call={incomingCall}
          onAccept={() => {
            ringtone.stop();
            setActiveCallSession({
              convId: incomingCall.convId || incomingCall.id || "",
              kind: incomingCall.kind,
              peerName: incomingCall.callerName,
              peerLumenId: incomingCall.callerLumenId,
              peerUid: incomingCall.callerUid,
              isCaller: false,
              incomingData: incomingCall,
            });
            setIncomingCall(null);
          }}
          onDecline={() => {
            ringtone.stop();
            if (incomingCall.id) {
              void declineWebRTCCall(incomingCall.id);
            }
            setIncomingCall(null);
          }}
        />
      )}
    </div>
  );
}

function IncomingCallModal({
  call,
  onAccept,
  onDecline,
}: {
  call: CallDocData;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onDecline()}>
      <DialogContent className="glass max-w-sm rounded-[2.5rem] border-0 bg-transparent p-6 text-foreground shadow-2xl backdrop-blur-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4 flex items-center justify-center">
            <span className="absolute h-24 w-24 animate-ping rounded-full bg-chart-2/25" />
            <span className="absolute h-20 w-20 animate-pulse rounded-full bg-chart-2/40" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-glass-edge bg-glass text-xl font-medium shadow-lg">
              {call.callerName
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0]?.toUpperCase())
                .join("") || "U"}
            </div>
          </div>

          <DialogTitle className="text-xl font-medium tracking-tight">
            {call.callerName}
          </DialogTitle>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {call.callerLumenId ? `ID: ${call.callerLumenId}` : "Incoming call"}
          </p>
          <DialogDescription className="mt-2 text-xs font-medium text-chart-2 animate-pulse">
            {call.kind === "video" ? "Incoming Video Call…" : "Incoming Voice Call…"}
          </DialogDescription>

          <div className="mt-8 flex w-full items-center justify-center gap-6">
            <button
              type="button"
              onClick={onDecline}
              aria-label="Decline call"
              className="liquid-press flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={onAccept}
              aria-label="Accept call"
              className="liquid-press flex h-14 w-14 items-center justify-center rounded-full bg-chart-2 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              {call.kind === "video" ? (
                <Video className="h-6 w-6" />
              ) : (
                <Phone className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LiveWebRTCCallModal({
  session,
  currentUser,
  onClose,
}: {
  session: {
    convId: string;
    kind: "audio" | "video";
    peerName: string;
    peerLumenId?: string;
    peerUid?: string;
    isCaller: boolean;
    incomingData?: CallDocData;
  };
  currentUser: {
    uid: string;
    name: string;
    lumenId: string;
  };
  onClose: () => void;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const controlsRef = useRef<ActiveCallControls | null>(null);

  const [callStatus, setCallStatus] = useState<CallStatus>(
    session.isCaller ? "ringing" : "connected",
  );
  const [hasRemoteStream, setHasRemoteStream] = useState<boolean>(false);
  const [micMuted, setMicMuted] = useState<boolean>(false);
  const [camOff, setCamOff] = useState<boolean>(false);
  const [durationSec, setDurationSec] = useState<number>(0);

  // Call duration counter
  useEffect(() => {
    if (callStatus !== "connected") return;
    const interval = setInterval(() => {
      setDurationSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callStatus]);

  // WebRTC initiation / answer
  useEffect(() => {
    let isMounted = true;
    let controls: ActiveCallControls | null = null;

    const runCall = async () => {
      try {
        if (session.isCaller) {
          controls = await startWebRTCCall({
            convId: session.convId,
            caller: currentUser,
            callee: {
              uid: session.peerUid || session.convId,
              name: session.peerName,
              lumenId: session.peerLumenId || "",
            },
            kind: session.kind,
            onRemoteStream: (stream) => {
              if (!isMounted) return;
              setHasRemoteStream(true);
              if (session.kind === "video" && remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream;
              } else if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = stream;
              }
            },
            onStatusChange: (status) => {
              if (!isMounted) return;
              setCallStatus(status);
              if (status === "declined") {
                toast.info(`${session.peerName} declined call`);
                setTimeout(onClose, 1200);
              } else if (status === "ended") {
                toast.info("Call ended");
                setTimeout(onClose, 1200);
              }
            },
          });
        } else if (session.incomingData?.offer) {
          controls = await answerWebRTCCall({
            callId: session.incomingData.convId || session.incomingData.id || session.convId,
            offer: session.incomingData.offer,
            kind: session.kind,
            onRemoteStream: (stream) => {
              if (!isMounted) return;
              setHasRemoteStream(true);
              if (session.kind === "video" && remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream;
              } else if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = stream;
              }
            },
            onStatusChange: (status) => {
              if (!isMounted) return;
              setCallStatus(status);
              if (status === "ended") {
                toast.info("Call ended");
                setTimeout(onClose, 1200);
              }
            },
          });
        }

        if (!isMounted) {
          controls?.endCall();
          return;
        }

        controlsRef.current = controls;
        if (controls?.localStream && localVideoRef.current) {
          localVideoRef.current.srcObject = controls.localStream;
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Media device error";
        toast.error(msg);
        setTimeout(onClose, 1500);
      }
    };

    void runCall();

    return () => {
      isMounted = false;
      ringtone.stop();
      if (controlsRef.current) {
        controlsRef.current.endCall();
        controlsRef.current = null;
      }
    };
  }, [session]);

  const handleToggleMic = () => {
    if (controlsRef.current) {
      const active = controlsRef.current.toggleMic();
      setMicMuted(!active);
    }
  };

  const handleToggleCam = () => {
    if (controlsRef.current) {
      const active = controlsRef.current.toggleCam();
      setCamOff(!active);
    }
  };

  const handleEnd = () => {
    ringtone.stop();
    if (controlsRef.current) {
      controlsRef.current.endCall();
      controlsRef.current = null;
    }
    onClose();
  };

  const formatSec = (total: number) => {
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const statusLabel =
    callStatus === "ringing"
      ? session.isCaller
        ? "Calling… · Ringing peer"
        : "Connecting…"
      : callStatus === "connected"
        ? `Connected · ${formatSec(durationSec)} · Spatial HD`
        : callStatus === "declined"
          ? "Call declined"
          : "Call ended";

  return (
    <Dialog open onOpenChange={(o) => !o && handleEnd()}>
      <DialogContent className="glass max-w-lg rounded-[2.5rem] border-0 bg-transparent p-6 text-foreground shadow-2xl backdrop-blur-2xl">
        <DialogTitle className="text-center text-xl font-medium tracking-tight">
          {session.peerName}
        </DialogTitle>
        <DialogDescription className="text-center text-xs text-muted-foreground">
          {session.kind === "video" ? "Video Call" : "Voice Call"} · {statusLabel}
        </DialogDescription>

        {session.kind === "audio" && (
          <audio ref={remoteAudioRef} autoPlay />
        )}

        <div className="bg-pearl relative mt-3 flex aspect-video w-full items-center justify-center overflow-hidden rounded-3xl border border-glass-edge shadow-inner">
          {session.kind === "video" ? (
            <>
              {/* Remote Video Stream */}
              {hasRemoteStream ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative flex h-20 w-20 items-center justify-center">
                    <span className="absolute h-24 w-24 animate-ping rounded-full bg-chart-2/20" />
                    <Avatar name={session.peerName} online={callStatus === "connected"} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {callStatus === "connected" ? "Connecting video stream…" : "Waiting for peer to answer…"}
                  </span>
                </div>
              )}

              {/* Local Video Inset (Picture in Picture) */}
              <div className="absolute bottom-3 right-3 z-20 flex h-28 w-20 sm:h-32 sm:w-24 overflow-hidden rounded-2xl border border-glass-edge bg-background/80 shadow-xl">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`h-full w-full -scale-x-100 object-cover ${camOff ? "invisible" : ""}`}
                />
                {camOff && (
                  <div className="flex h-full w-full items-center justify-center bg-card text-[10px] text-muted-foreground">
                    Cam Off
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="relative flex h-20 w-20 items-center justify-center">
                {callStatus === "connected" && (
                  <span className="absolute h-24 w-24 animate-pulse rounded-full bg-chart-2/30" />
                )}
                <Avatar name={session.peerName} online={callStatus === "connected"} />
              </div>
              <span className="text-xs text-muted-foreground">{statusLabel}</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
            onClick={handleToggleMic}
            className={`liquid-press flex h-12 w-12 items-center justify-center rounded-full border border-glass-edge transition-all ${
              micMuted
                ? "bg-destructive/20 text-destructive"
                : "glass text-foreground hover:bg-glass-strong"
            }`}
          >
            {micMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          {session.kind === "video" && (
            <button
              type="button"
              aria-label={camOff ? "Turn camera on" : "Turn camera off"}
              onClick={handleToggleCam}
              className={`liquid-press flex h-12 w-12 items-center justify-center rounded-full border border-glass-edge transition-all ${
                camOff
                  ? "bg-destructive/20 text-destructive"
                  : "glass text-foreground hover:bg-glass-strong"
              }`}
            >
              {camOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </button>
          )}

          <button
            type="button"
            aria-label="End call"
            onClick={handleEnd}
            className="liquid-press flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
