import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Loader,
  Flag, Shield, Activity,
  AlertTriangle,
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro — CallScreen
 *
 * Props
 * ─────
 * socket          : Socket.IO socket instance (required)
 * localVideoRef   : ref for local <video>
 * remoteVideoRef  : ref for remote <video>
 * roomId          : current room id string
 * partner         : { socketId, userName, oreyId, deviceId } | null
 * audioEnabled    : bool
 * videoEnabled    : bool
 * partnerMedia    : { video: bool, audio: bool }
 * searching       : bool  – currently in random queue
 * autoSearchCountdown : number | null  – seconds until auto-search fires
 * onToggleAudio   : () => void
 * onToggleVideo   : () => void
 * onSkip          : () => void   – emits 'skip' then re-queues
 * onLeave         : () => void   – emits 'leave-chat' and navigates away
 * onCancelAutoSearch : () => void
 * onFindRandomPeer: () => void
 * onReport        : () => void
 *
 * All socket emissions that happen INSIDE this component:
 *   • media-state  (audio/video toggle)
 *   • skip         (next peer)
 *   • leave-chat
 *   • cancel-random / cancel-auto-search
 *   • report-user  (via ReportModal)
 *   • offer / answer / ice-candidate  (WebRTC signalling)
 *
 * The parent is only responsible for:
 *   • creating the socket
 *   • acquiring / passing localStream via localVideoRef.current.srcObject
 *   • passing in roomId + partner after 'room-joined' fires
 */

// ─── Reason catalogue (mirrors server HIGH_PRIORITY_REASONS) ──────────────────
const ALL_REASONS = [
  { label: 'Nudity / Sexual Content',  hp: true  },
  { label: 'Sexual Harassment',        hp: true  },
  { label: 'Underage User',            hp: true  },
  { label: 'Violence / Threats',       hp: true  },
  { label: 'Inappropriate Behavior',   hp: false },
  { label: 'Hate Speech',              hp: false },
  { label: 'Spam / Bot',               hp: false },
  { label: 'Other',                    hp: false },
];

