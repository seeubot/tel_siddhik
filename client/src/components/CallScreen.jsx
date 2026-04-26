import React, { useState, useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Mic, MicOff, Video, VideoOff,
  UserPlus, Zap, Pencil, Check,
} from 'lucide-react';
import styles from './CallScreen.module.css';

// ── Server URL ────────────────────────────────────────────────────────────────
// Set VITE_SERVER_URL in your .env, e.g. VITE_SERVER_URL=https://your-server.com
const SOCKET_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────────────────────

const CallScreen = () => {
  // Media
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [camError,     setCamError]     = useState(false);

  // Connection
  const [roomId,      setRoomId]      = useState(null);
  const [partnerId,   setPartnerId]   = useState(null);
  const [partnerName, setPartnerName] = useState('Waiting...');
  const [searching,   setSearching]   = useState(false);

  // UI
  const [uiVisible,    setUiVisible]    = useState(true);
  const [userName,     setUserName]     = useState('You');
  const [editingName,  setEditingName]  = useState(false);
  const [nameInput,    setNameInput]    = useState('You');

  // Refs — values that must be readable inside socket callbacks without stale closures
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const socketRef      = useRef(null);
  const pcRef          = useRef(null);   // RTCPeerConnection
  const uiTimerRef     = useRef(null);
  const nameInputRef   = useRef(null);
  const roomIdRef      = useRef(null);
  const partnerIdRef   = useRef(null);
  const audioRef       = useRef(audioEnabled);
  const videoRef       = useRef(videoEnabled);
  const userNameRef    = useRef('You');

  // Keep mutable refs in sync
  useEffect(() => { roomIdRef.current    = roomId;      }, [roomId]);
  useEffect(() => { partnerIdRef.current = partnerId;   }, [partnerId]);
  useEffect(() => { audioRef.current     = audioEnabled; }, [audioEnabled]);
  useEffect(() => { videoRef.current     = videoEnabled; }, [videoEnabled]);
  useEffect(() => { userNameRef.current  = userName;    }, [userName]);

  // ── 1. Acquire local camera + mic ─────────────────────────────────────────
  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      })
      .catch(() => { if (active) setCamError(true); });

    return () => {
      active = false;
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── 2. Toggle video track (+ broadcast to partner) ────────────────────────
  useEffect(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = videoEnabled; });
    if (socketRef.current?.connected && roomIdRef.current) {
      socketRef.current.emit('media-state', {
        roomId: roomIdRef.current,
        audioEnabled: audioRef.current,
        videoEnabled,
      });
    }
  }, [videoEnabled]);

  // ── 3. Toggle audio track (+ broadcast to partner) ────────────────────────
  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = audioEnabled; });
    if (socketRef.current?.connected && roomIdRef.current) {
      socketRef.current.emit('media-state', {
        roomId: roomIdRef.current,
        audioEnabled,
        videoEnabled: videoRef.current,
      });
    }
  }, [audioEnabled]);

  // ── 4. Close peer connection helper ──────────────────────────────────────
  const closePeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack        = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  // ── 5. Create RTCPeerConnection ───────────────────────────────────────────
  const createPeerConnection = useCallback((iceServers, targetId) => {
    closePeerConnection();

    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    // Add our local tracks so the partner receives them
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Forward ICE candidates to the partner via the signalling server
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', { targetId, candidate });
      }
    };

    // When the partner's tracks arrive, attach them to the remote <video>
    pc.ontrack = ({ streams }) => {
      if (remoteVideoRef.current && streams[0]) {
        remoteVideoRef.current.srcObject = streams[0];
      }
    };

    return pc;
  }, [closePeerConnection]);

  // ── 6. Socket.IO + signalling ─────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    // ── Connected ──────────────────────────────────────────────────────────
    socket.on('connect', () => {
      // Tell the server our name immediately
      socket.emit('set-user-name', { userName: userNameRef.current });
      // Join the random queue straight away
      socket.emit('join-random');
      setSearching(true);
      setPartnerName('Searching...');
    });

    // ── In queue, waiting ──────────────────────────────────────────────────
    socket.on('waiting-for-match', () => {
      setSearching(true);
      setPartnerName('Searching...');
    });

    // ── Matched — create peer connection ──────────────────────────────────
    socket.on('room-joined', async ({ roomId: rid, peers, iceServers }) => {
      const peer = peers[0];
      if (!peer) return;

      setRoomId(rid);
      setPartnerId(peer.socketId);
      setPartnerName(peer.userName || 'Stranger');
      setSearching(false);

      const pc = createPeerConnection(iceServers, peer.socketId);

      // The side with the lower socket ID is the caller (creates the offer).
      // This guarantees exactly one side initiates.
      if (socket.id < peer.socketId) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { targetId: peer.socketId, offer });
      }
    });

    // ── Receive offer (callee) ─────────────────────────────────────────────
    socket.on('offer', async ({ offer, fromId }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { targetId: fromId, answer });
    });

    // ── Receive answer (caller) ───────────────────────────────────────────
    socket.on('answer', async ({ answer }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    // ── Exchange ICE candidates ────────────────────────────────────────────
    socket.on('ice-candidate', async ({ candidate }) => {
      const pc = pcRef.current;
      if (!pc || !candidate) return;
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) { /* ignore */ }
    });

    // ── Partner disconnected / left ────────────────────────────────────────
    socket.on('partner-left', () => {
      closePeerConnection();
      setPartnerId(null);
      setRoomId(null);
      setPartnerName('Waiting...');
      // Server will schedule auto-search — just show the state
      setTimeout(() => {
        setSearching(true);
        setPartnerName('Searching...');
      }, 600);
    });

    // ── Skip confirmed — we're already searching again ─────────────────────
    socket.on('skip-confirmed', () => {
      // Server put us back in the queue; waiting-for-match will fire shortly
      closePeerConnection();
      setPartnerId(null);
      setRoomId(null);
    });

    // ── Server scheduled an auto-search for us ─────────────────────────────
    socket.on('auto-search-scheduled', () => {
      setSearching(true);
      setPartnerName('Searching...');
    });

    return () => {
      closePeerConnection();
      socket.disconnect();
    };
  }, [createPeerConnection, closePeerConnection]); // stable — only runs once

  // ── 7. Sync username changes to the server ────────────────────────────────
  useEffect(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('set-user-name', { userName });
    }
  }, [userName]);

  // ── 8. UI auto-hide timer ─────────────────────────────────────────────────
  const resetUiTimer = useCallback(() => {
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
  }, []);

  useEffect(() => {
    resetUiTimer();
    return () => { if (uiTimerRef.current) clearTimeout(uiTimerRef.current); };
  }, [resetUiTimer]);

  const handleRootClick = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    setUiVisible(prev => { if (!prev) resetUiTimer(); return !prev; });
  };

  // ── 9. Editable username ──────────────────────────────────────────────────
  const startEditName = (e) => {
    e.stopPropagation();
    setNameInput(userName);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  };

  const commitName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) setUserName(trimmed);
    else setNameInput(userName);
    setEditingName(false);
  };

  const handleNameKey = (e) => {
    if (e.key === 'Enter') commitName();
    if (e.key === 'Escape') { setEditingName(false); setNameInput(userName); }
  };

  // ── 10. Skip ──────────────────────────────────────────────────────────────
  const onSkip = () => {
    closePeerConnection();

    if (roomIdRef.current && socketRef.current) {
      // Tell server to skip — it will re-queue both sides
      socketRef.current.emit('skip', { roomId: roomIdRef.current });
    } else if (socketRef.current) {
      socketRef.current.emit('join-random');
    }

    setPartnerId(null);
    setRoomId(null);
    setSearching(true);
    setPartnerName('Searching...');
  };

  const isConnected = !!partnerId;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.appContainer} onClick={handleRootClick}>
      <div className={styles.grain} aria-hidden="true" />

      {/* ── PARTNER PANEL ── */}
      <div className={`${styles.panel} ${styles.partnerPanel} ${searching ? styles.searchingBlur : ''}`}>

        {/* Remote video — always in DOM; srcObject is set/cleared by WebRTC */}
        <video
          ref={remoteVideoRef}
          className={styles.videoEl}
          autoPlay
          playsInline
          style={{ display: isConnected ? 'block' : 'none' }}
        />

        {/* Placeholder shown when no partner */}
        {!isConnected && (
          <div className={styles.partnerWaiting}>
            <span className={styles.placeholderBrand}>OREY!</span>
          </div>
        )}

        <div className={`${styles.statusBadge} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={styles.badgeContent}>
            <div className={`${styles.dot} ${isConnected ? styles.dotGreen : styles.dotRed}`} />
            <span className={styles.badgeText}>{partnerName}</span>
          </div>
        </div>
      </div>

      {/* ── LOCAL PANEL ── */}
      <div className={`${styles.panel} ${styles.localPanel}`}>
        {camError ? (
          <div className={styles.camError}>
            <VideoOff size={36} />
            <span>Camera unavailable</span>
          </div>
        ) : (
          <>
            {/* Local video — always mounted so srcObject assignment lands correctly */}
            <video
              ref={localVideoRef}
              className={`${styles.videoEl} ${styles.mirrored}`}
              autoPlay
              muted
              playsInline
              style={{ display: videoEnabled ? 'block' : 'none' }}
            />
            {!videoEnabled && (
              <div className={styles.idleIcon}><VideoOff size={40} /></div>
            )}
          </>
        )}

        <div className={`${styles.statusBadge} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={styles.badgeContent}>
            <div className={`${styles.dot} ${styles.dotGray}`} />
            {editingName ? (
              <>
                <input
                  ref={nameInputRef}
                  className={styles.badgeNameInput}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={handleNameKey}
                  maxLength={20}
                />
                <button className={styles.badgeEditBtn} onClick={commitName}>
                  <Check size={11} />
                </button>
              </>
            ) : (
              <>
                <span className={styles.badgeText}>{userName}</span>
                <button className={styles.badgeEditBtn} onClick={startEditName}>
                  <Pencil size={10} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTROLS DOCK ── */}
      <div className={`${styles.controlDock} ${!uiVisible ? styles.dockHidden : ''}`}>
        <div className={styles.pillBar}>
          <button onClick={onSkip} className={styles.nextBtn}>
            NEXT <Zap size={14} fill="currentColor" />
          </button>

          <div className={styles.divider} />

          <div className={styles.mediaActions}>
            <button
              onClick={() => setVideoEnabled(v => !v)}
              className={`${styles.iconBtn} ${!videoEnabled ? styles.btnActive : ''}`}
              title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button
              onClick={() => setAudioEnabled(a => !a)}
              className={`${styles.iconBtn} ${!audioEnabled ? styles.btnActive : ''}`}
              title={audioEnabled ? 'Mute' : 'Unmute'}
            >
              {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button className={styles.iconBtn} title="Add friend">
              <UserPlus size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ── SEARCHING OVERLAY ── */}
      {searching && (
        <div className={styles.overlay}>
          <div className={styles.loadingContainer}>
            <div className={styles.loadingTrack}>
              <div className={styles.loadingFill} />
            </div>
            <p className={styles.syncLabel}>SYNCING PEERS</p>
            <button
              className={styles.cancelBtn}
              onClick={() => {
                socketRef.current?.emit('cancel-random');
                setSearching(false);
                setPartnerName('Waiting...');
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CallScreen;
