import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Loader2,
  Flag, ShieldCheck, Activity,
  RefreshCw, X, Users, Sparkles
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
  const [connectionQuality, setConnectionQuality] = useState(0);

  const uiTimerRef = useRef(null);
  const initializedRef = useRef(false);
  const qualityIntervalRef = useRef(null);

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

  // ── Simulate connection quality for visual effects ─────────────────────
  useEffect(() => {
    if (hasPartner) {
      qualityIntervalRef.current = setInterval(() => {
        setConnectionQuality(Math.floor(Math.random() * 4));
      }, 3000);
    } else {
      clearInterval(qualityIntervalRef.current);
      setConnectionQuality(0);
    }
    return () => clearInterval(qualityIntervalRef.current);
  }, [hasPartner]);

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

    const handleMediaState = ({ audioEnabled, videoEnabled }) => {
      setPartnerMedia({ audio: audioEnabled, video: videoEnabled });
    };

    const handlePartnerDisconnected = () => {
      console.log('Partner disconnected');
      setHasPartner(false);
      setIsConnecting(false);
      closePeer();
    };

    socket.on('room-joined', handleRoomJoined);
    socket.on('match-found', handleMatchFound);
    socket.on('offer', handleIncomingOffer);
    socket.on('answer', handleIncomingAnswer);
    socket.on('ice-candidate', handleIncomingIce);
    socket.on('peer-media-state', handleMediaState);
    socket.on('partner-left', handlePartnerDisconnected);

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
      
      {/* Ambient background particles */}
      <div className="cs-particles">
        {[...Array(20)].map((_, i) => (
          <div 
            key={i}
            className="cs-particle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${3 + Math.random() * 4}s`
            }}
          />
        ))}
      </div>

      {/* Connection quality indicator */}
      {hasPartner && (
        <div className="cs-connection-indicator">
          <div className={`cs-signal-bars ${connectionQuality > 2 ? 'cs-signal-excellent' : connectionQuality > 1 ? 'cs-signal-good' : 'cs-signal-poor'}`}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`cs-signal-bar ${i < connectionQuality ? 'cs-signal-active' : ''}`} />
            ))}
          </div>
        </div>
      )}

      {/* ── 1. REMOTE VIEWPORT ───────────────────────────────────────────── */}
      <div className="cs-remote">
        {/* FIX: Always render the video element, use opacity/visibility instead of display */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`cs-remote-video ${!hasPartner ? 'cs-remote-video--hidden' : ''}`}
          style={{ opacity: hasPartner ? 1 : 0 }}
        />
        
        {/* Decorative frame - only show when partner is connected */}
        {hasPartner && (
          <>
            <div className="cs-video-border" />
            <div className="cs-video-corner cs-corner-tl" />
            <div className="cs-video-corner cs-corner-tr" />
            <div className="cs-video-corner cs-corner-bl" />
            <div className="cs-video-corner cs-corner-br" />
          </>
        )}
        
        {!hasPartner && (
          <div className="cs-idle">
            <div className="cs-brand-container">
              <div className="cs-brand-ring" />
              <h1 className="cs-brand-title">OREY</h1>
              <div className="cs-brand-accent" />
            </div>
            <div className="cs-idle-status">
              <div className={`cs-status-dot ${isConnecting ? 'cs-status-searching' : 'cs-status-idle'}`} />
              <p className="cs-idle-subtitle">
                {isConnecting ? 'Finding your match...' : 'Ready to connect'}
              </p>
            </div>
            {!isConnecting && (
              <button onClick={handleFindNext} className="cs-discover-btn">
                <Sparkles size={20} className="cs-discover-icon" />
                <span>Begin Discovery</span>
              </button>
            )}
          </div>
        )}
        
        {/* Partner info overlay */}
        {hasPartner && (
          <div className="cs-partner-overlay">
            <div className="cs-partner-badge">
              <Users size={14} />
              <span>Connected</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. LOCAL VIEWPORT ───────────────────────────────────────────── */}
      <div className="cs-local">
        <div className="cs-local-container">
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
              <div className="cs-avatar-placeholder">
                <div className="cs-avatar-initials">YOU</div>
                <div className="cs-avatar-ring" />
              </div>
              <div className="cs-cam-off-icon">
                <VideoOff size={18} />
              </div>
            </div>
          )}
          <div className="cs-local-border-glow" />
          <div className="cs-local-frame" />
        </div>
        
        <div className="cs-hud">
          <div className="cs-hud-badge">
            <Activity size={12} className="cs-hud-dot" />
            <span className="cs-hud-label">Secure Channel</span>
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

      {/* ── 5. BACKGROUND AMBIENT ─────────────────────────────────────────── */}
      <div className="cs-ambient-grid" />
      <div className="cs-ambient-glow cs-glow-primary" />
      <div className="cs-ambient-glow cs-glow-secondary" />

    </div>
  );
};

export default CallScreen;
