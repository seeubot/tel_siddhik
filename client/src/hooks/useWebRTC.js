import { useRef, useState, useCallback, useEffect } from 'react';
import { ICE } from '../lib/socket';

export function useWebRTC(socket) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const remoteDescSetRef = useRef(false);

  // FIX 1: Dedicated ref for targetId instead of attaching to pcRef
  const targetIdRef = useRef(null);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [partnerMedia, setPartnerMedia] = useState({ audio: true, video: true });
  const [callActive, setCallActive] = useState(false);

  // FIX 2: Wrap createPC in useCallback so it has a stable reference
  // and always reads the latest socket ref via closure
  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection(ICE);

    pc.onicecandidate = (e) => {
      if (e.candidate && socket.current) {
        const targetId = targetIdRef.current;
        if (targetId) {
          socket.current.emit('ice-candidate', { targetId, candidate: e.candidate });
        }
      }
    };

    pc.ontrack = (e) => {
      const attachStream = () => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        } else {
          requestAnimationFrame(attachStream);
        }
      };
      requestAnimationFrame(attachStream);
    };

    pc.onconnectionstatechange = () => {
      if (['connected', 'completed'].includes(pc.connectionState)) {
        setCallActive(true);
      }
    };

    return pc;
  }, [socket]);

  // ── Start local stream ─────────────────────────────────────────────────────

  const startLocal = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error('getUserMedia error:', err);
      throw err;
    }
  }, []);

  // ── Stop local stream ──────────────────────────────────────────────────────

  const stopLocal = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  // ── Close peer connection ──────────────────────────────────────────────────

  const closePeer = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    targetIdRef.current = null;
    pendingCandidatesRef.current = [];
    remoteDescSetRef.current = false;
    setCallActive(false);
  }, []);

  // ── Flush queued ICE candidates ────────────────────────────────────────────

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingCandidatesRef.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
    }
    pendingCandidatesRef.current = [];
  }, []);

  // ── Make offer (caller side) ───────────────────────────────────────────────

  const makeOffer = useCallback(async (targetId) => {
    closePeer();
    const pc = createPC();
    pcRef.current = pc;
    // FIX 1: Store targetId in its own dedicated ref
    targetIdRef.current = targetId;

    const stream = localStreamRef.current || (await startLocal());
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.current?.emit('offer', { targetId, offer });
  }, [closePeer, createPC, startLocal, socket]);

  // ── Handle incoming offer (callee side) ───────────────────────────────────

  const handleOffer = useCallback(async (fromId, offer) => {
    closePeer();
    const pc = createPC();
    pcRef.current = pc;
    // FIX 1: Store targetId in its own dedicated ref
    targetIdRef.current = fromId;

    const stream = localStreamRef.current || (await startLocal());
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    remoteDescSetRef.current = true;
    await flushCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.current?.emit('answer', { targetId: fromId, answer });
  }, [closePeer, createPC, startLocal, flushCandidates, socket]);

  // ── Handle incoming answer ────────────────────────────────────────────────

  const handleAnswer = useCallback(async (answer) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    remoteDescSetRef.current = true;
    await flushCandidates();
  }, [flushCandidates]);

  // ── Handle ICE candidate ──────────────────────────────────────────────────

  const handleIceCandidate = useCallback(async (candidate) => {
    if (remoteDescSetRef.current && pcRef.current) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    } else {
      pendingCandidatesRef.current.push(candidate);
    }
  }, []);

  // ── Media toggles ─────────────────────────────────────────────────────────

  // FIX 3: Read the other track's live enabled state from the stream itself
  // instead of closing over the React state, eliminating the stale closure risk

  const toggleAudio = useCallback((roomId) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setAudioEnabled(track.enabled);
    const liveVideoEnabled = stream.getVideoTracks()[0]?.enabled ?? true;
    socket.current?.emit('media-state', { roomId, audioEnabled: track.enabled, videoEnabled: liveVideoEnabled });
  }, [socket]);

  const toggleVideo = useCallback((roomId) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setVideoEnabled(track.enabled);
    const liveAudioEnabled = stream.getAudioTracks()[0]?.enabled ?? true;
    socket.current?.emit('media-state', { roomId, audioEnabled: liveAudioEnabled, videoEnabled: track.enabled });
  }, [socket]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      closePeer();
      stopLocal();
    };
  }, [closePeer, stopLocal]);

  return {
    localVideoRef,
    remoteVideoRef,
    audioEnabled,
    videoEnabled,
    partnerMedia,
    setPartnerMedia,
    callActive,
    startLocal,
    stopLocal,
    closePeer,
    makeOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    toggleAudio,
    toggleVideo,
  };
}
