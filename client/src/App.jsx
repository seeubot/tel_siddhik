import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

// ── Palette & design tokens ────────────────────────────────────────────────
// Aesthetic: Deep-space industrial. Near-black backgrounds, electric cyan
// accents, stark monospaced type, crystalline glass cards.
const SOCKET_URL = window.location.origin;

// ── Utility ────────────────────────────────────────────────────────────────
function cls(...args) {
  return args.filter(Boolean).join(" ");
}

// ── ICE configuration ──────────────────────────────────────────────────────
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth / identity state ──────────────────────────────────────────────
  const [userName, setUserName] = useState("");
  const [oreyId, setOreyId] = useState(null);
  const [oreyIdExpiry, setOreyIdExpiry] = useState(null);
  const [registered, setRegistered] = useState(false);

  // ── Connection state ───────────────────────────────────────────────────
  const [screen, setScreen] = useState("landing"); // landing | lobby | call
  const [roomId, setRoomId] = useState(null);
  const [peers, setPeers] = useState([]); // [{ socketId, userName }]
  const [status, setStatus] = useState(""); // status bar text
  const [waiting, setWaiting] = useState(false);
  const [autoSearchCountdown, setAutoSearchCountdown] = useState(null);

  // ── Media state ────────────────────────────────────────────────────────
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [peerMediaStates, setPeerMediaStates] = useState({}); // socketId → { audio, video, screen }

  // ── ID sharing state ───────────────────────────────────────────────────
  const [shareRequest, setShareRequest] = useState(null); // { fromId, fromName }
  const [sharedIds, setSharedIds] = useState([]); // [{ oreyId, userName }]

  // ── Connect-by-ID form ─────────────────────────────────────────────────
  const [connectTarget, setConnectTarget] = useState("");
  const [connectError, setConnectError] = useState("");

  // ── Refs ───────────────────────────────────────────────────────────────
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnectionsRef = useRef({}); // socketId → RTCPeerConnection
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef({}); // socketId → <video> element
  const autoSearchTimerRef = useRef(null);
  const nameInputRef = useRef(null);

  // ── Socket setup ───────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setStatus("Connected to server"));
    socket.on("disconnect", () => setStatus("Disconnected — reconnecting…"));

    // Identity
    socket.on("orey-id-registered", ({ oreyId: id, expiresAt }) => {
      setOreyId(id);
      setOreyIdExpiry(new Date(expiresAt));
      setRegistered(true);
      setScreen("lobby");
      setStatus(`Registered as ${id}`);
    });
    socket.on("orey-id-invalid", () => setStatus("Orey ID invalid."));
    socket.on("orey-id-expired", () => setStatus("Orey ID expired. Refresh to get a new one."));

    // Room events
    socket.on("room-joined", ({ roomId: rid, peers: p, autoMatched }) => {
      setRoomId(rid);
      setPeers(p);
      setWaiting(false);
      setScreen("call");
      setStatus(autoMatched ? "Auto-matched!" : `Joined room ${rid}`);
      p.forEach((peer) => initiatePeerConnection(peer.socketId, true));
    });

    socket.on("user-joined", ({ socketId, userName: uName }) => {
      setPeers((prev) => [...prev, { socketId, userName: uName }]);
      setStatus(`${uName} joined`);
      initiatePeerConnection(socketId, false);
    });

    socket.on("partner-left", ({ socketId, userName: uName, reason }) => {
      setStatus(`${uName} ${reason === "skipped" ? "skipped" : "left"}`);
      closePeerConnection(socketId);
      setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
    });

    socket.on("room-full", () => setStatus("Room is full."));
    socket.on("waiting-for-match", () => {
      setWaiting(true);
      setStatus("Waiting for a match…");
    });
    socket.on("random-cancelled", () => {
      setWaiting(false);
      setStatus("Search cancelled.");
    });
    socket.on("skip-confirmed", () => setStatus("Skipped — searching…"));
    socket.on("left-chat-confirmed", () => {
      setScreen("lobby");
      setRoomId(null);
      setPeers([]);
      setStatus("You left the chat.");
    });

    // Auto-search
    socket.on("auto-search-scheduled", ({ delay }) => {
      let remaining = Math.ceil(delay / 1000);
      setAutoSearchCountdown(remaining);
      autoSearchTimerRef.current = setInterval(() => {
        remaining -= 1;
        setAutoSearchCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(autoSearchTimerRef.current);
          setAutoSearchCountdown(null);
        }
      }, 1000);
    });
    socket.on("auto-search-cancelled", () => {
      clearInterval(autoSearchTimerRef.current);
      setAutoSearchCountdown(null);
    });

    // WebRTC signalling
    socket.on("offer", async ({ offer, fromId }) => {
      const pc = getOrCreatePC(fromId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { targetId: fromId, answer });
    });
    socket.on("answer", async ({ answer, fromId }) => {
      const pc = peerConnectionsRef.current[fromId];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });
    socket.on("ice-candidate", async ({ candidate, fromId }) => {
      const pc = peerConnectionsRef.current[fromId];
      if (pc && candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
      }
    });
    socket.on("incoming-call", ({ fromName, autoMatched }) => {
      setStatus(autoMatched ? `Connected with ${fromName}` : `Incoming call from ${fromName}`);
    });

    // Media state
    socket.on("peer-media-state", ({ socketId, audioEnabled: a, videoEnabled: v, screenSharing: s }) => {
      setPeerMediaStates((prev) => ({ ...prev, [socketId]: { audio: a, video: v, screen: s } }));
    });

    // Screen sharing
    socket.on("peer-screen-share-started", ({ socketId, userName: uName }) => {
      setStatus(`${uName} started screen sharing`);
      setPeerMediaStates((prev) => ({ ...prev, [socketId]: { ...(prev[socketId] || {}), screen: true } }));
    });
    socket.on("peer-screen-share-stopped", ({ socketId, userName: uName }) => {
      setStatus(`${uName} stopped screen sharing`);
      setPeerMediaStates((prev) => ({ ...prev, [socketId]: { ...(prev[socketId] || {}), screen: false } }));
    });

    // ID sharing
    socket.on("share-id-request", ({ fromId, fromName }) => {
      setShareRequest({ fromId, fromName });
    });
    socket.on("share-id-reveal", ({ oreyId: oid, userName: uName }) => {
      setSharedIds((prev) => [...prev.filter((x) => x.userName !== uName), { oreyId: oid, userName: uName }]);
    });
    socket.on("share-id-declined", () => setStatus("Partner declined ID share."));
    socket.on("share-id-error", ({ reason }) => setStatus(`ID share error: ${reason}`));

    // Orey-ID lookup errors
    socket.on("orey-id-not-found", () => setConnectError("Orey ID not found or expired."));
    socket.on("orey-id-offline", () => setConnectError("That user is currently offline."));

    return () => socket.disconnect();
  }, []); // eslint-disable-line

  // ── WebRTC helpers ─────────────────────────────────────────────────────
  function getOrCreatePC(socketId) {
    if (peerConnectionsRef.current[socketId]) return peerConnectionsRef.current[socketId];
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current.emit("ice-candidate", { targetId: socketId, candidate });
    };

    pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (remoteVideoRefs.current[socketId]) {
        remoteVideoRefs.current[socketId].srcObject = stream;
      }
    };

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) =>
        pc.addTrack(track, localStreamRef.current)
      );
    }

    peerConnectionsRef.current[socketId] = pc;
    return pc;
  }

  async function initiatePeerConnection(socketId, isOfferer) {
    const pc = getOrCreatePC(socketId);
    if (isOfferer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit("offer", { targetId: socketId, offer });
    }
  }

  function closePeerConnection(socketId) {
    const pc = peerConnectionsRef.current[socketId];
    if (pc) { pc.close(); delete peerConnectionsRef.current[socketId]; }
    if (remoteVideoRefs.current[socketId]) remoteVideoRefs.current[socketId].srcObject = null;
    setPeerMediaStates((prev) => { const n = { ...prev }; delete n[socketId]; return n; });
  }

  // ── Media helpers ──────────────────────────────────────────────────────
  async function startLocalMedia() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (e) {
      setStatus("Camera/mic access denied. Check browser permissions.");
      return null;
    }
  }

  function emitMediaState() {
    if (!roomId) return;
    socketRef.current.emit("media-state", {
      roomId,
      audioEnabled,
      videoEnabled,
      screenSharing,
    });
  }

  function toggleAudio() {
    if (!localStreamRef.current) return;
    const next = !audioEnabled;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = next));
    setAudioEnabled(next);
    socketRef.current.emit("media-state", { roomId, audioEnabled: next, videoEnabled, screenSharing });
  }

  function toggleVideo() {
    if (!localStreamRef.current) return;
    const next = !videoEnabled;
    localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = next));
    setVideoEnabled(next);
    socketRef.current.emit("media-state", { roomId, audioEnabled, videoEnabled: next, screenSharing });
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      // Stop screen share, revert to camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
      });
      setScreenSharing(false);
      socketRef.current.emit("screen-share-stopped", { roomId });
      socketRef.current.emit("media-state", { roomId, audioEnabled, videoEnabled, screenSharing: false });
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        Object.values(peerConnectionsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(screenTrack);
        });
        screenTrack.onended = () => toggleScreenShare();
        setScreenSharing(true);
        socketRef.current.emit("screen-share-started", { roomId });
        socketRef.current.emit("media-state", { roomId, audioEnabled, videoEnabled, screenSharing: true });
      } catch (_) {
        setStatus("Screen share cancelled or denied.");
      }
    }
  }

  // ── Action handlers ────────────────────────────────────────────────────
  async function handleRegister() {
    if (!userName.trim()) return;
    // Fetch a new Orey ID from server, then register
    try {
      const res = await fetch("/generate-orey-id");
      const data = await res.json();
      socketRef.current.emit("register-orey-id", { oreyId: data.oreyId, userName: userName.trim() });
    } catch {
      setStatus("Failed to reach server.");
    }
  }

  async function handleJoinRandom() {
    if (!localStreamRef.current) await startLocalMedia();
    socketRef.current.emit("join-random");
    setWaiting(true);
  }

  async function handleConnectById() {
    if (!connectTarget.trim()) return;
    setConnectError("");
    if (!localStreamRef.current) await startLocalMedia();
    socketRef.current.emit("connect-by-orey-id", { targetOreyId: connectTarget.trim() });
  }

  function handleSkip() {
    socketRef.current.emit("skip");
    setStatus("Skipping…");
  }

  function handleLeave() {
    // Stop all media
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    Object.keys(peerConnectionsRef.current).forEach(closePeerConnection);
    setPeers([]);
    setScreenSharing(false);
    setSharedIds([]);
    setShareRequest(null);
    socketRef.current.emit("leave-chat");
  }

  function handleCancelRandom() {
    socketRef.current.emit("cancel-random");
    setWaiting(false);
  }

  function handleCancelAutoSearch() {
    socketRef.current.emit("cancel-auto-search");
    clearInterval(autoSearchTimerRef.current);
    setAutoSearchCountdown(null);
  }

  function handleRequestShareId() {
    socketRef.current.emit("share-id-request", { roomId });
  }

  function handleAcceptShare() {
    socketRef.current.emit("share-id-accept", { roomId, targetId: shareRequest.fromId });
    setShareRequest(null);
  }

  function handleDeclineShare() {
    socketRef.current.emit("share-id-decline", { roomId });
    setShareRequest(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:       #080c10;
          --surface:  #0e1520;
          --glass:    rgba(14, 21, 32, 0.7);
          --border:   rgba(0, 220, 200, 0.12);
          --border-h: rgba(0, 220, 200, 0.35);
          --cyan:     #00dcc8;
          --cyan-dim: #009e90;
          --red:      #ff4060;
          --yellow:   #ffd060;
          --text:     #d0e8e4;
          --text-dim: #607880;
          --mono:     'Space Mono', monospace;
          --sans:     'Syne', sans-serif;
        }

        html, body, #root {
          height: 100%; width: 100%;
          background: var(--bg);
          color: var(--text);
          font-family: var(--mono);
          overflow: hidden;
        }

        /* Animated grid background */
        body::before {
          content: '';
          position: fixed; inset: 0; z-index: 0;
          background-image:
            linear-gradient(rgba(0,220,200,.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,220,200,.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }

        /* Corner glow */
        body::after {
          content: '';
          position: fixed;
          top: -200px; left: -200px;
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(0,220,200,.06) 0%, transparent 70%);
          pointer-events: none; z-index: 0;
        }

        .app { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; }

        /* ── Top bar ── */
        .topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 24px;
          border-bottom: 1px solid var(--border);
          background: rgba(8, 12, 16, 0.9);
          backdrop-filter: blur(12px);
          flex-shrink: 0;
        }
        .logo {
          font-family: var(--sans); font-size: 22px; font-weight: 800;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, var(--cyan), #60f0d0);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .logo span { color: var(--text-dim); -webkit-text-fill-color: var(--text-dim); font-weight: 400; font-size: 13px; margin-left: 10px; }
        .status-bar {
          font-size: 11px; color: var(--text-dim); letter-spacing: .05em;
          max-width: 360px; text-align: right;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .orey-badge {
          display: flex; align-items: center; gap: 8px;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 6px; padding: 6px 12px;
          font-size: 11px; color: var(--cyan);
        }
        .orey-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

        /* ── Screens ── */
        .screen { flex: 1; display: flex; align-items: center; justify-content: center; overflow: auto; padding: 24px; }

        /* ── Landing ── */
        .landing-card {
          width: 100%; max-width: 420px;
          background: var(--glass); border: 1px solid var(--border);
          border-radius: 16px; padding: 48px 40px;
          backdrop-filter: blur(20px);
          display: flex; flex-direction: column; gap: 28px;
          animation: fadeUp .4s ease;
        }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:none} }

        .landing-title {
          font-family: var(--sans); font-size: 36px; font-weight: 800;
          line-height: 1.1; letter-spacing: -1px;
        }
        .landing-title em { font-style: normal; color: var(--cyan); }
        .landing-sub { font-size: 12px; color: var(--text-dim); line-height: 1.7; }

        .field-label { font-size: 11px; color: var(--text-dim); letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px; }
        .input {
          width: 100%; padding: 12px 16px;
          background: rgba(255,255,255,.04); border: 1px solid var(--border);
          border-radius: 8px; color: var(--text); font-family: var(--mono); font-size: 14px;
          outline: none; transition: border-color .2s, box-shadow .2s;
        }
        .input:focus { border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(0,220,200,.12); }
        .input::placeholder { color: var(--text-dim); }

        .btn {
          padding: 12px 24px; border-radius: 8px; border: none; cursor: pointer;
          font-family: var(--mono); font-size: 13px; font-weight: 700; letter-spacing: .04em;
          transition: all .18s; position: relative; overflow: hidden;
        }
        .btn-primary {
          background: var(--cyan); color: #080c10;
          box-shadow: 0 0 20px rgba(0,220,200,.25);
        }
        .btn-primary:hover { background: #00f0da; box-shadow: 0 0 32px rgba(0,220,200,.45); transform: translateY(-1px); }
        .btn-primary:active { transform: none; }
        .btn-ghost {
          background: transparent; color: var(--text);
          border: 1px solid var(--border);
        }
        .btn-ghost:hover { border-color: var(--border-h); background: rgba(0,220,200,.05); }
        .btn-danger { background: var(--red); color: #fff; }
        .btn-danger:hover { background: #ff2040; }
        .btn-warn { background: var(--yellow); color: #1a1000; }
        .btn-warn:hover { filter: brightness(1.1); }
        .btn:disabled { opacity: .4; cursor: not-allowed; transform: none !important; }
        .btn-full { width: 100%; }

        /* ── Lobby ── */
        .lobby-layout {
          width: 100%; max-width: 760px;
          display: flex; flex-direction: column; gap: 20px;
          animation: fadeUp .35s ease;
        }
        .lobby-header { font-family: var(--sans); font-size: 13px; font-weight: 600; color: var(--text-dim); letter-spacing: .1em; text-transform: uppercase; }
        .card {
          background: var(--glass); border: 1px solid var(--border);
          border-radius: 12px; padding: 28px 32px;
          backdrop-filter: blur(16px);
        }
        .card-title { font-family: var(--sans); font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
        .card-desc { font-size: 11px; color: var(--text-dim); margin-bottom: 20px; line-height: 1.7; }
        .row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
        .row .input { flex: 1; min-width: 180px; }
        .error-msg { font-size: 11px; color: var(--red); margin-top: 8px; }

        .id-box {
          background: rgba(0,220,200,.06); border: 1px solid var(--border);
          border-radius: 8px; padding: 14px 18px;
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 8px;
        }
        .id-val { font-size: 20px; font-weight: 700; color: var(--cyan); letter-spacing: .06em; }
        .id-expiry { font-size: 10px; color: var(--text-dim); }

        /* ── Call screen ── */
        .call-layout {
          width: 100%; height: 100%;
          display: grid;
          grid-template-rows: 1fr auto;
          gap: 0;
          overflow: hidden;
        }
        .video-area {
          position: relative; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          background: #050810;
        }
        .video-grid {
          width: 100%; height: 100%;
          display: grid; gap: 4px;
        }
        .video-grid.one  { grid-template-columns: 1fr; }
        .video-grid.two  { grid-template-columns: 1fr 1fr; }

        .video-tile {
          position: relative; background: #0a0f18; overflow: hidden;
        }
        .video-tile video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .video-tile .tile-label {
          position: absolute; bottom: 12px; left: 12px;
          background: rgba(8,12,16,.75); border: 1px solid var(--border);
          border-radius: 4px; padding: 3px 9px;
          font-size: 11px; color: var(--text); letter-spacing: .04em;
          backdrop-filter: blur(8px);
        }
        .video-tile .tile-icons {
          position: absolute; bottom: 12px; right: 12px;
          display: flex; gap: 4px;
        }
        .tile-icon {
          width: 22px; height: 22px; border-radius: 4px;
          background: rgba(255,64,96,.85);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px;
        }
        .tile-icon.screen { background: rgba(0,220,200,.7); color: #080c10; }

        .no-video-placeholder {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; color: var(--text-dim); font-size: 12px;
        }
        .avatar {
          width: 72px; height: 72px; border-radius: 50%;
          background: linear-gradient(135deg, var(--surface), #1a2840);
          border: 2px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          font-size: 28px; font-family: var(--sans); font-weight: 800; color: var(--cyan);
        }

        /* Controls bar */
        .controls-bar {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          padding: 14px 20px;
          background: rgba(8, 12, 16, 0.95);
          border-top: 1px solid var(--border);
          flex-wrap: wrap;
          flex-shrink: 0;
        }
        .ctrl-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 9px 18px; border-radius: 8px; border: 1px solid var(--border);
          background: var(--surface); color: var(--text);
          font-family: var(--mono); font-size: 12px; cursor: pointer;
          transition: all .15s;
        }
        .ctrl-btn:hover { border-color: var(--border-h); background: rgba(0,220,200,.07); }
        .ctrl-btn.active { border-color: var(--cyan); background: rgba(0,220,200,.12); color: var(--cyan); }
        .ctrl-btn.danger { border-color: rgba(255,64,96,.4); color: var(--red); }
        .ctrl-btn.danger:hover { background: rgba(255,64,96,.12); }
        .ctrl-btn .icon { font-size: 15px; }

        .room-info {
          position: absolute; top: 12px; left: 12px;
          background: rgba(8,12,16,.8); border: 1px solid var(--border);
          border-radius: 6px; padding: 5px 11px;
          font-size: 11px; color: var(--text-dim);
          backdrop-filter: blur(8px);
        }
        .room-info strong { color: var(--cyan); }

        /* Overlays */
        .overlay {
          position: fixed; inset: 0; z-index: 50;
          background: rgba(5,8,12,.7); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
        }
        .overlay-card {
          background: var(--surface); border: 1px solid var(--border-h);
          border-radius: 14px; padding: 36px 40px; max-width: 380px; width: 100%;
          display: flex; flex-direction: column; gap: 18px;
          animation: fadeUp .25s ease;
        }
        .overlay-title { font-family: var(--sans); font-size: 20px; font-weight: 700; }
        .overlay-sub { font-size: 12px; color: var(--text-dim); line-height: 1.6; }
        .overlay-actions { display: flex; gap: 10px; }

        /* Waiting spinner */
        .spinner {
          width: 36px; height: 36px; border-radius: 50%;
          border: 3px solid var(--border);
          border-top-color: var(--cyan);
          animation: spin 0.9s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .waiting-screen {
          display: flex; flex-direction: column; align-items: center; gap: 20px;
          padding: 60px;
        }
        .waiting-title { font-family: var(--sans); font-size: 24px; font-weight: 700; }
        .waiting-sub { font-size: 12px; color: var(--text-dim); }

        /* Shared IDs */
        .shared-ids {
          position: absolute; top: 12px; right: 12px;
          display: flex; flex-direction: column; gap: 6px; max-width: 220px;
        }
        .shared-id-chip {
          background: rgba(0,220,200,.1); border: 1px solid var(--cyan);
          border-radius: 6px; padding: 6px 12px; font-size: 11px;
          color: var(--cyan);
        }
        .shared-id-chip strong { display: block; font-size: 13px; letter-spacing: .04em; }

        .auto-search-bar {
          position: absolute; bottom: 0; left: 0; right: 0;
          background: rgba(8,12,16,.92); border-top: 1px solid var(--border);
          display: flex; align-items: center; justify-content: center; gap: 16px;
          padding: 12px 20px; font-size: 13px;
        }

        .divider { height: 1px; background: var(--border); width: 100%; }

        /* Copy button */
        .copy-btn {
          padding: 5px 12px; border-radius: 5px;
          background: rgba(0,220,200,.1); border: 1px solid var(--border);
          color: var(--cyan); font-family: var(--mono); font-size: 11px; cursor: pointer;
          transition: all .15s;
        }
        .copy-btn:hover { background: rgba(0,220,200,.2); }
      `}</style>

      <div className="app">
        {/* ── Top Bar ── */}
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="logo">
              OREY
              <span>/ video</span>
            </div>
            {screen === "call" && roomId && (
              <div className="orey-badge">
                <div className="dot" />
                Room {roomId}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {oreyId && screen !== "landing" && (
              <div className="orey-badge" style={{ cursor: "pointer" }} title="Click to copy your ID"
                onClick={() => navigator.clipboard?.writeText(oreyId)}>
                <div className="dot" />
                {oreyId}
              </div>
            )}
            <div className="status-bar">{status}</div>
          </div>
        </header>

        {/* ── Landing screen ── */}
        {screen === "landing" && (
          <div className="screen">
            <div className="landing-card">
              <div>
                <div className="landing-title">Connect.<br /><em>Instantly.</em></div>
                <div style={{ marginTop: 12 }} className="landing-sub">
                  Peer-to-peer video calls with no accounts. Enter a name to get your shareable Orey ID and start connecting.
                </div>
              </div>
              <div>
                <div className="field-label">Your Display Name</div>
                <input
                  ref={nameInputRef}
                  className="input"
                  placeholder="e.g. Alex"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                  autoFocus
                />
              </div>
              <button
                className="btn btn-primary btn-full"
                onClick={handleRegister}
                disabled={!userName.trim()}
              >
                Get My Orey ID →
              </button>
            </div>
          </div>
        )}

        {/* ── Lobby screen ── */}
        {screen === "lobby" && (
          <div className="screen">
            <div className="lobby-layout">
              <div className="lobby-header">Choose how to connect</div>

              {/* My ID */}
              <div className="card">
                <div className="card-title">Your Orey ID</div>
                <div className="card-desc">Share this ID with someone so they can call you directly.</div>
                <div className="id-box">
                  <div>
                    <div className="id-val">{oreyId}</div>
                    <div className="id-expiry">
                      Expires {oreyIdExpiry ? oreyIdExpiry.toLocaleTimeString() : "…"}
                    </div>
                  </div>
                  <button className="copy-btn" onClick={() => navigator.clipboard?.writeText(oreyId)}>
                    Copy
                  </button>
                </div>
              </div>

              {/* Random match */}
              <div className="card">
                <div className="card-title">Random Match</div>
                <div className="card-desc">Get matched with a stranger instantly. Skip anytime.</div>
                {waiting ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div className="spinner" />
                    <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Searching for a match…</span>
                    <button className="btn btn-ghost" onClick={handleCancelRandom}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn btn-primary" onClick={handleJoinRandom}>
                    Find Someone →
                  </button>
                )}
              </div>

              {/* Connect by ID */}
              <div className="card">
                <div className="card-title">Connect by Orey ID</div>
                <div className="card-desc">Enter someone's Orey ID to call them directly.</div>
                <div className="row">
                  <input
                    className="input"
                    placeholder="Orey-XXXX-XXXX"
                    value={connectTarget}
                    onChange={(e) => { setConnectTarget(e.target.value); setConnectError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleConnectById()}
                  />
                  <button className="btn btn-primary" onClick={handleConnectById} disabled={!connectTarget.trim()}>
                    Call
                  </button>
                </div>
                {connectError && <div className="error-msg">{connectError}</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── Call screen ── */}
        {screen === "call" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="video-area" style={{ flex: 1 }}>
              {/* Room info */}
              <div className="room-info">Room <strong>{roomId}</strong> · {peers.length + 1} participant{peers.length !== 0 ? "s" : ""}</div>

              {/* Shared ID chips */}
              {sharedIds.length > 0 && (
                <div className="shared-ids">
                  {sharedIds.map((s) => (
                    <div key={s.userName} className="shared-id-chip">
                      <strong>{s.oreyId || "—"}</strong>
                      {s.userName}
                    </div>
                  ))}
                </div>
              )}

              {/* Video grid */}
              <div className={cls("video-grid", peers.length === 0 ? "one" : "two")}
                style={{ position: "absolute", inset: 0 }}>

                {/* Local tile */}
                <div className="video-tile">
                  <video ref={localVideoRef} autoPlay muted playsInline style={{ transform: "scaleX(-1)" }} />
                  {!videoEnabled && (
                    <div className="no-video-placeholder">
                      <div className="avatar">{userName?.[0]?.toUpperCase()}</div>
                      <span>{userName} (you)</span>
                    </div>
                  )}
                  <div className="tile-label">{userName} (you)</div>
                  <div className="tile-icons">
                    {!audioEnabled && <div className="tile-icon">🔇</div>}
                    {screenSharing && <div className="tile-icon screen">🖥</div>}
                  </div>
                </div>

                {/* Remote tiles */}
                {peers.map((peer) => (
                  <RemoteTile
                    key={peer.socketId}
                    peer={peer}
                    mediaState={peerMediaStates[peer.socketId]}
                    videoRef={(el) => { remoteVideoRefs.current[peer.socketId] = el; }}
                  />
                ))}
              </div>

              {/* Auto-search countdown */}
              {autoSearchCountdown !== null && (
                <div className="auto-search-bar">
                  <span>Partner left. Auto-searching in <strong style={{ color: "var(--cyan)" }}>{autoSearchCountdown}s</strong></span>
                  <button className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={handleCancelAutoSearch}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => { handleCancelAutoSearch(); socketRef.current.emit("join-random"); }}>
                    Search Now
                  </button>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="controls-bar">
              <button className={cls("ctrl-btn", audioEnabled && "active")} onClick={toggleAudio}>
                <span className="icon">{audioEnabled ? "🎙" : "🔇"}</span>
                {audioEnabled ? "Mute" : "Unmute"}
              </button>
              <button className={cls("ctrl-btn", videoEnabled && "active")} onClick={toggleVideo}>
                <span className="icon">{videoEnabled ? "📷" : "🚫"}</span>
                {videoEnabled ? "Stop Cam" : "Start Cam"}
              </button>
              <button className={cls("ctrl-btn", screenSharing && "active")} onClick={toggleScreenShare}>
                <span className="icon">🖥</span>
                {screenSharing ? "Stop Share" : "Share Screen"}
              </button>
              {peers.length > 0 && (
                <button className="ctrl-btn" onClick={handleRequestShareId}>
                  <span className="icon">🪪</span>
                  Share ID
                </button>
              )}
              {peers.length > 0 && (
                <button className="ctrl-btn" onClick={handleSkip}>
                  <span className="icon">⏭</span>
                  Skip
                </button>
              )}
              <button className="ctrl-btn danger" onClick={handleLeave}>
                <span className="icon">✕</span>
                Leave
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Share ID request overlay ── */}
      {shareRequest && (
        <div className="overlay">
          <div className="overlay-card">
            <div className="overlay-title">ID Share Request</div>
            <div className="overlay-sub">
              <strong>{shareRequest.fromName}</strong> wants to exchange Orey IDs with you. This lets you reconnect later.
            </div>
            <div className="overlay-actions">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAcceptShare}>Accept</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleDeclineShare}>Decline</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Remote video tile ──────────────────────────────────────────────────────
function RemoteTile({ peer, mediaState, videoRef }) {
  const videoElRef = useRef(null);

  const setRef = useCallback((el) => {
    videoElRef.current = el;
    if (videoRef) videoRef(el);
  }, [videoRef]);

  const videoOff = mediaState && !mediaState.video;
  const audioOff = mediaState && !mediaState.audio;
  const screenOn = mediaState?.screen;

  return (
    <div className="video-tile">
      <video ref={setRef} autoPlay playsInline />
      {videoOff && (
        <div className="no-video-placeholder">
          <div className="avatar">{peer.userName?.[0]?.toUpperCase()}</div>
          <span>{peer.userName}</span>
        </div>
      )}
      <div className="tile-label">{peer.userName}</div>
      <div className="tile-icons">
        {audioOff && <div className="tile-icon">🔇</div>}
        {screenOn && <div className="tile-icon screen">🖥</div>}
      </div>
    </div>
  );
}
