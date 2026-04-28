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
  // ── WebRTC Hook ──────────────────────────────────────────────────────────
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

  // ── UI State ─────────────────────────────────────────────────────────────
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

  // ── Handle callActive state ─────────────────────────────────────────────
  useEffect(() => {
    if (callActive) {
      setHasPartner(true);
      setIsConnecting(false);
    }
  }, [callActive]);

  // ── Socket event listeners ──────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    const handleMatchFound = async ({ partnerId }) => {
      console.log('Match found with:', partnerId);
      await makeOffer(partnerId);
    };

    const handleIncomingOffer = async ({ fromId, offer }) => {
      console.log('Received offer from:', fromId);
      await handleOffer(fromId, offer);
    };

    const handleIncomingAnswer = async ({ answer }) => {
      console.log('Received answer');
      await handleAnswer(answer);
    };

    const handleIncomingIce = async ({ candidate }) => {
      await handleIceCandidate(candidate);
    };

    const handleMediaState = ({ audioEnabled, videoEnabled }) => {
      setPartnerMedia({ audio: audioEnabled, video: videoEnabled });
    };

    const handlePartnerDisconnected = () => {
      console.log('Partner disconnected');
      setHasPartner(false);
      closePeer();
    };

    socket.on('match-found', handleMatchFound);
    socket.on('offer', handleIncomingOffer);
    socket.on('answer', handleIncomingAnswer);
    socket.on('ice-candidate', handleIncomingIce);
    socket.on('media-state', handleMediaState);
    socket.on('partner-disconnected', handlePartnerDisconnected);

    return () => {
      socket.off('match-found', handleMatchFound);
      socket.off('offer', handleIncomingOffer);
      socket.off('answer', handleIncomingAnswer);
      socket.off('ice-candidate', handleIncomingIce);
      socket.off('media-state', handleMediaState);
      socket.off('partner-disconnected', handlePartnerDisconnected);
    };
  }, [socketRef, makeOffer, handleOffer, handleAnswer, handleIceCandidate, setPartnerMedia, closePeer]);

  // ── Auto-hide UI when a partner is connected ───────────────────────────────
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

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleFindNext = useCallback(async () => {
    setIsConnecting(true);
    setHasPartner(false);

    // Close any existing connection
    closePeer();

    // Emit find partner event to server
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

    // Notify server
    if (socketRef?.current) {
      socketRef.current.emit('disconnect-partner', { roomId });
    }
  }, [socketRef, roomId, closePeer]);

  const handleToggleAudio = useCallback(() => {
    toggleAudio(roomId);
  }, [toggleAudio, roomId]);

  const handleToggleVideo = useCallback(() => {
    toggleVideo(roomId);
  }, [toggleVideo, roomId]);

  // ── DEBUG: Monitor video refs ──────────────────────────────────────────
  useEffect(() => {
    const checkVideos = setInterval(() => {
      if (localVideoRef.current) {
        console.log('Local video srcObject:', localVideoRef.current.srcObject);
        console.log('Local video readyState:', localVideoRef.current.readyState);
      }
      if (remoteVideoRef.current) {
        console.log('Remote video srcObject:', remoteVideoRef.current.srcObject);
        console.log('Remote video readyState:', remoteVideoRef.current.readyState);
      }
    }, 3000);

    return () => clearInterval(checkVideos);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="cs-screen">

      {/* ── 1. REMOTE VIEWPORT ────────────────────────────────────────────── */}
      <div className="cs-remote">
        {hasPartner ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="cs-remote-video"
          />
        ) : (
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

      {/* ── 2. LOCAL VIEWPORT ─────────────────────────────────────────────── */}
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

        {/* HUD badge */}
        <div className="cs-hud">
          <div className="cs-hud-badge">
            <Activity size={12} className="cs-hud-dot" />
            <span className="cs-hud-label">Live Encrypted</span>
          </div>
        </div>
      </div>

      {/* ── 3. CONTROL BAR ────────────────────────────────────────────────── */}
      <div className={`cs-control-bar ${uiVisible ? 'cs-control-bar--visible' : 'cs-control-bar--hidden'}`}>
        <div className="cs-control-bar-inner">
          <div className="cs-control-panel">

            {/* Toggle group */}
            <div className="cs-toggle-group">
              <button
                onClick={handleToggleVideo}
                className={`cs-icon-btn ${!videoEnabled ? 'cs-icon-btn--muted' : ''}`}
                title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
              <button
                onClick={handleToggleAudio}
                className={`cs-icon-btn ${!audioEnabled ? 'cs-icon-btn--muted' : ''}`}
                title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            </div>

            {/* Main action */}
            <div className="cs-main-action">
              <button
                onClick={handleFindNext}
                disabled={isConnecting}
                className="cs-next-btn"
              >
                <div className="cs-next-btn-overlay" />
                <div className="cs-next-btn-content">
                  {isConnecting
                    ? <Loader2 size={16} className="cs-spin" />
                    : <Zap size={16} style={{ fill: 'currentColor' }} />
                  }
                  <span>{isConnecting ? 'Searching…' : 'Next Discovery'}</span>
                </div>
              </button>
            </div>

            {/* Safety & exit */}
            <div className="cs-safety-group">
              <button
                onClick={() => setShowReportModal(true)}
                className="cs-report-btn"
                title="Report User"
              >
                <Flag size={18} />
              </button>
              <button
                onClick={handleDisconnect}
                className="cs-end-btn"
                title="End Call"
              >
                <PhoneOff size={18} />
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ── 4. REPORT MODAL ───────────────────────────────────────────────── */}
      {showReportModal && (
        <div className="cs-modal-overlay">
          <div className="cs-modal-card">
            <button
              onClick={() => setShowReportModal(false)}
              className="cs-modal-close"
              aria-label="Close safety center"
            >
              <X size={20} />
            </button>

            <div className="cs-modal-header">
              <div className="cs-modal-icon">
                <ShieldCheck size={24} />
              </div>
              <h3 className="cs-modal-title">Safety Center</h3>
              <p className="cs-modal-subtitle">Report current session</p>
            </div>

            <div className="cs-report-options">
              {['Nudity / Sexual', 'Harassment', 'Underage', 'Other'].map(reason => (
                <button
                  key={reason}
                  className="cs-report-option"
                  onClick={() => setShowReportModal(false)}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. BACKGROUND BLOBS ───────────────────────────────────────────── */}
      <div className="cs-blobs">
        <div className="cs-blob cs-blob--pink" />
        <div className="cs-blob cs-blob--orange" />
      </div>

    </div>
  );
};

export default CallScreen;
