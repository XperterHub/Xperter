import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Copy,
  Mail,
  MessageSquare,
  Pencil,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { UniqueUsernameField } from "@/components/auth/UniqueUsernameField";
import {
  checkUsernameAvailability,
  updateUserProfile,
  useAuthState,
  type UsernameAvailabilityStatus,
} from "@/lib/auth";
import {
  formatVaultDocumentFileName,
  formatVaultFolderName,
  checkUsernameRenameEligibility,
  recordUsernameRename,
} from "@/lib/username-id";
import { loadVaultDocuments, saveVaultDocuments } from "@/lib/google-drive-vault";

export function computeRealUserStats(uid: string) {
  if (typeof window === "undefined") {
    return { friendsCount: 0, postsCount: 0 };
  }
  let friendsCount = 0;
  let postsCount = 0;

  try {
    const directChatIds = new Set<string>();

    const rawChats = window.localStorage.getItem(`lumen.chats.${uid}`);
    if (rawChats) {
      const chats = JSON.parse(rawChats);
      if (Array.isArray(chats)) {
        for (const c of chats) {
          if (!c.isGroup && c.id) {
            directChatIds.add(c.id);
          }
        }
      }
    }

    const rawReqs = window.localStorage.getItem(`lumen.requests.${uid}`);
    if (rawReqs) {
      const reqs = JSON.parse(rawReqs);
      if (Array.isArray(reqs)) {
        for (const r of reqs) {
          if (r.status === "accepted") {
            const friendId = r.fromUid === uid ? r.toUid || r.toLumenId : r.fromUid || r.fromLumenId;
            if (friendId) directChatIds.add(friendId);
          }
        }
      }
    }

    const rawInboxFreq = window.localStorage.getItem("lumen.inbox.localFriendRequests");
    if (rawInboxFreq) {
      const inboxReqs = JSON.parse(rawInboxFreq);
      if (Array.isArray(inboxReqs)) {
        for (const r of inboxReqs) {
          if (r.status === "accepted") {
            const friendId = r.fromUid === uid ? r.toUid || r.toLumenId : r.fromUid || r.fromLumenId;
            if (friendId) directChatIds.add(friendId);
          }
        }
      }
    }

    friendsCount = directChatIds.size;
  } catch {
    friendsCount = 0;
  }

  try {
    const rawUserPosts = window.localStorage.getItem(`lumen.posts.${uid}`);
    if (rawUserPosts) {
      const userPosts = JSON.parse(rawUserPosts);
      if (Array.isArray(userPosts)) {
        postsCount += userPosts.length;
      }
    } else {
      const rawAllPosts = window.localStorage.getItem("lumen.posts");
      if (rawAllPosts) {
        const allPosts = JSON.parse(rawAllPosts);
        if (Array.isArray(allPosts)) {
          postsCount += allPosts.filter((p: any) => p?.authorUid === uid || p?.uid === uid).length;
        }
      }
    }

    const rawAnnouncements = window.localStorage.getItem("lumen.inbox.customAnnouncements");
    if (rawAnnouncements) {
      const announcements = JSON.parse(rawAnnouncements);
      if (Array.isArray(announcements)) {
        postsCount += announcements.filter(
          (a: any) => a?.authorUid === uid || a?.authorId === uid,
        ).length;
      }
    }
  } catch {
    postsCount = 0;
  }

  return { friendsCount, postsCount };
}

