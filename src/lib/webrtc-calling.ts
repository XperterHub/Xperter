import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db, normalizeLumenId, sanitizeId } from "@/lib/firebase";
import {
  connectCallCloudRelay,
  publishToCloudRelay,
  subscribeToRealtimeEvents,
} from "@/lib/realtime-sync";

export type CallKind = "audio" | "video";
export type CallStatus = "ringing" | "connected" | "ended" | "declined";

export interface CallDocData {
  id?: string;
  convId: string;
  callerUid: string;
  callerName: string;
  callerLumenId: string;
  calleeUid: string;
  calleeName: string;
  calleeLumenId: string;
  kind: CallKind;
  status: CallStatus;
  offer?: { sdp: string; type: string };
  answer?: { sdp: string; type: string };
  createdAtMs: number;
}

export interface ActiveCallControls {
  endCall: () => void;
  toggleMic: (enabled?: boolean) => boolean;
  toggleCam: (enabled?: boolean) => boolean;
  localStream: MediaStream | null;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

// Web Audio API synthesized ringing tone generator (zero external assets needed)
class RingtonePlayer {
  private ctx: AudioContext | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  startRinging() {
    this.stop();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      const playBeep = () => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(480, this.ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
      };
      playBeep();
      this.intervalId = setInterval(playBeep, 2400);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ctx) {
      try {
        void this.ctx.close();
      } catch {}
      this.ctx = null;
    }
  }
}

export const ringtone = new RingtonePlayer();

/**
 * Listens for incoming calls targeting the authenticated user across both
 * cloud pub/sub relay and Firestore.
 */
export function listenForIncomingCalls(
  myUid: string,
  onIncoming: (call: CallDocData | null) => void,
  myLumenId?: string,
): () => void {
  if (!myUid && !myLumenId) return () => {};

  const cleanMyUid = sanitizeId(myUid).toLowerCase();
  const normMyLumen = normalizeLumenId(myLumenId || "").toLowerCase();

  // 1. Listen via instant cloud relay pub/sub
  const unsubRelay = subscribeToRealtimeEvents((event) => {
    if (event.type !== "CALL_SIGNAL") return;
    const sig = event.signal;
    if (!sig) return;

    if (sig.type === "offer" && sig.status === "ringing") {
      const targetUid = sanitizeId(sig.calleeUid || "").toLowerCase();
      const targetLumen = normalizeLumenId(sig.calleeLumenId || "").toLowerCase();
      const isTarget =
        (cleanMyUid && (targetUid === cleanMyUid || targetUid === `usr_${normMyLumen}`)) ||
        (normMyLumen && targetLumen === normMyLumen);

      if (isTarget) {
        if (Date.now() - (sig.createdAtMs || 0) < 45000) {
          ringtone.startRinging();
          onIncoming({
            id: sig.convId,
            convId: sig.convId,
            callerUid: sig.callerUid,
            callerName: sig.callerName,
            callerLumenId: sig.callerLumenId,
            calleeUid: sig.calleeUid,
            calleeName: sig.calleeName,
            calleeLumenId: sig.calleeLumenId,
            kind: sig.kind,
            status: "ringing",
            offer: sig.offer,
            createdAtMs: sig.createdAtMs,
          });
        }
      }
    } else if (sig.type === "ended" || sig.type === "declined") {
      ringtone.stop();
      onIncoming(null);
    }
  });

  // 2. Also listen on Firestore when reachable
  let unsubFirestore: (() => void) | undefined;
  try {
    const callsRef = collection(db, "calls");
    const q = query(callsRef, where("calleeUid", "==", myUid), where("status", "==", "ringing"));
    unsubFirestore = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          return;
        }
        const docSnap = snapshot.docs[0];
        if (!docSnap) return;
        const data = docSnap.data() as CallDocData;
        if (Date.now() - (data.createdAtMs || 0) > 45000) {
          void updateDoc(doc(db, "calls", docSnap.id), { status: "ended" }).catch(() => {});
          onIncoming(null);
          ringtone.stop();
          return;
        }
        ringtone.startRinging();
        onIncoming({ ...data, id: docSnap.id });
      },
      () => {},
    );
  } catch {}

  return () => {
    unsubRelay();
    unsubFirestore?.();
    ringtone.stop();
  };
}

/**
 * Initiates an outgoing audio or video call via WebRTC with global cloud relay signaling.
 */
