import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Loader2,
  Flag, ShieldCheck, Activity,
  RefreshCw, X
} from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
import './CallScreen.css';

const CallScreen = ({ socketRef, roomId }) => {
  const {
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
  } = useWebRTC(socketRef);

  const [hasPartner, setHasPartner] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);

  const uiTimerRef = useRef(null);
  const initializedRef = useRef(false);

  // ── Initialize local stream on mount ────────────────────────────────────
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      startLocal().catch(err => {
        console.error('Failed to start local stream:', err);
      });
    }
    return () => {
      stopLocal();
      closePeer();
      initializedRef.current = false;
    };
  }, []);

  // ── Handle callActive state ──────────────────────────────────────────────
  useEffect(() => {
    if (callActive) {
      setHasPartner(true);
      setIsConnecting(false);
    }
  }, [callActive]);

  // ── Socket event listeners ───────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    // FIX 4: Handle room-joined for Orey-ID calls — first peer makes the offer
    const handleRoomJoined = async ({ peers }) => {
      if (peers && peers.length > 0) {
        console.log('Room joined, making offer to:', peers[0].socketId);
        setIsConnecting(true);
        await makeOffer(peers[0].socketId);
      }
    };

    const handleMatchFound = async ({ partnerId }) => {
      console.log('Match found with:', partnerId);
      setIsConnecting(true);
      await makeOffer(partnerId);
    };

    const handleIncomingOffer = async ({ fromId, offer }) => {
      console.log('Received offer from:', fromId);
      setIsConnecting(true);
      await handleOffer(fromId, offer);
    };

    const handleIncomingAnswer = async ({ answer }) => {
      console.log('Received answer');
      await handleAnswer(answer);
    };

    const handleIncomingIce = async ({ candidate }) => {
      await handleIceCandidate(candidate);
    };

    // FIX 2: was 'media-state' — server emits 'peer-media-state'
    const handleMediaState = ({ audioEnabled, videoEnabled }) => {
      setPartnerMedia({ audio: audioEnabled, video: videoEnabled });
    };

    // FIX 3: was 'partner-disconnected' — server emits 'partner-left'
    const handlePartnerDisconnected = () => {
      console.log('Partner disconnected');
      setHasPartner(false);
      setIsConnecting(false);
      closePeer();
    };

    socket.on('room-joined', handleRoomJoined);        // FIX 4: added
    socket.on('match-found', handleMatchFound);
    socket.on('offer', handleIncomingOffer);
    socket.on('answer', handleIncomingAnswer);
    socket.on('ice-candidate', handleIncomingIce);
    socket.on('peer-media-state', handleMediaState);   // FIX 2: was 'media-state'
    socket.on('partner-left', handlePartnerDisconnected); // FIX 3: was 'partner-disconnected'

    return () => {
      socket.off('room-joined', handleRoomJoined);
      socket.off('match-found', handleMatchFound);
      socket.off('offer', handleIncomingOffer);
      socket.off('answer', handleIncomingAnswer);
      socket.off('ice-candidate', handleIncomingIce);
      socket.off('peer-media-state', handleMediaState);
      socket.off('partner-left', handlePartnerDisconnected);
    };
  }, [socketRef, makeOffer, handleOffer, handleAnswer, handleIceCandidate, setPartnerMedia, closePeer]);

  // ── Auto-hide UI ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleActivity = () => {
      setUiVisible(true);
      clearTimeout(uiTimerRef.current);
      if (!showReportModal && hasPartner) {
        uiTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
      }
    };
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearTimeout(uiTimerRef.current);
    };
  }, [showReportModal, hasPartner]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleFindNext = useCallback(async () => {
    setIsConnecting(true);
    setHasPartner(false);
    closePeer();
    if (socketRef?.current) {
      socketRef.current.emit('find-partner', { roomId });
    } else {
      console.error('Socket not connected');
      setIsConnecting(false);
    }
  }, [socketRef, roomId, closePeer]);

  const handleDisconnect = useCallback(() => {
    closePeer();
    setHasPartner(false);
    setIsConnecting(false);
    if (socketRef?.current) {
      socketRef.current.emit('disconnect-partner', { roomId });
    }
  }, [socketRef, roomId, closePeer]);

  const handleToggleAudio = useCallback(() => toggleAudio(roomId), [toggleAudio, roomId]);
  const handleToggleVideo = useCallback(() => toggleVideo(roomId), [toggleVideo, roomId]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="cs-screen">

      {/* ── 1. REMOTE VIEWPORT ─────────────────────────────────────────────
          FIX 1: Always keep <video> in the DOM so ontrack can attach the
          stream before hasPartner flips to true. Toggle visibility only. */}
      <div className="cs-remote">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="cs-remote-video"
          style={{ display: hasPartner ? 'block' : 'none' }}
        />
        {!hasPartner && (
          <div className="cs-idle">
            <h1 className="cs-brand-title">Orey!</h1>
            <p className="cs-idle-subtitle">
              {isConnecting ? 'Negotiating Mesh…' : 'Partner Disconnected'}
            </p>
            {!isConnecting && (
              <button onClick={handleFindNext} className="cs-search-btn">
                <RefreshCw size={14} className="cs-search-icon" />
                <span>Search Again</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 2. LOCAL VIEWPORT ───────────────────────────────────────────── */}
      <div className="cs-local">
        {videoEnabled ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="cs-local-video"
          />
        ) : (
          <div className="cs-cam-off">
            <h2 className="cs-cam-off-title">Orey!</h2>
            <div className="cs-cam-off-icon">
              <VideoOff size={20} />
            </div>
          </div>
        )}
        <div className="cs-hud">
          <div className="cs-hud-badge">
            <Activity size={12} className="cs-hud-dot" />
            <span className="cs-hud-label">Live Encrypted</span>
          </div>
        </div>
      </div>

      {/* ── 3. CONTROL BAR ──────────────────────────────────────────────── */}
      <div className={`cs-control-bar ${uiVisible ? 'cs-control-bar--visible' : 'cs-control-bar--hidden'}`}>
        <div className="cs-control-bar-inner">
          <div className="cs-control-panel">
            <div className="cs-toggle-group">
              <button onClick={handleToggleVideo} className={`cs-icon-btn ${!videoEnabled ? 'cs-icon-btn--muted' : ''}`} title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}>
                {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
              <button onClick={handleToggleAudio} className={`cs-icon-btn ${!audioEnabled ? 'cs-icon-btn--muted' : ''}`} title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}>
                {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            </div>
            <div className="cs-main-action">
              <button onClick={handleFindNext} disabled={isConnecting} className="cs-next-btn">
                <div className="cs-next-btn-overlay" />
                <div className="cs-next-btn-content">
                  {isConnecting ? <Loader2 size={16} className="cs-spin" /> : <Zap size={16} style={{ fill: 'currentColor' }} />}
                  <span>{isConnecting ? 'Searching…' : 'Next Discovery'}</span>
                </div>
              </button>
            </div>
            <div className="cs-safety-group">
              <button onClick={() => setShowReportModal(true)} className="cs-report-btn" title="Report User">
                <Flag size={18} />
              </button>
              <button onClick={handleDisconnect} className="cs-end-btn" title="End Call">
                <PhoneOff size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. REPORT MODAL ─────────────────────────────────────────────── */}
      {showReportModal && (
        <div className="cs-modal-overlay">
          <div className="cs-modal-card">
            <button onClick={() => setShowReportModal(false)} className="cs-modal-close" aria-label="Close safety center">
              <X size={20} />
            </button>
            <div className="cs-modal-header">
              <div className="cs-modal-icon"><ShieldCheck size={24} /></div>
              <h3 className="cs-modal-title">Safety Center</h3>
              <p className="cs-modal-subtitle">Report current session</p>
            </div>
            <div className="cs-report-options">
              {['Nudity / Sexual', 'Harassment', 'Underage', 'Other'].map(reason => (
                <button key={reason} className="cs-report-option" onClick={() => setShowReportModal(false)}>
                  {reason}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. BACKGROUND BLOBS ─────────────────────────────────────────── */}
      <div className="cs-blobs">
        <div className="cs-blob cs-blob--pink" />
        <div className="cs-blob cs-blob--orange" />
      </div>

    </div>
  );
};

export default CallScreen;