export function ProfileCard({ className = "" }: { className?: string }) {
  const { user } = useAuthState();
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const effectiveUid = user?.uid || "usr_guest_profile";
  const currentUsername = user?.lumenId || "nagaraj_98";
  const currentDisplayName = user?.name || "Nagaraj P S";
  const currentEmail = user?.email || "user@lumen.app";

  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [editName, setEditName] = useState(currentDisplayName);
  const [editUsername, setEditUsername] = useState(currentUsername);
  const [editPhotoURL, setEditPhotoURL] = useState(user?.photoURL || "");
  const [editAbout, setEditAbout] = useState(() => {
    if (user?.about) return user.about;
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(`lumen.profile.about.${effectiveUid}`) || "";
    }
    return "";
  });
  const [availability, setAvailability] = useState<UsernameAvailabilityStatus | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const renameEligibility = useMemo(() => {
    return checkUsernameRenameEligibility(effectiveUid);
  }, [effectiveUid, isEditingProfile]);

  const realStats = useMemo(() => {
    return computeRealUserStats(effectiveUid);
  }, [effectiveUid, user?.lumenId]);

  useEffect(() => {
    if (user) {
      setEditName(user.name);
      setEditUsername(user.lumenId);
      setEditPhotoURL(user.photoURL || "");
      setEditAbout(
        user.about ||
          (typeof window !== "undefined"
            ? window.localStorage.getItem(`lumen.profile.about.${user.uid}`) || ""
            : ""),
      );
    }
  }, [user?.uid, user?.name, user?.lumenId, user?.photoURL, user?.about]);

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Please select an image smaller than 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditPhotoURL(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = editName.trim();
    if (!cleanName) {
      toast.error("Please enter your display name");
      return;
    }

    setSavingProfile(true);
    try {
      const check = await checkUsernameAvailability(editUsername, effectiveUid, cleanName);
      setAvailability(check);
      if (!check.available) {
        toast.error(check.message);
        setSavingProfile(false);
        return;
      }

      const isRenaming = check.normalized !== currentUsername;
      if (isRenaming) {
        const eligibility = checkUsernameRenameEligibility(effectiveUid);
        if (!eligibility.canRename) {
          toast.error(
            `You can only change your Username ID 3 times within a 2-week period. Next change available in ${eligibility.daysUntilNextReset ?? 14} day(s).`,
          );
          setSavingProfile(false);
          return;
        }
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(`lumen.profile.about.${effectiveUid}`, editAbout.trim());
      }

      if (user) {
        await updateUserProfile({
          name: cleanName,
          lumenId: check.normalized,
          photoURL: editPhotoURL,
          about: editAbout.trim(),
        });
      }

      if (isRenaming) {
        recordUsernameRename(effectiveUid);
      }

      // Automatically update all stored vault document filenames to match the new `<username>_doc` prefix
      const currentVaultDocs = loadVaultDocuments(effectiveUid);
      const updatedDocs = currentVaultDocs.map((item) => {
        const renamed = formatVaultDocumentFileName(
          check.normalized,
          item.docKey,
          item.originalFileName || item.renamedFileName,
          item.customTitle,
        );
        return {
          ...item,
          driveFolderName: formatVaultFolderName(check.normalized),
          baseFileName: renamed.baseName,
          renamedFileName: renamed.fullFileName,
        };
      });
      saveVaultDocuments(effectiveUid, updatedDocs);

      toast.success(`Profile updated · ID: ${check.normalized}`);
      setIsEditingProfile(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <GlassCard
      variant="panel"
      padding="md"
      className={`frost-panel relative overflow-visible space-y-6 ${className}`}
    >
      {/* Hero Section: Avatar & Real Instagram/WhatsApp Counters Strip */}
      <div className="flex flex-col items-center pt-2">
        {/* Circular Avatar with Camera overlay (Camera ONLY appears when in edit section) */}
        <div className="relative">
          <div className="rounded-full p-1 bg-gradient-to-tr from-primary/40 via-emerald-500/25 to-primary/50 shadow-md">
            {editPhotoURL ? (
              <img
                src={editPhotoURL}
                alt={editName}
                referrerPolicy="no-referrer"
                className="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover border-2 border-glass-edge"
              />
            ) : (
              <div className="btn-ink flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full text-2xl font-bold shadow-sm">
                {(editName?.[0] || "U").toUpperCase()}
              </div>
            )}
          </div>

          {/* Camera Icon Button: ONLY in edit section */}
          {isEditingProfile && (
            <button
              type="button"
              onClick={() => avatarFileInputRef.current?.click()}
              aria-label="Upload profile photo"
              title="Change photo"
              className="btn-ink liquid-press absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background shadow-md hover:scale-105 transition-transform"
            >
              <Camera className="h-4 w-4" />
            </button>
          )}

          <input
            ref={avatarFileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarFileSelect}
            className="hidden"
          />
        </div>

        {/* In Edit Section: Reset photo chip if custom photo exists */}
        {isEditingProfile && editPhotoURL && (
          <button
            type="button"
            onClick={() => setEditPhotoURL("")}
            className="mt-2 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Reset photo
          </button>
        )}

        {/* Heading Display Name & Handle */}
        <div className="mt-3 text-center">
          <h1 className="text-lg font-bold text-foreground tracking-tight sm:text-xl">
            {editName || "User"}
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            @{editUsername || "username"}
          </p>
          {/* Clean About display in view mode */}
          {!isEditingProfile && editAbout.trim() && (
            <div className="mt-2 text-xs text-foreground/80 max-w-sm px-3.5 py-1 rounded-xl border border-glass-edge/40 bg-glass/20 italic">
              "{editAbout}"
            </div>
          )}
        </div>

        {/* Real Counters Strip: Friends & Posts (Real calculated numbers, no fake datas) */}
        <div className="mt-4 flex items-center justify-center gap-8 rounded-2xl border border-glass-edge bg-glass/40 px-8 py-2.5 text-center shadow-xs">
          <div>
            <span className="block text-base font-bold text-foreground font-mono">
              {realStats.friendsCount}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">Friends</span>
          </div>
          <div className="h-6 w-px bg-glass-edge" />
          <div>
            <span className="block text-base font-bold text-foreground font-mono">
              {realStats.postsCount}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">Posts</span>
          </div>
        </div>
      </div>

      {/* Form / Details Section */}
      {isEditingProfile ? (
        /* WhatsApp-Style Form Fields (Edit mode) */
        <form onSubmit={handleSaveProfile} className="space-y-4 pt-1">
          <div className="space-y-3.5 rounded-2xl border border-glass-edge bg-glass/30 p-4">
            {/* Name Field */}
            <div className="space-y-1">
              <label
                htmlFor="profile-display-name"
                className="flex items-center gap-1.5 text-xs font-medium text-foreground"
              >
                <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Name</span>
              </label>
              <div className="relative">
                <input
                  id="profile-display-name"
                  data-testid="profile-name-input"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your full display name"
                  className="glass-input h-10 w-full rounded-xl pl-3.5 pr-9 text-xs outline-none focus:ring-1 focus:ring-primary/40 font-sans"
                />
                <Pencil className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                This name will be visible to your contacts and team members.
              </p>
            </div>

            {/* About Field */}
            <div className="space-y-1">
              <label
                htmlFor="profile-about"
                className="flex items-center gap-1.5 text-xs font-medium text-foreground"
              >
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span>About</span>
              </label>
              <div className="relative">
                <input
                  id="profile-about"
                  data-testid="profile-about-input"
                  type="text"
                  value={editAbout}
                  onChange={(e) => setEditAbout(e.target.value)}
                  placeholder="e.g. 🌊 Be CLaSsIc"
                  className="glass-input h-10 w-full rounded-xl pl-3.5 pr-9 text-xs outline-none focus:ring-1 focus:ring-primary/40 font-sans"
                />
                <Pencil className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Your personal status and bio description.
              </p>
            </div>

            {/* Username ID Field */}
            <div className="space-y-1 pt-1">
              <UniqueUsernameField
                value={editUsername}
                onChange={setEditUsername}
                currentUid={effectiveUid}
                seedHint={editName || currentEmail.split("@")[0] || "lumen"}
                onAvailabilityChange={setAvailability}
                compact
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5 pt-1">
                <span>
                  Renames remaining:{" "}
                  <strong
                    className={
                      renameEligibility.renamesRemaining === 0
                        ? "font-mono font-bold text-rose-500"
                        : "font-mono font-bold text-emerald-500"
                    }
                  >
                    {renameEligibility.renamesRemaining} of {renameEligibility.totalAllowed}
                  </strong>{" "}
                  (2-week period)
                </span>
                {renameEligibility.daysUntilNextReset && renameEligibility.renamesRemaining < 3 && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Resets in {renameEligibility.daysUntilNextReset}d
                  </span>
                )}
              </div>
            </div>

            {/* Account Email */}
            <div className="flex items-center justify-between rounded-xl border border-glass-edge bg-glass/40 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="block text-[11px] text-muted-foreground">Account Email</span>
                  <span className="font-mono text-xs text-foreground truncate max-w-[220px]">
                    {currentEmail}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(currentEmail);
                  toast.success("Email copied to clipboard");
                }}
                title="Copy email"
                className="glass-pill liquid-press rounded-full p-1.5 text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              data-testid="save-profile-btn"
              disabled={savingProfile || availability?.available === false}
              className="btn-ink liquid-press flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-xs font-semibold disabled:opacity-50 shadow-md"
            >
              <Check className="h-4 w-4" />
              <span>{savingProfile ? "Saving…" : "Save Changes"}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditingProfile(false)}
              className="glass-pill liquid-press rounded-full px-5 h-10 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        /* View Mode: Clean identity summary cards & Edit button */
        <div className="space-y-4 pt-1">
          <div className="space-y-2.5 rounded-2xl border border-glass-edge bg-glass/30 p-4">
            <div className="flex items-center justify-between border-b border-glass-edge/50 pb-2.5 text-xs">
              <div>
                <span className="text-muted-foreground">Username ID</span>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {renameEligibility.renamesRemaining} of {renameEligibility.totalAllowed} renames left (2w)
                </div>
              </div>
              <span className="font-mono font-medium text-foreground">@{editUsername || currentUsername}</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-0.5">
              <span className="text-muted-foreground">Account Email</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-foreground">{currentEmail}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(currentEmail);
                    toast.success("Email copied to clipboard");
                  }}
                  title="Copy email"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Instagram-style Edit Profile Pill Button */}
          <button
            type="button"
            onClick={() => setIsEditingProfile(true)}
            className="btn-ink liquid-press flex h-9.5 w-full items-center justify-center gap-2 rounded-full text-xs font-semibold shadow-sm"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Edit Profile</span>
          </button>
        </div>
      )}
    </GlassCard>
  );
}
