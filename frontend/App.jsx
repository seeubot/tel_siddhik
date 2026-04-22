/**
 * Maya Connect — Frontend
 * PWA (Progressive Web App)
 *
 * What changed from the prototype:
 *  - Real device fingerprint stored in localStorage
 *  - POST /api/users/register on load → real reconnectId from DB
 *  - WebSocket connection to signaling server
 *  - Actual getUserMedia() for local camera/mic
 *  - RTCPeerConnection with STUN + TURN for video
 *  - All setTimeout mocks replaced with WS events
 *  - Report → POST /api/reports
 *  - Session end → POST /api/sessions (analytics)
 *  - Reconnect by MC-ID → WS 'reconnect-by-id'
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video, UserPlus, ShieldCheck, X, Mic, MicOff,
  VideoOff, Flag, ArrowRight, CheckCircle2, AlertCircle, Search
} from 'lucide-react';

// ─── Config ───────────────────────────────────────────────────────────────────
const SIGNALING_URL = process.env.REACT_APP_SIGNALING_URL || 'ws://localhost:3001';
const API_URL       = process.env.REACT_APP_API_URL       || 'http://localhost:3002';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Replace with your Metered.ca TURN credentials
  {
    urls:       process.env.REACT_APP_TURN_URL        || 'turn:relay.metered.ca:80',
    username:   process.env.REACT_APP_TURN_USERNAME   || '',
    credential: process.env.REACT_APP_TURN_CREDENTIAL || '',
  },
];

// ─── Device fingerprint ───────────────────────────────────────────────────────
async function getDeviceId() {
  const stored = localStorage.getItem('mc_device_id');
  if (stored) return stored;

  const raw = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency ?? 'x'),
  ].join('|');

  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hex  = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const id   = hex.slice(0, 32);
  localStorage.setItem('mc_device_id', id);
  return id;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
const api = {
  register: (deviceId) =>
    fetch(`${API_URL}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    }).then(r => r.json()),

  report: (body) =>
    fetch(`${API_URL}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json()),

  logSession: (body) =>
    fetch(`${API_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {}), // fire-and-forget

  checkReconnectId: (mcId) =>
    fetch(`${API_URL}/api/users/reconnect/${mcId}`).then(r => r.json()),

  resetId: (deviceId) =>
    fetch(`${API_URL}/api/users/reset-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    }).then(r => r.json()),
};

// ─── UI primitives ────────────────────────────────────────────────────────────
const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false }) => {
  const base = 'flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100';
  const variants = {
    primary:   'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-700',
    danger:    'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20',
    secondary: 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
    ghost:     'bg-transparent text-zinc-400 hover:text-white',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── App state ──────────────────────────────────────────────────────────────
  const [view, setView]               = useState('loading');   // loading | banned | home | queue | preview | chat
  const [queueMsg, setQueueMsg]       = useState('Finding someone in Telangana...');
  const [acceptTimer, setAcceptTimer] = useState(10);
  const [micActive, setMicActive]     = useState(true);
  const [videoActive, setVideoActive] = useState(true);
  const [showReport, setShowReport]   = useState(false);
  const [reconnectInput, setReconnectInput] = useState('');
  const [showReconnectInput, setShowReconnectInput] = useState(false);
  const [statusMsg, setStatusMsg]     = useState('');
  const [banInfo, setBanInfo]         = useState(null);

  // ── Refs (not re-render triggers) ─────────────────────────────────────────
  const deviceIdRef    = useRef(null);
  const reconnectIdRef = useRef(null);
  const wsRef          = useRef(null);
  const pcRef          = useRef(null);         // RTCPeerConnection
  const localStreamRef = useRef(null);
  const sessionIdRef   = useRef(null);
  const sessionStartRef= useRef(null);
  const peerDeviceIdRef= useRef(null);         // for reports
  const localVideoRef  = useRef(null);         // <video> element
  const remoteVideoRef = useRef(null);         // <video> element

  // ── Initialise on mount ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const deviceId = await getDeviceId();
      deviceIdRef.current = deviceId;

      // Register with API — get reconnectId and ban status
      const data = await api.register(deviceId).catch(() => null);

      if (!data) {
        setStatusMsg('Could not reach server. Check your connection.');
        setView('home');
        return;
      }

      if (data.banStatus === 'permanent') {
        setBanInfo({ type: 'permanent' });
        setView('banned');
        return;
      }

      if (data.banStatus === 'temporary') {
        setBanInfo({ type: 'temporary', expiry: new Date(data.banExpiry) });
        setView('banned');
        return;
      }

      reconnectIdRef.current = data.reconnectId;
      connectWS(deviceId, data.reconnectId);
      setView('home');
    })();

    return () => {
      wsRef.current?.close();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const connectWS = useCallback((deviceId, reconnectId) => {
    const ws = new WebSocket(SIGNALING_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type:        'join',
        deviceId,
        reconnectId,
        region:      'telangana',   // TODO: let user pick region
        language:    'telugu',
        genderPref:  null,
      }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      handleWsMessage(msg);
    };

    ws.onclose = () => {
      // Reconnect after 3 s if not intentional
      setTimeout(() => {
        if (deviceIdRef.current && reconnectIdRef.current) {
          connectWS(deviceIdRef.current, reconnectIdRef.current);
        }
      }, 3000);
    };

    ws.onerror = (err) => console.error('[WS] error', err);
  }, []);

  const wsSend = (msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  // ── WebSocket event handler ────────────────────────────────────────────────
  const handleWsMessage = useCallback(async (msg) => {
    switch (msg.type) {

      // ── Queue & matching ─────────────────────────────────────────────────
      case 'queue-status':
        setQueueMsg(msg.message);
        break;

      case 'rate-limited':
        setQueueMsg(msg.message);
        break;

      case 'match-found':
        sessionIdRef.current = msg.sessionId;
        setAcceptTimer(10);
        setView('preview');
        break;

      case 'match-expired':
        setQueueMsg('Match timed out — searching again...');
        setView('queue');
        break;

      // ── WebRTC session start ─────────────────────────────────────────────
      case 'session-start':
        sessionStartRef.current = Date.now();
        await setupPeerConnection();
        if (msg.role === 'caller') {
          // We create the offer
          const offer = await pcRef.current.createOffer();
          await pcRef.current.setLocalDescription(offer);
          wsSend({ type: 'webrtc-offer', sessionId: msg.sessionId, offer });
        }
        // callee waits for 'webrtc-offer' event below
        setView('chat');
        break;

      // ── WebRTC signaling relay ───────────────────────────────────────────
      case 'webrtc-offer':
        await setupPeerConnection();
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.offer));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        wsSend({ type: 'webrtc-answer', sessionId: msg.sessionId, answer });
        break;

      case 'webrtc-answer':
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.answer));
        }
        break;

      case 'ice-candidate':
        if (pcRef.current && msg.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
        }
        break;

      // ── Peer events ──────────────────────────────────────────────────────
      case 'peer-disconnected':
        cleanupPeer();
        setStatusMsg('They disconnected — searching for someone new...');
        setView('queue');
        wsSend({ type: 'find-match' });
        break;

      case 'session-ended':
        cleanupPeer();
        setView('home');
        break;

      // ── Reconnect ────────────────────────────────────────────────────────
      case 'reconnect-found':
        setShowReconnectInput(false);
        setStatusMsg(msg.message);
        break;

      case 'reconnect-unavailable':
        setStatusMsg(msg.message);
        break;
    }
  }, []);

  // ── RTCPeerConnection setup ────────────────────────────────────────────────
  const setupPeerConnection = async () => {
    // Close stale connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Get local media if not already acquired
    if (!localStreamRef.current) {
      try {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });
      } catch (err) {
        setStatusMsg('Camera/mic permission denied. Please allow access and try again.');
        return;
      }
    }

    // Attach local stream to local <video>
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // Add local tracks
    localStreamRef.current.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current);
    });

    // Receive remote stream
    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Relay ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsSend({
          type:      'ice-candidate',
          sessionId: sessionIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState)) {
        cleanupPeer();
        setView('queue');
        wsSend({ type: 'find-match' });
      }
    };
  };

  const cleanupPeer = () => {
    // Log session
    if (sessionIdRef.current && sessionStartRef.current) {
      api.logSession({
        user1Id:   deviceIdRef.current,
        user2Id:   peerDeviceIdRef.current,
        startTime: new Date(sessionStartRef.current).toISOString(),
        endTime:   new Date().toISOString(),
      });
    }

    pcRef.current?.close();
    pcRef.current = null;

    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    sessionIdRef.current   = null;
    sessionStartRef.current = null;
    peerDeviceIdRef.current = null;
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleStart = async () => {
    setQueueMsg('Finding someone in Telangana...');
    setView('queue');

    // Acquire media early so the user grants permissions before matching
    if (!localStreamRef.current) {
      try {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      } catch {
        setStatusMsg('Please allow camera and microphone access to start.');
        setView('home');
        return;
      }
    }

    wsSend({ type: 'find-match' });
  };

  const handleAccept = () => {
    wsSend({ type: 'accept-match', sessionId: sessionIdRef.current });
  };

  const handleNext = () => {
    cleanupPeer();
    setQueueMsg('Finding someone new...');
    setView('queue');
    wsSend({ type: 'next' });
  };

  const handleReport = async (reason) => {
    setShowReport(false);

    await api.report({
      reporterId: deviceIdRef.current,
      reportedId: peerDeviceIdRef.current || 'unknown',
      sessionId:  sessionIdRef.current    || 'unknown',
      reason,
    }).catch(() => {});

    handleNext();
  };

  const handleReconnectSearch = async () => {
    const id = reconnectInput.trim().toUpperCase();
    if (!id.startsWith('MC-')) {
      setStatusMsg('Enter a valid MC-XXXXX ID');
      return;
    }
    // Verify the ID exists first
    const data = await api.checkReconnectId(id).catch(() => null);
    if (!data || !data.available) {
      setStatusMsg('User not available right now');
      return;
    }
    wsSend({ type: 'reconnect-by-id', targetReconnectId: id });
  };

  const handleToggleMic = () => {
    const enabled = !micActive;
    setMicActive(enabled);
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = enabled; });
  };

  const handleToggleVideo = () => {
    const enabled = !videoActive;
    setVideoActive(enabled);
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = enabled; });
  };

  const copyReconnectId = () => {
    navigator.clipboard.writeText(reconnectIdRef.current || '').catch(() => {});
    setStatusMsg('Reconnect ID copied!');
    setTimeout(() => setStatusMsg(''), 2000);
  };

  // ── Accept timer (preview screen) ─────────────────────────────────────────
  useEffect(() => {
    if (view !== 'preview') return;
    if (acceptTimer <= 0) {
      handleNext();
      return;
    }
    const t = setInterval(() => setAcceptTimer(n => n - 1), 1000);
    return () => clearInterval(t);
  }, [view, acceptTimer]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col max-w-md mx-auto overflow-hidden">

      {/* Header */}
      <header className="p-5 flex items-center justify-between border-b border-zinc-900 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-xl italic">M</div>
          <h1 className="text-xl font-bold tracking-tight">Maya <span className="text-indigo-500">Connect</span></h1>
        </div>
        <div className="px-3 py-1 bg-zinc-900 rounded-full text-[10px] font-bold text-zinc-500 uppercase tracking-widest border border-zinc-800">
          Telangana Beta
        </div>
      </header>

      <main className="flex-1 relative flex flex-col p-4 overflow-hidden">

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {view === 'loading' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          </div>
        )}

        {/* ── Banned ────────────────────────────────────────────────────── */}
        {view === 'banned' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 px-4">
            <AlertCircle size={48} className="text-red-500" />
            <h2 className="text-2xl font-bold">Account Restricted</h2>
            {banInfo?.type === 'permanent' ? (
              <p className="text-zinc-400">Your device has been permanently banned due to multiple violations.</p>
            ) : (
              <p className="text-zinc-400">
                Temporarily banned until{' '}
                <span className="text-white font-semibold">
                  {banInfo?.expiry?.toLocaleString()}
                </span>
              </p>
            )}
          </div>
        )}

        {/* ── Home ──────────────────────────────────────────────────────── */}
        {view === 'home' && (
          <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-6 text-center">

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium">
                <ShieldCheck size={16} /> 100% Anonymous &amp; Secure
              </div>

              <h2 className="text-4xl font-extrabold leading-tight">
                Connect with <br />
                <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                  Strangers via Video
                </span>
              </h2>

              <p className="text-zinc-400 text-lg">
                No login. No catfishing.<br />
                <span className="text-zinc-500 italic">Telugu-First community platform.</span>
              </p>

              {statusMsg && (
                <p className="text-sm text-amber-400 bg-amber-400/10 rounded-xl px-4 py-2">{statusMsg}</p>
              )}

              <div className="pt-6 space-y-4">
                <Button onClick={handleStart} className="w-full text-xl py-6 shadow-indigo-500/40">
                  <Video size={24} /> Start Video Chat
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  {/* Your MC-ID */}
                  <button
                    onClick={copyReconnectId}
                    className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-left hover:border-indigo-500/40 transition-colors"
                  >
                    <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">Your ID</p>
                    <p className="text-lg font-mono text-indigo-400">{reconnectIdRef.current || '...'}</p>
                  </button>

                  {/* Reconnect */}
                  <Button
                    variant="secondary"
                    className="flex flex-col items-start p-4 text-left"
                    onClick={() => setShowReconnectInput(v => !v)}
                  >
                    <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">Find</p>
                    <div className="flex items-center gap-2">
                      <UserPlus size={16} /> <span className="text-sm">Reconnect</span>
                    </div>
                  </Button>
                </div>

                {/* Reconnect ID input */}
                {showReconnectInput && (
                  <div className="flex gap-2 animate-in slide-in-from-top-2 duration-200">
                    <input
                      value={reconnectInput}
                      onChange={e => setReconnectInput(e.target.value)}
                      placeholder="MC-XXXXX"
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-indigo-500"
                      onKeyDown={e => e.key === 'Enter' && handleReconnectSearch()}
                    />
                    <Button onClick={handleReconnectSearch} className="px-4">
                      <Search size={18} />
                    </Button>
                  </div>
                )}
              </div>

              <div className="pt-8 flex items-center justify-center gap-8 opacity-40">
                {['18+|ADULTS ONLY', 'TG|TELANGANA', 'AP|ANDHRA'].map(item => {
                  const [badge, label] = item.split('|');
                  return (
                    <div key={badge} className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 rounded-full border border-zinc-700 flex items-center justify-center text-xs font-bold">{badge}</div>
                      <span className="text-[10px] font-bold">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Queue ─────────────────────────────────────────────────────── */}
        {view === 'queue' && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500 rounded-full blur-3xl opacity-20 animate-pulse" />
              <div className="w-32 h-32 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Video size={40} className="text-indigo-500" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold">{queueMsg}</h3>
              <p className="text-zinc-500 font-medium italic">Hyderabad · Vijayawada · Warangal</p>
            </div>
            <Button variant="ghost" onClick={() => { wsSend({ type: 'end-session' }); setView('home'); }}>
              Cancel
            </Button>
          </div>
        )}

        {/* ── Preview (blurred + accept timer) ──────────────────────────── */}
        {view === 'preview' && (
          <div className="flex-1 flex flex-col gap-4 animate-in zoom-in-95 duration-300">
            <div className="flex-1 flex flex-col gap-3">

              {/* Remote — blurred */}
              <div className="relative flex-1 bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 flex items-center justify-center">
                <video
                  ref={remoteVideoRef}
                  autoPlay playsInline
                  className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
                <div className="z-20 text-zinc-400 text-sm font-medium">Blurred Preview</div>
              </div>

              {/* Local */}
              <div className="relative h-28 bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute bottom-2 left-3 text-xs font-semibold text-white/70">You</div>
              </div>
            </div>

            <div className="p-4 bg-indigo-600 rounded-3xl flex items-center justify-between shadow-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl font-black">
                  {acceptTimer}
                </div>
                <div>
                  <p className="font-bold text-lg leading-none">Accept Match?</p>
                  <p className="text-white/70 text-sm">Both must tap accept</p>
                </div>
              </div>
              <button
                onClick={handleAccept}
                className="bg-white text-indigo-600 px-6 py-3 rounded-2xl font-black uppercase tracking-wider active:scale-95 transition-all"
              >
                Accept
              </button>
            </div>

            <Button variant="ghost" onClick={handleNext}>Skip This User</Button>
          </div>
        )}

        {/* ── Chat (live call) ───────────────────────────────────────────── */}
        {view === 'chat' && (
          <div className="flex-1 flex flex-col gap-4 animate-in slide-in-from-right-10 duration-500">
            <div className="flex-1 relative">

              {/* Remote video — full */}
              <div className="absolute inset-0 bg-zinc-900 rounded-3xl overflow-hidden">
                <video
                  ref={remoteVideoRef}
                  autoPlay playsInline
                  className="w-full h-full object-cover"
                />
                {/* Fallback placeholder when stream not ready */}
                <div className="absolute inset-0 flex items-center justify-center text-zinc-600 pointer-events-none">
                  <Video size={40} />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              </div>

              {/* Local video — floating PiP */}
              <div className="absolute top-4 right-4 w-24 h-32 rounded-2xl overflow-hidden border-2 border-indigo-500 shadow-2xl z-30">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>

              {/* LIVE badge */}
              <div className="absolute top-4 left-4 z-30">
                <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xs font-bold tracking-wider">LIVE</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-4 gap-3">
              <Button
                variant="secondary"
                className={!micActive ? 'bg-red-500/20 text-red-500' : ''}
                onClick={handleToggleMic}
              >
                {micActive ? <Mic size={24} /> : <MicOff size={24} />}
              </Button>
              <Button
                variant="secondary"
                className={!videoActive ? 'bg-red-500/20 text-red-500' : ''}
                onClick={handleToggleVideo}
              >
                {videoActive ? <Video size={24} /> : <VideoOff size={24} />}
              </Button>
              <Button variant="danger" onClick={() => setShowReport(true)}>
                <Flag size={24} />
              </Button>
              <Button variant="primary" onClick={handleNext}>
                <ArrowRight size={24} />
              </Button>
            </div>

            <div className="flex items-center justify-between px-2">
              <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">E2E Encrypted</p>
              <button
                onClick={copyReconnectId}
                className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest hover:underline"
              >
                Share My ID
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Report modal ────────────────────────────────────────────────────── */}
      {showReport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end p-4 animate-in fade-in slide-in-from-bottom-20">
          <div className="w-full bg-zinc-900 rounded-3xl p-6 border border-zinc-800 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <AlertCircle className="text-red-500" /> Report User
              </h3>
              <button onClick={() => setShowReport(false)} className="text-zinc-500"><X /></button>
            </div>

            <div className="grid gap-2">
              {['Inappropriate Content', 'Abusive Behavior', 'Spam / Bot', 'Minor (Under 18)'].map(reason => (
                <button
                  key={reason}
                  onClick={() => handleReport(reason)}
                  className="w-full p-4 rounded-2xl bg-zinc-800 text-left hover:bg-zinc-700 transition-colors font-medium border border-zinc-700/50"
                >
                  {reason}
                </button>
              ))}
            </div>

            <p className="text-xs text-zinc-500 text-center px-4">
              Malicious reports may result in your device being banned.
            </p>
          </div>
        </div>
      )}

      {/* ── Bottom nav (home only) ───────────────────────────────────────────── */}
      {view === 'home' && (
        <nav className="p-6 border-t border-zinc-900 bg-zinc-900/20 grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center gap-1 text-indigo-500">
            <Video size={24} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Connect</span>
          </div>
          <div className="flex flex-col items-center gap-1 text-zinc-600 cursor-not-allowed">
            <ShieldCheck size={24} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Safety</span>
          </div>
        </nav>
      )}
    </div>
  );
}
