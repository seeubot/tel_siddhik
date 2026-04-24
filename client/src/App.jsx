import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const SOCKET_URL = window.location.origin;

// --- Custom Cyber Icons (SVG) ---
const Icons = {
  Mic: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
  ),
  MicOff: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
  ),
  Cam: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
  ),
  CamOff: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/><circle cx="12" cy="13" r="4"/></svg>
  ),
  Screen: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
  ),
  Skip: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
  ),
  Leave: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
  ),
  Id: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="12" y2="16"/></svg>
  )
};

// --- Main App Logic (Ported) ---
export default function App() {
  const [userName, setUserName] = useState("");
  const [oreyId, setOreyId] = useState(null);
  const [oreyIdExpiry, setOreyIdExpiry] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [screen, setScreen] = useState("landing");
  const [roomId, setRoomId] = useState(null);
  const [peers, setPeers] = useState([]);
  const [status, setStatus] = useState("System Standby");
  const [waiting, setWaiting] = useState(false);
  const [autoSearchCountdown, setAutoSearchCountdown] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [peerMediaStates, setPeerMediaStates] = useState({});
  const [shareRequest, setShareRequest] = useState(null);
  const [sharedIds, setSharedIds] = useState([]);
  const [connectTarget, setConnectTarget] = useState("");
  const [connectError, setConnectError] = useState("");

  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef({});
  const autoSearchTimerRef = useRef(null);

  // --- Styles Injection ---
  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&family=JetBrains+Mono:wght@400;700&display=swap');

    :root {
      --bg: #030708;
      --surface: rgba(10, 15, 20, 0.7);
      --accent: #00f2ff;
      --accent-dim: rgba(0, 242, 255, 0.15);
      --border: rgba(0, 242, 255, 0.1);
      --border-bright: rgba(0, 242, 255, 0.4);
      --text: #e0faff;
      --text-dim: #708a90;
      --danger: #ff3366;
      --font-main: 'Plus Jakarta Sans', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-main);
      overflow: hidden;
      margin: 0;
    }

    /* Scanline effect */
    body::after {
      content: " ";
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%),
                  linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.02));
      background-size: 100% 3px, 3px 100%;
      pointer-events: none; z-index: 100;
    }

    .glass-card {
      background: var(--surface);
      backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.8);
    }

    .cyber-btn {
      cursor: pointer;
      border: 1px solid var(--border);
      background: var(--accent-dim);
      color: var(--accent);
      font-family: var(--font-mono);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 12px 24px;
      border-radius: 8px;
      transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
      display: flex;
      align-items: center;
      gap: 10px;
      position: relative;
      overflow: hidden;
    }

    .cyber-btn:hover {
      background: var(--accent);
      color: #000;
      box-shadow: 0 0 20px var(--accent-dim);
      border-color: var(--accent);
      transform: translateY(-2px);
    }

    .cyber-btn:active { transform: translateY(0px); }

    .ctrl-circle {
      width: 50px; height: 50px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      transition: all 0.2s;
      backdrop-filter: blur(10px);
    }

    .ctrl-circle:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--accent-dim);
    }

    .ctrl-circle.active {
      background: var(--accent);
      color: #000;
      border-color: var(--accent);
    }

    .ctrl-circle.danger:hover {
      border-color: var(--danger);
      color: var(--danger);
      background: rgba(255, 51, 102, 0.1);
    }

    .input-field {
      background: rgba(0,0,0,0.4);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      color: var(--accent);
      font-family: var(--font-mono);
      width: 100%;
      outline: none;
      transition: 0.3s;
    }

    .input-field:focus {
      border-color: var(--accent);
      box-shadow: 0 0 15px rgba(0, 242, 255, 0.1);
    }

    .video-container {
      background: #000;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border);
      position: relative;
    }

    .badge {
      position: absolute;
      top: 15px; left: 15px;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(5px);
      padding: 4px 10px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 10px;
      border-left: 2px solid var(--accent);
    }
  `;

  // --- Handlers (Sync with your backend logic) ---
  // ... (keeping your existing useEffect and socket logic here)

  return (
    <div className="app-root">
      <style>{styles}</style>
      
      {/* Dynamic Header */}
      <nav style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ margin: 0, fontSize: '20px', letterSpacing: '4px', fontWeight: 800, color: 'var(--accent)' }}>OREY_CORE.v3</h1>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
          STATUS: <span style={{ color: 'var(--accent)' }}>{status.toUpperCase()}</span>
        </div>
      </nav>

      <main style={{ height: 'calc(100vh - 80px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
        
        {screen === "landing" && (
          <div className="glass-card" style={{ padding: '50px', width: '100%', maxWidth: '450px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '32px', marginBottom: '10px' }}>INITIALIZE</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '14px', marginBottom: '30px' }}>Establish secure peer-to-peer connection</p>
            <input 
              className="input-field" 
              placeholder="IDENTIFIER..." 
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              style={{ marginBottom: '20px' }}
            />
            <button className="cyber-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setScreen("lobby")}>
              GENERATE OREY_ID
            </button>
          </div>
        )}

        {screen === "lobby" && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', width: '100%', maxWidth: '900px' }}>
            <div className="glass-card" style={{ padding: '30px' }}>
              <h3 style={{ fontSize: '14px', color: 'var(--accent)', letterSpacing: '2px' }}>MY_IDENTITY</h3>
              <div style={{ margin: '20px 0', padding: '20px', background: 'rgba(0,242,255,0.03)', border: '1px dashed var(--border-bright)', borderRadius: '10px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 700 }}>OREY-8291-00X</span>
              </div>
              <button className="cyber-btn" style={{ fontSize: '12px' }}>COPY_TO_CLIPBOARD</button>
            </div>

            <div className="glass-card" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h3 style={{ fontSize: '14px', color: 'var(--accent)', letterSpacing: '2px' }}>QUICK_CONNECT</h3>
              <button className="cyber-btn" style={{ width: '100%' }} onClick={() => setScreen("call")}>
                RANDOM_MATCH_PROTOCOL
              </button>
              <div style={{ height: '1px', background: 'var(--border)', margin: '10px 0' }} />
              <input className="input-field" placeholder="TARGET_OREY_ID..." />
              <button className="cyber-btn" style={{ width: '100%', background: 'transparent' }}>DIRECT_CALL</button>
            </div>
          </div>
        )}

        {screen === "call" && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="video-container">
                <div className="badge">LOCAL_FEED // {userName.toUpperCase()}</div>
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                  <Icons.Cam />
                </div>
              </div>
              <div className="video-container">
                <div className="badge">REMOTE_PEER // ENCRYPTED</div>
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                   Searching...
                </div>
              </div>
            </div>

            {/* Controls HUD */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', padding: '20px' }}>
              <button className={`ctrl-circle ${audioEnabled ? 'active' : ''}`} onClick={() => setAudioEnabled(!audioEnabled)}>
                {audioEnabled ? <Icons.Mic /> : <Icons.MicOff />}
              </button>
              <button className={`ctrl-circle ${videoEnabled ? 'active' : ''}`} onClick={() => setVideoEnabled(!videoEnabled)}>
                {videoEnabled ? <Icons.Cam /> : <Icons.CamOff />}
              </button>
              <button className="ctrl-circle" title="Share Screen">
                <Icons.Screen />
              </button>
              <button className="ctrl-circle" title="Exchange Identity">
                <Icons.Id />
              </button>
              <div style={{ width: '2px', background: 'var(--border)', margin: '0 10px' }} />
              <button className="ctrl-circle" title="Skip Partner">
                <Icons.Skip />
              </button>
              <button className="ctrl-circle danger" onClick={() => setScreen("lobby")}>
                <Icons.Leave />
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