// ─── Report Modal ─────────────────────────────────────────────────────────────
const ReportModal = ({ partner, socket, onClose }) => {
  const [selected, setSelected] = useState(null);
  const [desc, setDesc]         = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = useCallback(() => {
    if (!selected || !partner) return;
    socket.emit('report-user', {
      reportedDeviceId: partner.deviceId   || partner.socketId,
      reportedUserId:   partner.oreyId     || null,
      reason:           selected,
      description:      desc.trim(),
    });
    setSubmitted(true);
    setTimeout(onClose, 1800);
  }, [selected, desc, partner, socket, onClose]);

  return (
    <div className={styles.reportBackdrop} onClick={onClose}>
      <div className={styles.reportCard} onClick={e => e.stopPropagation()}>
        {submitted ? (
          <div className={styles.reportSuccess}>
            <div className={styles.reportSuccessIcon}>✓</div>
            <p className={styles.reportSuccessText}>Report submitted</p>
          </div>
        ) : (
          <>
            <div className={styles.reportHeader}>
              <div className={styles.reportTitle}>
                <Flag size={14} className={styles.reportTitleIcon} />
                Report User
              </div>
              <button className={styles.reportClose} onClick={onClose}>✕</button>
            </div>

            <p className={styles.reportHint}>
              High-priority violations are reviewed immediately and may trigger an instant ban.
            </p>

            <div className={styles.reasonGrid}>
              {ALL_REASONS.map(({ label, hp }) => (
                <button
                  key={label}
                  className={[
                    styles.reasonBtn,
                    hp        ? styles.reasonBtnHp       : '',
                    selected === label ? styles.reasonBtnSelected : '',
                  ].join(' ')}
                  onClick={() => setSelected(label)}
                >
                  {hp && <AlertTriangle size={10} className={styles.hpIcon} />}
                  {label}
                </button>
              ))}
            </div>

            <textarea
              className={styles.reportDesc}
              placeholder="Additional details (optional)…"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={3}
            />

            <button
              className={styles.btnSubmitReport}
              disabled={!selected}
              onClick={submit}
            >
              Submit Report
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─── CallScreen ───────────────────────────────────────────────────────────────
const CallScreen = ({
  socket            = null,
  localVideoRef,
  remoteVideoRef,
  roomId            = null,
  partner           = null,
  audioEnabled      = true,
  videoEnabled      = true,
  partnerMedia      = { video: true, audio: true },
  searching         = false,
  autoSearchCountdown = null,
  onToggleAudio     = () => {},
  onToggleVideo     = () => {},
  onSkip            = () => {},
  onLeave           = () => {},
  onCancelAutoSearch = () => {},
  onFindRandomPeer  = () => {},
  onReport          = () => {},  // optional external override
}) => {
  const [uiVisible,    setUiVisible]    = useState(true);
  const [nextLoading,  setNextLoading]  = useState(false);
  const [showReport,   setShowReport]   = useState(false);
  const [localVideoOn, setLocalVideoOn] = useState(videoEnabled);
  const [localAudioOn, setLocalAudioOn] = useState(audioEnabled);
  const [remoteHasStream, setRemoteHasStream] = useState(false);

  // Internal refs
  const uiTimerRef    = useRef(null);
  const pcRef         = useRef(null);   // RTCPeerConnection

  // ── ICE servers come from server via 'video-quality-config' ──────────────
  const iceServersRef = useRef([
    { urls: 'stun:stun.l.google.com:19302'  },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]);

  // ── Auto-hide UI ──────────────────────────────────────────────────────────
  const resetUiTimer = useCallback(() => {
    setUiVisible(true);
    clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove',  resetUiTimer);
    window.addEventListener('touchstart', resetUiTimer);
    resetUiTimer();
    return () => {
      window.removeEventListener('mousemove',  resetUiTimer);
      window.removeEventListener('touchstart', resetUiTimer);
      clearTimeout(uiTimerRef.current);
    };
  }, [resetUiTimer]);

  // ── Mirror prop changes from parent ──────────────────────────────────────
  useEffect(() => { setLocalVideoOn(videoEnabled); }, [videoEnabled]);
  useEffect(() => { setLocalAudioOn(audioEnabled); }, [audioEnabled]);

  // ── WebRTC helpers ────────────────────────────────────────────────────────
  const closePeer = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack          = null;
      pcRef.current.onicecandidate   = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteHasStream(false);
    if (remoteVideoRef?.current) remoteVideoRef.current.srcObject = null;
  }, [remoteVideoRef]);

  const buildPeerConnection = useCallback(() => {
    closePeer();
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pcRef.current = pc;

    // Attach local tracks
    const localStream = localVideoRef?.current?.srcObject;
    if (localStream) {
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }

    pc.ontrack = (e) => {
      if (e.streams?.[0] && remoteVideoRef?.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
        setRemoteHasStream(true);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && partner?.socketId && socket) {
        socket.emit('ice-candidate', { targetId: partner.socketId, candidate: e.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
        setRemoteHasStream(false);
      }
    };

    return pc;
  }, [closePeer, localVideoRef, remoteVideoRef, partner, socket]);

  const makeOffer = useCallback(async (targetId) => {
    const pc = pcRef.current || buildPeerConnection();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket?.emit('offer', { targetId, offer });
    } catch (err) { console.error('[WebRTC] offer error', err); }
  }, [buildPeerConnection, socket]);

  // ── Socket event listeners ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onConfig = ({ servers }) => {
      if (servers) iceServersRef.current = servers;
    };

    const onUserJoined = ({ socketId }) => {
      // We're the callee – build PC and wait for offer
      buildPeerConnection();
      // If we are also the initiator (autoMatched caller), make offer
      if (partner?.socketId === socketId) makeOffer(socketId);
    };

    const onOffer = async ({ offer, fromId }) => {
      const pc = pcRef.current || buildPeerConnection();
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { targetId: fromId, answer });
      } catch (err) { console.error('[WebRTC] answer error', err); }
    };

    const onAnswer = async ({ answer }) => {
      const pc = pcRef.current;
      if (pc && pc.signalingState !== 'stable') {
        try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); }
        catch (err) { console.error('[WebRTC] setRemoteDesc error', err); }
      }
    };

    const onIce = async ({ candidate }) => {
      if (pcRef.current && candidate) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (_) {}
      }
    };

    const onPartnerLeft = () => {
      closePeer();
    };

    const onRoomJoined = ({ roomId: rid, peers, iceServers }) => {
      if (iceServers) iceServersRef.current = iceServers;
      buildPeerConnection();
      // If we got peers immediately (auto-match), we are the initiator
      if (peers?.length) {
        makeOffer(peers[0].socketId);
      }
    };

    socket.on('video-quality-config', onConfig);
    socket.on('room-joined',          onRoomJoined);
    socket.on('user-joined',          onUserJoined);
    socket.on('offer',                onOffer);
    socket.on('answer',               onAnswer);
    socket.on('ice-candidate',        onIce);
    socket.on('partner-left',         onPartnerLeft);
    socket.on('skip-confirmed',       closePeer);

    return () => {
      socket.off('video-quality-config', onConfig);
      socket.off('room-joined',          onRoomJoined);
      socket.off('user-joined',          onUserJoined);
      socket.off('offer',                onOffer);
      socket.off('answer',               onAnswer);
      socket.off('ice-candidate',        onIce);
      socket.off('partner-left',         onPartnerLeft);
      socket.off('skip-confirmed',       closePeer);
    };
  }, [socket, buildPeerConnection, makeOffer, closePeer, partner]);

  // Cleanup peer on unmount
  useEffect(() => () => closePeer(), [closePeer]);

  // ── Toggle handlers (emit media-state) ───────────────────────────────────
  const handleToggleVideo = useCallback(() => {
    onToggleVideo();
    const next = !localVideoOn;
    setLocalVideoOn(next);
    if (roomId && socket) {
      socket.emit('media-state', { roomId, audioEnabled: localAudioOn, videoEnabled: next });
    }
  }, [onToggleVideo, localVideoOn, localAudioOn, roomId, socket]);

  const handleToggleAudio = useCallback(() => {
    onToggleAudio();
    const next = !localAudioOn;
    setLocalAudioOn(next);
    if (roomId && socket) {
      socket.emit('media-state', { roomId, audioEnabled: next, videoEnabled: localVideoOn });
    }
  }, [onToggleAudio, localAudioOn, localVideoOn, roomId, socket]);

  // ── Skip / Next ───────────────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    if (nextLoading) return;
    setNextLoading(true);
    closePeer();

    if (roomId && socket) {
      socket.emit('skip', { roomId });
    } else {
      onFindRandomPeer?.();
    }

    setTimeout(() => setNextLoading(false), 2200);
  }, [nextLoading, roomId, socket, closePeer, onFindRandomPeer]);

  // ── Leave ─────────────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    closePeer();
    if (roomId && socket) socket.emit('leave-chat', { roomId });
    onLeave?.();
  }, [closePeer, roomId, socket, onLeave]);

  // ── Cancel auto-search ────────────────────────────────────────────────────
  const handleCancelAutoSearch = useCallback(() => {
    socket?.emit('cancel-auto-search');
    socket?.emit('cancel-random');
    onCancelAutoSearch?.();
  }, [socket, onCancelAutoSearch]);

  // ── Report ────────────────────────────────────────────────────────────────
  const handleOpenReport = useCallback(() => {
    if (typeof onReport === 'function' && onReport !== (() => {})) {
      onReport(); // parent override
    } else {
      setShowReport(true);
    }
  }, [onReport]);

  // ─── Derived ──────────────────────────────────────────────────────────────
  const isConnected = !!partner && remoteHasStream;

  return (
    <div className={styles.container}>
      {/* Noise */}
      <div className={styles.noiseLayer} />

      {/* ── REMOTE PANE (left/top — 50%) ─── */}
      <div className={styles.remoteView}>
        <video
          ref={remoteVideoRef}
          className={`${styles.videoBase} ${(searching && !isConnected) ? styles.searchingBlur : ''}`}
          autoPlay
          playsInline
          style={{ display: remoteHasStream ? 'block' : 'none' }}
        />

        {!remoteHasStream && (
          <div className={styles.placeholder}>
            <div className={styles.brandText}>Orey!</div>
            {searching && (
              <div className={styles.loadingDots}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
            )}
          </div>
        )}

        {/* Partner muted indicator */}
        {partner && !partnerMedia?.audio && (
          <div className={styles.remoteMuteBadge}>
            <MicOff size={13} />
          </div>
        )}
      </div>

      {/* ── LOCAL PANE (right/bottom — 50%) ─── */}
      <div className={styles.localView}>
        <video
          ref={localVideoRef}
          className={`${styles.videoBase} ${styles.mirrored}`}
          autoPlay
          playsInline
          muted
          style={{ display: localVideoOn ? 'block' : 'none' }}
        />

        {!localVideoOn && (
          <div className={styles.cameraOffOverlay}>
            <div className={styles.cameraOffIcon}>
              <VideoOff size={32} className={styles.cameraOffSvg} />
            </div>
            <span className={styles.cameraOffText}>Camera Suspended</span>
          </div>
        )}

        {!localAudioOn && (
          <div className={styles.muteIndicator}>
            <MicOff size={14} className={styles.muteIcon} />
          </div>
        )}

        {/* YOU label */}
        <div className={styles.paneLabel}>YOU</div>
      </div>

      {/* ── CONTROL UI (fades on idle) ─── */}
      <div className={`${styles.controlWrapper} ${!uiVisible ? styles.uiHidden : ''}`}>

        {/* Partner info bar */}
        {partner && (
          <div className={styles.partnerBar}>
            <div className={styles.partnerInfo}>
              <div className={styles.partnerAvatar}>
                {(partner.userName || '?').charAt(0).toUpperCase()}
              </div>
              <span className={styles.partnerName}>
                {partner.userName || 'Anonymous'}
              </span>
            </div>
            <button
              onClick={handleOpenReport}
              className={styles.reportBtn}
              title="Report User"
            >
              <Flag size={13} />
              <span>Report</span>
            </button>
          </div>
        )}

        {/* Status pill */}
        <div className={styles.statusPill}>
          <div className={`${styles.statusDot} ${isConnected ? styles.statusConnected : styles.statusSearching}`} />
          <span className={styles.statusText}>
            {isConnected
              ? `Live Hub · ${roomId || '—'}`
              : searching
                ? 'Searching Mesh…'
                : 'Waiting…'}
          </span>
          <div className={styles.statusDivider} />
          <Activity size={12} className={styles.statusActivity} />
        </div>

        {/* Main island */}
        <div className={styles.mainIsland}>
          {/* Media controls */}
          <div className={styles.controlsLeft}>
            <button
              onClick={handleToggleVideo}
              className={`${styles.controlBtn} ${!localVideoOn ? styles.btnDanger : styles.btnDefault}`}
              title={localVideoOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {localVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              onClick={handleToggleAudio}
              className={`${styles.controlBtn} ${!localAudioOn ? styles.btnDanger : styles.btnDefault}`}
              title={localAudioOn ? 'Mute mic' : 'Unmute mic'}
            >
              {localAudioOn ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
          </div>

          {/* Next / Skip */}
          <button
            onClick={handleNext}
            disabled={nextLoading}
            className={styles.nextBtn}
          >
            {nextLoading
              ? <Loader size={18} className={styles.spinner} />
              : <Zap    size={18} className={styles.zapIcon}  />
            }
            <span>{nextLoading ? 'Wait' : 'Next'}</span>
          </button>

          {/* Utility controls */}
          <div className={styles.controlsRight}>
            <button
              onClick={handleOpenReport}
              className={`${styles.controlBtn} ${styles.btnReport}`}
              title="Report User"
            >
              <Flag size={19} />
            </button>
            <button
              onClick={handleLeave}
              className={`${styles.controlBtn} ${styles.btnDanger} ${styles.btnLeave}`}
              title="Leave call"
            >
              <PhoneOff size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* ── OVERLAYS ─── */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay}>
          {autoSearchCountdown !== null ? (
            <div className={styles.countdownOverlay}>
              <div className={styles.countdownText}>{autoSearchCountdown}</div>
              <div className={styles.encryptionBadge}>
                <Shield size={16} className={styles.shieldIcon} />
                <span className={styles.encryptionText}>Encryption Linked</span>
              </div>
              <button
                onClick={handleCancelAutoSearch}
                className={styles.terminateBtn}
              >
                Terminate Session
              </button>
            </div>
          ) : (
            <div className={styles.searchingOverlay}>
              <div className={styles.spinnerContainer}>
                <div className={styles.spinnerOuter} />
                <div className={styles.spinnerInner} />
              </div>
              <div className={styles.synchronizingText}>Synchronizing</div>
            </div>
          )}
        </div>
      )}

      {/* ── REPORT MODAL ─── */}
      {showReport && (
        <ReportModal
          partner={partner}
          socket={socket}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
};

export default CallScreen;
