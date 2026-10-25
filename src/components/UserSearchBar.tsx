import { useEffect, useState } from "react";
import { Search, X, MessageSquarePlus, UserPlus, Loader2 } from "lucide-react";
import type { AppUser } from "@/lib/auth";
import { searchUsersInFirestore, type DirectoryUser } from "@/lib/conversations";

type UserSearchBarProps = {
  currentUser: AppUser | null;
  onStartChat: (target: DirectoryUser) => Promise<void> | void;
  onSendFriendRequest?: ((target: DirectoryUser) => Promise<void> | void) | undefined;
  placeholder?: string;
  autoFocus?: boolean;
};

export function UserSearchBar({
  currentUser,
  onStartChat,
  onSendFriendRequest,
  placeholder = "Search users by display name or User ID…",
  autoFocus = false,
}: UserSearchBarProps) {
  const [queryText, setQueryText] = useState("");
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = queryText.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const matches = await searchUsersInFirestore(trimmed, currentUser);
        if (!cancelled) {
          setResults(matches);
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [queryText, currentUser]);

  const handleChatClick = async (u: DirectoryUser) => {
    setBusyId(u.lumenId);
    try {
      await onStartChat(u);
      setQueryText("");
      setResults([]);
    } finally {
      setBusyId(null);
    }
  };

  const handleRequestClick = async (u: DirectoryUser) => {
    if (!onSendFriendRequest) return;
    setBusyId(`req_${u.lumenId}`);
    try {
      await onSendFriendRequest(u);
      setQueryText("");
      setResults([]);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full space-y-2">
      <div className="glass-input flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-ring/40">
        {searching ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label="Search users by display name or unique user ID"
          className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        {queryText && (
          <button
            type="button"
            onClick={() => {
              setQueryText("");
              setResults([]);
            }}
            aria-label="Clear user search"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {queryText.trim().length >= 2 && (
        <div className="glass-scroll max-h-56 overflow-y-auto rounded-2xl border border-glass-edge bg-glass/60 p-1.5">
          {searching && results.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-muted-foreground">
              Searching users by name or User ID…
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-muted-foreground">
              No matching users found.
            </p>
          ) : (
            <ul className="space-y-1">
              {results.map((item) => {
                const initials =
                  item.displayName
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((s) => s[0]?.toUpperCase())
                    .join("") || "U";
                return (
                  <li
                    key={`${item.uid}_${item.lumenId}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-2.5 py-2 transition-colors hover:bg-glass-strong"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <div className="bg-pearl flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-glass-edge text-xs font-medium">
                        { initials }
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-medium text-foreground sm:text-sm">
                            {item.displayName}
                          </span>
                          <span className="shrink-0 rounded-full bg-glass px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground">
                            {item.lumenId}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {item.handle} · Verified User
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {onSendFriendRequest && (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => handleRequestClick(item)}
                          title="Send Friend Request"
                          className="glass-input liquid-press inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-glass-strong disabled:opacity-50"
                        >
                          <UserPlus className="h-3 w-3" />
                          <span>Request</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handleChatClick(item)}
                        className="btn-ink liquid-press inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium disabled:opacity-50"
                      >
                        <MessageSquarePlus className="h-3 w-3" />
                        <span>Start Chat</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
