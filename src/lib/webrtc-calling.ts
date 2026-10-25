import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  deleteDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

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
 * Listens for incoming calls targeting the authenticated user.
 */
export function listenForIncomingCalls(
  myUid: string,
  onIncoming: (call: CallDocData | null) => void,
): () => void {
  if (!myUid) return () => {};

  const callsRef = collection(db, "calls");
  const q = query(callsRef, where("calleeUid", "==", myUid), where("status", "==", "ringing"));

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onIncoming(null);
        ringtone.stop();
        return;
      }
      const docSnap = snapshot.docs[0];
      if (!docSnap) {
        onIncoming(null);
        ringtone.stop();
        return;
      }
      const data = docSnap.data() as CallDocData;
      // Ring for 45 seconds max
      if (Date.now() - (data.createdAtMs || 0) > 45000) {
        void updateDoc(doc(db, "calls", docSnap.id), { status: "ended" }).catch(() => {});
        onIncoming(null);
        ringtone.stop();
        return;
      }
      ringtone.startRinging();
      onIncoming({ ...data, id: docSnap.id });
    },
    () => {
      // Ignore listener error
    },
  );
}

/**
 * Initiates an outgoing audio or video call via WebRTC and Firestore signaling.
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

  const callDocRef = doc(db, "calls", convId);
  const callerCandidatesRef = collection(db, "calls", convId, "callerCandidates");
  const calleeCandidatesRef = collection(db, "calls", convId, "calleeCandidates");

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      void addDoc(callerCandidatesRef, event.candidate.toJSON()).catch(() => {});
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await setDoc(callDocRef, {
    convId,
    callerUid: caller.uid,
    callerName: caller.name,
    callerLumenId: caller.lumenId,
    calleeUid: callee.uid,
    calleeName: callee.name,
    calleeLumenId: callee.lumenId,
    kind,
    status: "ringing",
    offer: { sdp: offer.sdp, type: offer.type },
    createdAtMs: Date.now(),
  });

  ringtone.startRinging();

  // Listen for Answer
  const unsubCallDoc = onSnapshot(callDocRef, async (snapshot) => {
    if (!snapshot.exists()) {
      onStatusChange("ended");
      ringtone.stop();
      return;
    }
    const data = snapshot.data() as CallDocData;
    if (data.status === "declined" || data.status === "ended") {
      ringtone.stop();
      onStatusChange(data.status);
      cleanup();
    } else if (data.status === "connected" && data.answer && !pc.currentRemoteDescription) {
      ringtone.stop();
      onStatusChange("connected");
      const answerDesc = new RTCSessionDescription(data.answer as RTCSessionDescriptionInit);
      await pc.setRemoteDescription(answerDesc);
    }
  });

  // Listen for Remote ICE candidates from callee
  const unsubCalleeCandidates = onSnapshot(calleeCandidatesRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidateData = change.doc.data();
        void pc.addIceCandidate(new RTCIceCandidate(candidateData)).catch(() => {});
      }
    });
  });

  const cleanup = () => {
    ringtone.stop();
    unsubCallDoc();
    unsubCalleeCandidates();
    localStream.getTracks().forEach((t) => t.stop());
    pc.close();
  };

  const endCall = () => {
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
 * Answers an incoming audio or video call.
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

  const callDocRef = doc(db, "calls", callId);
  const calleeCandidatesRef = collection(db, "calls", callId, "calleeCandidates");
  const callerCandidatesRef = collection(db, "calls", callId, "callerCandidates");

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      void addDoc(calleeCandidatesRef, event.candidate.toJSON()).catch(() => {});
    }
  };

  const offerDesc = new RTCSessionDescription(offer as RTCSessionDescriptionInit);
  await pc.setRemoteDescription(offerDesc);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await updateDoc(callDocRef, {
    answer: { sdp: answer.sdp, type: answer.type },
    status: "connected",
  });
  onStatusChange("connected");

  // Listen for Call status changes (e.g. caller hung up)
  const unsubCallDoc = onSnapshot(callDocRef, (snapshot) => {
    if (!snapshot.exists()) {
      onStatusChange("ended");
      cleanup();
      return;
    }
    const data = snapshot.data() as CallDocData;
    if (data.status === "ended") {
      onStatusChange("ended");
      cleanup();
    }
  });

  // Listen for caller's ICE candidates
  const unsubCallerCandidates = onSnapshot(callerCandidatesRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidateData = change.doc.data();
        void pc.addIceCandidate(new RTCIceCandidate(candidateData)).catch(() => {});
      }
    });
  });

  const cleanup = () => {
    ringtone.stop();
    unsubCallDoc();
    unsubCallerCandidates();
    localStream.getTracks().forEach((t) => t.stop());
    pc.close();
  };

  const endCall = () => {
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
  try {
    await updateDoc(doc(db, "calls", callId), { status: "declined" });
  } catch {}
}