export async function startWebRTCCall(params: {
  convId: string;
  caller: { uid: string; name: string; lumenId: string };
  callee: { uid: string; name: string; lumenId: string };
  kind: CallKind;
  onRemoteStream: (stream: MediaStream) => void;
  onStatusChange: (status: CallStatus) => void;
}): Promise<ActiveCallControls> {
  const { convId, caller, callee, kind, onRemoteStream, onStatusChange } = params;

  let localStream: MediaStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === "video",
    });
  } catch (err) {
    throw new Error(
      `Could not access ${kind === "video" ? "camera/microphone" : "microphone"}: ${
        err instanceof Error ? err.message : "Permission denied"
      }`,
    );
  }

  const pc = new RTCPeerConnection(ICE_SERVERS);
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      onRemoteStream(event.streams[0]);
    }
  };

  const cleanConv = convId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const callRoomTopic = `xperter_call_${cleanConv}`;

  // Connect to the call room cloud relay
  const unsubCallRelay = connectCallCloudRelay(convId);

  const callDocRef = doc(db, "calls", convId);
  const callerCandidatesRef = collection(db, "calls", convId, "callerCandidates");
  const calleeCandidatesRef = collection(db, "calls", convId, "calleeCandidates");

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      const candJson = event.candidate.toJSON();
      void publishToCloudRelay(callRoomTopic, {
        type: "CALL_SIGNAL",
        convId,
        signal: { type: "candidate", role: "caller", candidate: candJson },
      });
      void addDoc(callerCandidatesRef, candJson).catch(() => {});
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const signalOffer = {
    type: "offer",
    convId,
    callerUid: caller.uid,
    callerName: caller.name,
    callerLumenId: caller.lumenId,
    calleeUid: callee.uid,
    calleeName: callee.name,
    calleeLumenId: callee.lumenId,
    kind,
    status: "ringing" as const,
    offer: { sdp: offer.sdp, type: offer.type },
    createdAtMs: Date.now(),
  };

  // 1. Publish offer to callee's personal inbox topic so their screen rings instantly
  const calleeTopics = new Set<string>();
  if (callee.lumenId) {
    const norm = normalizeLumenId(callee.lumenId).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "_");
    if (norm) calleeTopics.add(`xperter_inbox_${norm}`);
    const raw = callee.lumenId.trim().replace(/^@+/, "").toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "_");
    if (raw) calleeTopics.add(`xperter_inbox_${raw}`);
  }
  if (callee.uid) {
    const cleanUid = sanitizeId(callee.uid).toLowerCase();
    if (cleanUid) calleeTopics.add(`xperter_inbox_${cleanUid}`);
  }
  for (const t of calleeTopics) {
    void publishToCloudRelay(t, { type: "CALL_SIGNAL", convId, signal: signalOffer });
  }

  // 2. Also publish to call room topic
  void publishToCloudRelay(callRoomTopic, { type: "CALL_SIGNAL", convId, signal: signalOffer });

  // 3. Save to Firestore in background
  void setDoc(callDocRef, signalOffer).catch(() => {});

  ringtone.startRinging();

  // Listen for answer and callee ICE candidates via cloud relay
  const unsubSignal = subscribeToRealtimeEvents(async (event) => {
    if (event.type !== "CALL_SIGNAL" || event.convId !== convId) return;
    const sig = event.signal;
    if (!sig) return;

    if (sig.type === "answer" && sig.role === "callee" && sig.answer && !pc.currentRemoteDescription) {
      ringtone.stop();
      onStatusChange("connected");
      try {
        const answerDesc = new RTCSessionDescription(sig.answer as RTCSessionDescriptionInit);
        await pc.setRemoteDescription(answerDesc);
      } catch {}
    } else if (sig.type === "candidate" && sig.role === "callee" && sig.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
      } catch {}
    } else if (sig.type === "declined" || sig.type === "ended") {
      ringtone.stop();
      onStatusChange(sig.type);
      cleanup();
    }
  });

  // Also listen on Firestore if active
  let unsubCallDoc: (() => void) | undefined;
  let unsubCalleeCandidates: (() => void) | undefined;
  try {
    unsubCallDoc = onSnapshot(callDocRef, async (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as CallDocData;
      if (data.status === "declined" || data.status === "ended") {
        ringtone.stop();
        onStatusChange(data.status);
        cleanup();
      } else if (data.status === "connected" && data.answer && !pc.currentRemoteDescription) {
        ringtone.stop();
        onStatusChange("connected");
        const answerDesc = new RTCSessionDescription(data.answer as RTCSessionDescriptionInit);
        await pc.setRemoteDescription(answerDesc).catch(() => {});
      }
    });

    unsubCalleeCandidates = onSnapshot(calleeCandidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidateData = change.doc.data();
          void pc.addIceCandidate(new RTCIceCandidate(candidateData)).catch(() => {});
        }
      });
    });
  } catch {}

  const cleanup = () => {
    ringtone.stop();
    unsubSignal();
    unsubCallRelay();
    unsubCallDoc?.();
    unsubCalleeCandidates?.();
    localStream.getTracks().forEach((t) => t.stop());
    try {
      pc.close();
    } catch {}
  };

  const endCall = () => {
    void publishToCloudRelay(callRoomTopic, {
      type: "CALL_SIGNAL",
      convId,
      signal: { type: "ended", convId },
    });
    cleanup();
    void updateDoc(callDocRef, { status: "ended" }).catch(() => {});
  };

  const toggleMic = (enabled?: boolean) => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = enabled !== undefined ? enabled : !audioTrack.enabled;
      return audioTrack.enabled;
    }
    return false;
  };

  const toggleCam = (enabled?: boolean) => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = enabled !== undefined ? enabled : !videoTrack.enabled;
      return videoTrack.enabled;
    }
    return false;
  };

  return { endCall, toggleMic, toggleCam, localStream };
}

