import React, {
  useState, useCallback, useEffect, useRef,
} from 'react';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Zap, Loader, Flag, Shield, AlertTriangle,
  WifiOff, CheckCircle,
} from 'lucide-react';
import styles from './CallScreen.module.css';

/* ─── Constants ────────────────────────────────────────────── */
const HIGH_PRIORITY = [
  'Nudity / Sexual Content',
  'Sexual Harassment',
  'Underage User',
  'Violence / Threats',
];

const ALL_REASONS = [
  { label: 'Nudity / Sexual Content', hp: true  },
  { label: 'Sexual Harassment',       hp: true  },
  { label: 'Underage User',           hp: true  },
  { label: 'Violence / Threats',      hp: true  },
  { label: 'Inappropriate Behavior',  hp: false },
  { label: 'Hate Speech',             hp: false },
  { label: 'Spam / Bot',              hp: false },
  { label: 'Other',                   hp: false },
];

/* ─── Report Sheet ─────────────────────────────────────────── */
const ReportSheet = ({ partner, socket, onClose }) => {
  const [selected,  setSelected]  = useState(null);
  const [desc,      setDesc]      = useState('');
  const [done,      setDone]      = useState(false);

  const submit = useCallback(() => {
    if (!selected || !partner) return;
    socket?.emit('report-user', {
      reportedDeviceId: partner.deviceId || partner.socketId,
      reportedUserId:   partner.oreyId   || null,
      reason:           selected,
      description:      desc.trim(),
    });
    setDone(true);
    setTimeout(onClose, 1600);
  }, [selected, desc, partner, socket, onClose]);

  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        {done ? (
          <div className={styles.sheetDone}>
            <CheckCircle size={32} className={styles.sheetDoneIcon} />
            <span>Report submitted</span>
          </div>
        ) : (
          <>
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeader}>
              <Flag size={15} className={styles.sheetFlagIcon} />
              <span className={styles.sheetTitle}>Report</span>
              <button className={styles.sheetClose} onClick={onClose}>✕</button>
            </div>
            <p className={styles.sheetSub}>
              High-priority violations trigger immediate review.
            </p>

            <div className={styles.reasonList}>
              {ALL_REASONS.map(({ label, hp }) => (
                <button
                  key={label}
                  className={[
                    styles.reasonRow,
                    hp ? styles.reasonRowHp : '',
                    selected === label ? styles.reasonRowSelected : '',
                  ].join(' ')}
                  onClick={() => setSelected(label)}
                >
                  <span className={styles.reasonLabel}>{label}</span>
                  {hp && (
                    <span className={styles.hpBadge}>
                      <AlertTriangle size={9} /> High priority
                    </span>
                  )}
                </button>
              ))}
            </div>

            <textarea
              className={styles.descInput}
              placeholder="Additional details (optional)…"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
            />

            <button
              className={styles.submitBtn}
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

/* ─── CallScreen ───────────────────────────────────────────── */
const CallScreen = ({
  socket              = null,
  localVideoRef,
  remoteVideoRef,
  roomId              = null,
  partner             = null,
  audioEnabled        = true,
  videoEnabled        = true,
  partnerMedia        = { video: true, audio: true },
  searching           = false,
  autoSearchCountdown = null,
  onToggleAudio       = () => {},
  onToggleVideo       = () => {},
  onSkip              = () => {},
  onLeave             = () => {},
  onCancelAutoSearch  = () => {},
  onFindRandomPeer    = () => {},
  onReport,
}) => {
  /* — local state — */
  const [localVideoOn,    setLocalVideoOn]    = useState(videoEnabled);
  const [localAudioOn,    setLocalAudioOn]    = useState(audioEnabled);
  const [remoteStream,    setRemoteStream]    = useState(false);
  const [uiVisible,       setUiVisible]       = useState(true);
  const [nextLoading,     setNextLoading]     = useState(false);
  const [showReport,      setShowReport]      = useState(false);
  const [connState,       setConnState]       = useState('idle');
  // 'idle' | 'searching' | 'connecting' | 'connected' | 'lost'

  /* — refs — */
  const pcRef         = useRef(null);
  const uiTimerRef    = useRef(null);
  const iceServersRef = useRef([
    { urls: 'stun:stun.l.google.com:19302'  },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]);

  /* — sync props → local — */
  useEffect(() => setLocalVideoOn(videoEnabled), [videoEnabled]);
  useEffect(() => setLocalAudioOn(audioEnabled), [audioEnabled]);
  useEffect(() => {
    if (searching) setConnState('searching');
  }, [searching]);

  /* — UI auto-hide — */
  const resetUiTimer = useCallback(() => {
    setUiVisible(true);
    clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 4200);
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

  /* — WebRTC — */
  const closePeer = useCallback(() => {
    if (!pcRef.current) return;
    pcRef.current.ontrack = null;
    pcRef.current.onicecandidate = null;
    pcRef.current.oniceconnectionstatechange = null;
    pcRef.current.close();
    pcRef.current = null;
    setRemoteStream(false);
    setConnState(s => s === 'connected' ? 'idle' : s);
    if (remoteVideoRef?.current) remoteVideoRef.current.srcObject = null;
  }, [remoteVideoRef]);

  const buildPC = useCallback(() => {
    closePeer();
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pcRef.current = pc;

    const local = localVideoRef?.current?.srcObject;
    if (local) local.getTracks().forEach(t => pc.addTrack(t, local));

    pc.ontrack = ({ streams }) => {
      if (streams?.[0] && remoteVideoRef?.current) {
        remoteVideoRef.current.srcObject = streams[0];
        setRemoteStream(true);
        setConnState('connected');
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && partner?.socketId && socket) {
        socket.emit('ice-candidate', { targetId: partner.socketId, candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
        setRemoteStream(false);
        setConnState('lost');
      }
    };

    return pc;
  }, [closePeer, localVideoRef, remoteVideoRef, partner, socket]);

  const makeOffer = useCallback(async (targetId) => {
    const pc = pcRef.current || buildPC();
    setConnState('connecting');
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket?.emit('offer', { targetId, offer });
    } catch (e) { console.error('[WebRTC] offer', e); }
  }, [buildPC, socket]);

  /* — Socket listeners — */
  useEffect(() => {
    if (!socket) return;

    const onConfig = ({ servers }) => { if (servers) iceServersRef.current = servers; };

    const onRoomJoined = ({ iceServers, peers }) => {
      if (iceServers) iceServersRef.current = iceServers;
      buildPC();
      if (peers?.length) makeOffer(peers[0].socketId);
    };

    const onUserJoined = ({ socketId }) => {
      buildPC();
      if (partner?.socketId === socketId) makeOffer(socketId);
    };

    const onOffer = async ({ offer, fromId }) => {
      const pc = pcRef.current || buildPC();
      setConnState('connecting');
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { targetId: fromId, answer });
      } catch (e) { console.error('[WebRTC] answer', e); }
    };

    const onAnswer = async ({ answer }) => {
      const pc = pcRef.current;
      if (pc && pc.signalingState !== 'stable') {
        try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); }
        catch (e) { console.error('[WebRTC] setRemote', e); }
      }
    };

    const onIce = async ({ candidate }) => {
      if (pcRef.current && candidate) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (_) {}
      }
    };

    const onPartnerLeft = () => { closePeer(); setConnState('idle'); };
    const onSkipConfirmed = () => closePeer();

    socket.on('video-quality-config', onConfig);
    socket.on('room-joined',          onRoomJoined);
    socket.on('user-joined',          onUserJoined);
    socket.on('offer',                onOffer);
    socket.on('answer',               onAnswer);
    socket.on('ice-candidate',        onIce);
    socket.on('partner-left',         onPartnerLeft);
    socket.on('skip-confirmed',       onSkipConfirmed);

    return () => {
      socket.off('video-quality-config', onConfig);
      socket.off('room-joined',          onRoomJoined);
      socket.off('user-joined',          onUserJoined);
      socket.off('offer',                onOffer);
      socket.off('answer',               onAnswer);
      socket.off('ice-candidate',        onIce);
      socket.off('partner-left',         onPartnerLeft);
      socket.off('skip-confirmed',       onSkipConfirmed);
    };
  }, [socket, buildPC, makeOffer, closePeer, partner]);

  useEffect(() => () => closePeer(), [closePeer]);

  /* — Handlers — */
  const handleToggleVideo = useCallback(() => {
    const next = !localVideoOn;
    setLocalVideoOn(next);
    onToggleVideo();
    if (roomId && socket) socket.emit('media-state', { roomId, audioEnabled: localAudioOn, videoEnabled: next });
  }, [localVideoOn, localAudioOn, roomId, socket, onToggleVideo]);

  const handleToggleAudio = useCallback(() => {
    const next = !localAudioOn;
    setLocalAudioOn(next);
    onToggleAudio();
    if (roomId && socket) socket.emit('media-state', { roomId, audioEnabled: next, videoEnabled: localVideoOn });
  }, [localAudioOn, localVideoOn, roomId, socket, onToggleAudio]);

  const handleNext = useCallback(() => {
    if (nextLoading) return;
    setNextLoading(true);
    closePeer();
    setConnState('searching');
    if (roomId && socket) socket.emit('skip', { roomId });
    else onFindRandomPeer?.();
    setTimeout(() => setNextLoading(false), 2400);
  }, [nextLoading, roomId, socket, closePeer, onFindRandomPeer]);

  const handleLeave = useCallback(() => {
    closePeer();
    if (roomId && socket) socket.emit('leave-chat', { roomId });
    onLeave?.();
  }, [closePeer, roomId, socket, onLeave]);

  const handleCancelAutoSearch = useCallback(() => {
    socket?.emit('cancel-auto-search');
    socket?.emit('cancel-random');
    setConnState('idle');
    onCancelAutoSearch?.();
  }, [socket, onCancelAutoSearch]);

  const handleReport = useCallback(() => {
    if (typeof onReport === 'function') onReport();
    else setShowReport(true);
  }, [onReport]);

  /* — Derived — */
  const isConnected = connState === 'connected' && remoteStream;
  const isLost      = connState === 'lost';
  const partnerName = partner?.userName || 'Anonymous';
  const partnerInitial = partnerName.charAt(0).toUpperCase();

  return (
    <div className={styles.root}>

      {/* ── PANES — 50/50 ── */}
      <div className={styles.panes}>

        {/* Remote */}
        <div className={styles.pane} data-side="remote">
          <video
            ref={remoteVideoRef}
            className={styles.video}
            autoPlay playsInline
            style={{ opacity: remoteStream ? 1 : 0 }}
          />

          {!remoteStream && (
            <div className={styles.emptyState}>
              <div className={styles.emptyRing}>
                {searching || connState === 'connecting'
                  ? <div className={styles.scanRing} />
                  : partner
                    ? <span className={styles.emptyInitial}>{partnerInitial}</span>
                    : <div className={styles.emptyDots}>
                        <span /><span /><span />
                      </div>
                }
              </div>
              <p className={styles.emptyLabel}>
                {connState === 'searching'   && 'Finding someone…'}
                {connState === 'connecting'  && 'Connecting…'}
                {connState === 'lost'        && 'Connection lost'}
                {connState === 'idle' && !partner && 'Waiting'}
                {connState === 'idle' &&  partner && partnerName}
              </p>
            </div>
          )}

          {/* Connection lost overlay */}
          {isLost && (
            <div className={styles.lostOverlay}>
              <WifiOff size={22} className={styles.lostIcon} />
            </div>
          )}

          {/* Partner audio muted badge */}
          {partner && partnerMedia?.audio === false && (
            <div className={styles.remoteMute}>
              <MicOff size={12} />
            </div>
          )}

          {/* Corner label */}
          <div className={styles.cornerLabel} data-side="remote">
            {isConnected && partner ? (
              <>
                <span className={styles.liveBlip} />
                {partnerName}
              </>
            ) : 'Remote'}
          </div>
        </div>

        {/* Local */}
        <div className={styles.pane} data-side="local">
          <video
            ref={localVideoRef}
            className={`${styles.video} ${styles.mirrored}`}
            autoPlay playsInline muted
            style={{ opacity: localVideoOn ? 1 : 0 }}
          />

          {!localVideoOn && (
            <div className={styles.camOff}>
              <VideoOff size={24} className={styles.camOffIcon} />
              <span className={styles.camOffText}>Camera off</span>
            </div>
          )}

          {/* Local muted badge */}
          {!localAudioOn && (
            <div className={styles.localMute}>
              <MicOff size={12} />
            </div>
          )}

          <div className={styles.cornerLabel} data-side="local">You</div>
        </div>
      </div>

      {/* ── PANE DIVIDER ── */}
      <div className={styles.paneDivider} />

      {/* ── HUD — fades on idle ── */}
      <div className={`${styles.hud} ${!uiVisible ? styles.hudHidden : ''}`}>

        {/* ── TOP BAR ── */}
        <div className={styles.topBar}>
          {/* Room info */}
          <div className={styles.roomPill}>
            <span className={`${styles.stateDot} ${styles[`dot_${connState}`]}`} />
            <span className={styles.roomText}>
              {roomId ? roomId.toUpperCase() : 'OREY'}
            </span>
          </div>

          {/* Partner chip + report */}
          {partner && (
            <div className={styles.partnerChip}>
              <div className={styles.chipAvatar}>{partnerInitial}</div>
              <span className={styles.chipName}>{partnerName}</span>
              <div className={styles.chipDivider} />
              <button className={styles.chipReport} onClick={handleReport} title="Report">
                <Flag size={13} />
              </button>
            </div>
          )}
        </div>

        {/* ── BOTTOM DOCK ── */}
        <div className={styles.dock}>

          {/* Media toggles */}
          <div className={styles.dockGroup}>
            <button
              className={`${styles.dockBtn} ${!localVideoOn ? styles.dockBtnOff : ''}`}
              onClick={handleToggleVideo}
              title={localVideoOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {localVideoOn ? <Video size={19} /> : <VideoOff size={19} />}
            </button>
            <button
              className={`${styles.dockBtn} ${!localAudioOn ? styles.dockBtnOff : ''}`}
              onClick={handleToggleAudio}
              title={localAudioOn ? 'Mute mic' : 'Unmute mic'}
            >
              {localAudioOn ? <Mic size={19} /> : <MicOff size={19} />}
            </button>
          </div>

          {/* NEXT pill — center focus */}
          <button
            className={styles.nextPill}
            onClick={handleNext}
            disabled={nextLoading}
          >
            {nextLoading
              ? <Loader size={17} className={styles.pillSpinner} />
              : <Zap    size={17} className={styles.pillZap} />
            }
            <span>{nextLoading ? 'Wait…' : 'Next'}</span>
          </button>

          {/* Actions */}
          <div className={styles.dockGroup}>
            <button
              className={`${styles.dockBtn} ${styles.dockBtnFlag}`}
              onClick={handleReport}
              title="Report user"
            >
              <Flag size={19} />
            </button>
            <button
              className={`${styles.dockBtn} ${styles.dockBtnEnd}`}
              onClick={handleLeave}
              title="Leave call"
            >
              <PhoneOff size={19} />
            </button>
          </div>
        </div>
      </div>

      {/* ── SEARCHING OVERLAY ── */}
      {(searching && !autoSearchCountdown) && (
        <div className={styles.overlay}>
          <div className={styles.overlayRing}>
            <div className={styles.overlayArc} />
            <div className={styles.overlayArc2} />
          </div>
          <p className={styles.overlayLabel}>Searching</p>
          <button className={styles.overlayCancel} onClick={handleCancelAutoSearch}>
            Cancel
          </button>
        </div>
      )}

      {/* ── COUNTDOWN OVERLAY ── */}
      {autoSearchCountdown !== null && (
        <div className={styles.overlay}>
          <div className={styles.countdown}>
            <span className={styles.countdownNum}>{autoSearchCountdown}</span>
          </div>
          <div className={styles.encBadge}>
            <Shield size={13} className={styles.encIcon} />
            <span>End-to-end encrypted</span>
          </div>
          <button className={styles.overlayCancel} onClick={handleCancelAutoSearch}>
            Cancel auto-connect
          </button>
        </div>
      )}

      {/* ── REPORT SHEET ── */}
      {showReport && (
        <ReportSheet
          partner={partner}
          socket={socket}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
};

export default CallScreen;
