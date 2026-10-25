import { useEffect, useState } from "react";
import {
  onDisconnect,
  onValue,
  ref,
  serverTimestamp as rtdbServerTimestamp,
  set,
} from "firebase/database";
import type { AuthUser } from "./auth";
import { normalizeLumenId, rtdb, sanitizeId } from "./firebase";

export type PresenceState = "online" | "offline";

export type PresenceRecord = {
  state: PresenceState;
  uid?: string;
  lumenId?: string;
  lastChanged?: number | object;
};

type PresenceMap = Record<string, PresenceState>;

const LOCAL_PRESENCE_KEY = "lumen.presence.v1";

function readLocalPresence(): PresenceMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_PRESENCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PresenceState>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalPresence(key: string, state: PresenceState) {
  if (typeof window === "undefined" || !key) return;
  try {
    const current = readLocalPresence();
    current[key] = state;
    window.localStorage.setItem(LOCAL_PRESENCE_KEY, JSON.stringify(current));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Integrates Firebase Realtime Database (`/status/{uid}` and `/statusByLumenId/{lumenId}`)
 * with `onDisconnect` and `.info/connected` to track and broadcast real-time online/offline
 * presence for chat users.
 */
export function useRealtimePresence(currentUser: AuthUser | null) {
  const [presenceByUid, setPresenceByUid] = useState<PresenceMap>({});
  const [presenceByLumenId, setPresenceByLumenId] = useState<PresenceMap>({});
  const [browserOnline, setBrowserOnline] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const initialSnap = readLocalPresence();
    setPresenceByUid((prev) => ({ ...initialSnap, ...prev }));
    setPresenceByLumenId((prev) => ({ ...initialSnap, ...prev }));
    if (typeof navigator !== "undefined") {
      setBrowserOnline(navigator.onLine !== false);
    }

    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);
    const handleStorage = () => {
      const snap = readLocalPresence();
      setPresenceByUid((prev) => ({ ...snap, ...prev }));
      setPresenceByLumenId((prev) => ({ ...snap, ...prev }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const uidKey = sanitizeId(currentUser.uid);
    const lumenKey = normalizeLumenId(currentUser.lumenId);

    const publishLocalState = (state: PresenceState) => {
      writeLocalPresence(uidKey, state);
      writeLocalPresence(lumenKey, state);
      setPresenceByUid((prev) => ({ ...prev, [uidKey]: state }));
      setPresenceByLumenId((prev) => ({ ...prev, [lumenKey]: state }));
    };

    publishLocalState(browserOnline ? "online" : "offline");

    if (!rtdb) {
      return () => {
        publishLocalState("offline");
      };
    }

    let unsubConnected: (() => void) | undefined;
    let unsubStatusUid: (() => void) | undefined;
    let unsubStatusLumen: (() => void) | undefined;

    const userStatusRef = ref(rtdb, `status/${uidKey}`);
    const lumenStatusRef = ref(rtdb, `statusByLumenId/${lumenKey}`);
    const connectedRef = ref(rtdb, ".info/connected");

    const setRtdbPresence = (state: PresenceState) => {
      const payload: PresenceRecord = {
        state,
        uid: uidKey,
        lumenId: lumenKey,
        lastChanged: rtdbServerTimestamp(),
      };
      void set(userStatusRef, payload).catch(() => {});
      void set(lumenStatusRef, payload).catch(() => {});
    };

    try {
      unsubConnected = onValue(
        connectedRef,
        (snap) => {
          if (snap.val() === false) {
            publishLocalState("offline");
            return;
          }
          const offlinePayload: PresenceRecord = {
            state: "offline",
            uid: uidKey,
            lumenId: lumenKey,
            lastChanged: rtdbServerTimestamp(),
          };
          void onDisconnect(userStatusRef)
            .set(offlinePayload)
            .then(() => {
              setRtdbPresence("online");
              publishLocalState("online");
            })
            .catch(() => {
              publishLocalState(browserOnline ? "online" : "offline");
            });
          void onDisconnect(lumenStatusRef).set(offlinePayload).catch(() => {});
        },
        () => {
          publishLocalState(browserOnline ? "online" : "offline");
        },
      );

      unsubStatusUid = onValue(
        ref(rtdb, "status"),
        (snap) => {
          const val = snap.val() as Record<string, PresenceRecord> | null;
          if (!val || typeof val !== "object") return;
          const nextMap: PresenceMap = {};
          for (const [k, record] of Object.entries(val)) {
            if (record && typeof record === "object") {
              nextMap[k] = record.state === "online" ? "online" : "offline";
            }
          }
          setPresenceByUid((prev) => ({ ...prev, ...nextMap }));
        },
        () => {},
      );

      unsubStatusLumen = onValue(
        ref(rtdb, "statusByLumenId"),
        (snap) => {
          const val = snap.val() as Record<string, PresenceRecord> | null;
          if (!val || typeof val !== "object") return;
          const nextMap: PresenceMap = {};
          for (const [k, record] of Object.entries(val)) {
            if (record && typeof record === "object") {
              nextMap[normalizeLumenId(k)] = record.state === "online" ? "online" : "offline";
            }
          }
          setPresenceByLumenId((prev) => ({ ...prev, ...nextMap }));
        },
        () => {},
      );
    } catch {
      // Fallback to local state if RTDB is unreachable
    }

    const handleVisibility = () => {
      if (typeof document === "undefined") return;
      const nextState: PresenceState =
        document.visibilityState === "hidden" || !navigator.onLine ? "offline" : "online";
      publishLocalState(nextState);
      setRtdbPresence(nextState);
    };

    const handleBeforeUnload = () => {
      publishLocalState("offline");
      setRtdbPresence("offline");
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      }
      unsubConnected?.();
      unsubStatusUid?.();
      unsubStatusLumen?.();
      setRtdbPresence("offline");
      publishLocalState("offline");
    };
  }, [currentUser, browserOnline]);

  const resolveContactOnline = (contact: {
    id: string;
    isGroup?: boolean;
    online?: boolean;
    peerUserId?: string;
    peerLumenId?: string;
    participantIds?: string[];
    participantLumenIds?: string[];
    handle?: string;
    role?: string;
  }): boolean => {
    if (!browserOnline) return false;
    if (contact.isGroup) return true;

    if (contact.peerUserId && presenceByUid[contact.peerUserId]) {
      return presenceByUid[contact.peerUserId] === "online";
    }

    if (contact.peerLumenId) {
      const norm = normalizeLumenId(contact.peerLumenId);
      if (presenceByLumenId[norm]) {
        return presenceByLumenId[norm] === "online";
      }
    }

    if (contact.participantIds && currentUser) {
      const otherUid = contact.participantIds.find((id) => id !== currentUser.uid);
      if (otherUid && presenceByUid[otherUid]) {
        return presenceByUid[otherUid] === "online";
      }
    }

    if (contact.participantLumenIds && currentUser) {
      const otherLumen = contact.participantLumenIds.find(
        (id) => normalizeLumenId(id) !== normalizeLumenId(currentUser.lumenId),
      );
      if (otherLumen && presenceByLumenId[normalizeLumenId(otherLumen)]) {
        return presenceByLumenId[normalizeLumenId(otherLumen)] === "online";
      }
    }

    if (contact.role) {
      const match = contact.role.toUpperCase().match(/LMN-[A-Z0-9]{4,10}/);
      if (match && presenceByLumenId[match[0]]) {
        return presenceByLumenId[match[0]] === "online";
      }
    }

    return Boolean(contact.online);
  };

  return {
    presenceByUid,
    presenceByLumenId,
    browserOnline,
    resolveContactOnline,
  };
}