/**
 * Answers an incoming audio or video call with real-time cloud signaling.
 */
export async function answerWebRTCCall(params: {
  callId: string;
  offer: { sdp: string; type: string };
  kind: CallKind;
  onRemoteStream: (stream: MediaStream) => void;
  onStatusChange: (status: CallStatus) => void;
}): Promise<ActiveCallControls> {
  const { callId, offer, kind, onRemoteStream, onStatusChange } = params;
  ringtone.stop();

  let localStream: MediaStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === "video",
    });
  } catch (err) {
    throw new Error(
      `Could not access ${kind === "video" ? "camera/microphone" : "microphone"}: ${
        err instanceof Error ? err.message : "Permission denied"
      }`,
    );
  }

  const pc = new RTCPeerConnection(ICE_SERVERS);
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      onRemoteStream(event.streams[0]);
    }
  };

  const cleanConv = callId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const callRoomTopic = `xperter_call_${cleanConv}`;

  // Connect to the call room cloud relay
  const unsubCallRelay = connectCallCloudRelay(callId);

  const callDocRef = doc(db, "calls", callId);
  const calleeCandidatesRef = collection(db, "calls", callId, "calleeCandidates");
  const callerCandidatesRef = collection(db, "calls", callId, "callerCandidates");

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      const candJson = event.candidate.toJSON();
      void publishToCloudRelay(callRoomTopic, {
        type: "CALL_SIGNAL",
        convId: callId,
        signal: { type: "candidate", role: "callee", candidate: candJson },
      });
      void addDoc(calleeCandidatesRef, candJson).catch(() => {});
    }
  };

  const offerDesc = new RTCSessionDescription(offer as RTCSessionDescriptionInit);
  await pc.setRemoteDescription(offerDesc);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  const answerSignal = {
    type: "answer",
    role: "callee" as const,
    answer: { sdp: answer.sdp, type: answer.type },
    status: "connected" as const,
  };

  void publishToCloudRelay(callRoomTopic, {
    type: "CALL_SIGNAL",
    convId: callId,
    signal: answerSignal,
  });

  void updateDoc(callDocRef, {
    answer: { sdp: answer.sdp, type: answer.type },
    status: "connected",
  }).catch(() => {});

  onStatusChange("connected");

  // Listen for caller's candidates or end signals via cloud relay
  const unsubSignal = subscribeToRealtimeEvents(async (event) => {
    if (event.type !== "CALL_SIGNAL" || event.convId !== callId) return;
    const sig = event.signal;
    if (!sig) return;

    if (sig.type === "candidate" && sig.role === "caller" && sig.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
      } catch {}
    } else if (sig.type === "ended") {
      onStatusChange("ended");
      cleanup();
    }
  });

  let unsubCallDoc: (() => void) | undefined;
  let unsubCallerCandidates: (() => void) | undefined;
  try {
    unsubCallDoc = onSnapshot(callDocRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as CallDocData;
      if (data.status === "ended") {
        onStatusChange("ended");
        cleanup();
      }
    });

    unsubCallerCandidates = onSnapshot(callerCandidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidateData = change.doc.data();
          void pc.addIceCandidate(new RTCIceCandidate(candidateData)).catch(() => {});
        }
      });
    });
  } catch {}

  const cleanup = () => {
    ringtone.stop();
    unsubSignal();
    unsubCallRelay();
    unsubCallDoc?.();
    unsubCallerCandidates?.();
    localStream.getTracks().forEach((t) => t.stop());
    try {
      pc.close();
    } catch {}
  };

  const endCall = () => {
    void publishToCloudRelay(callRoomTopic, {
      type: "CALL_SIGNAL",
      convId: callId,
      signal: { type: "ended", convId: callId },
    });
    cleanup();
    void updateDoc(callDocRef, { status: "ended" }).catch(() => {});
  };

  const toggleMic = (enabled?: boolean) => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = enabled !== undefined ? enabled : !audioTrack.enabled;
      return audioTrack.enabled;
    }
    return false;
  };

  const toggleCam = (enabled?: boolean) => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = enabled !== undefined ? enabled : !videoTrack.enabled;
      return videoTrack.enabled;
    }
    return false;
  };

  return { endCall, toggleMic, toggleCam, localStream };
}

/**
 * Declines an incoming call.
 */
export async function declineWebRTCCall(callId: string): Promise<void> {
  ringtone.stop();
  const cleanConv = callId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const callRoomTopic = `xperter_call_${cleanConv}`;

  void publishToCloudRelay(callRoomTopic, {
    type: "CALL_SIGNAL",
    convId: callId,
    signal: { type: "declined", convId: callId },
  });

  try {
    await updateDoc(doc(db, "calls", callId), { status: "declined" });
  } catch {}
}
