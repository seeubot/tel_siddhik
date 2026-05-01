import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, Loader,
  Shield, VolumeX, Heart, Sparkles,
  Eye, EyeOff, SkipForward, MoreHorizontal,
  User
} from 'lucide-react';
import './CallScreen.module.css';

const CallScreen = ({
  partner = null,
  localVideoRef,
  remoteVideoRef,
  audioEnabled = true,
  videoEnabled = true,
  partnerMedia = { video: true, audio: true },
  localStream = null,
  partnerStream = null,
  searching = false,
  autoSearchCountdown = null,
  onToggleAudio = () => {},
  onToggleVideo = () => {},
  onSkip = () => {},
  onLeave = () => {},
  onCancelAutoSearch = () => {},
  onFindRandomPeer = () => {},
  onBlurToggle = () => {},
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [showBlurConfirm, setShowBlurConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [localVideoReady, setLocalVideoReady] = useState(false);
  const hideTimerRef = useRef(null);
  const skipTimerRef = useRef(null);
  const localStreamRef = useRef(localStream);
  const partnerStreamRef = useRef(partnerStream);
  const lastTapRef = useRef(0);

  // Update refs when streams change
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    partnerStreamRef.current = partnerStream;
  }, [partnerStream]);

  const isRemoteConnected = !!partner;
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  // Handle video stream sources with proper cleanup
  useEffect(() => {
    if (remoteVideoRef.current && partnerStream) {
      const videoElement = remoteVideoRef.current;
      videoElement.srcObject = partnerStream;
      setRemoteVideoReady(false);
      
      const handleCanPlay = () => setRemoteVideoReady(true);
      videoElement.addEventListener('canplay', handleCanPlay);
      
      return () => {
        videoElement.removeEventListener('canplay', handleCanPlay);
        if (videoElement.srcObject === partnerStream) {
          videoElement.srcObject = null;
        }
        setRemoteVideoReady(false);
      };
    } else {
      setRemoteVideoReady(false);
    }
  }, [partnerStream, remoteVideoRef]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      const videoElement = localVideoRef.current;
      videoElement.srcObject = localStream;
      setLocalVideoReady(false);
      
      const handleCanPlay = () => setLocalVideoReady(true);
      videoElement.addEventListener('canplay', handleCanPlay);
      
      return () => {
        videoElement.removeEventListener('canplay', handleCanPlay);
        if (videoElement.srcObject === localStream) {
          videoElement.srcObject = null;
        }
        setLocalVideoReady(false);
      };
    } else {
      setLocalVideoReady(false);
    }
  }, [localStream, localVideoRef]);

  // Cleanup tracks on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
      }
      if (partnerStreamRef.current) {
        partnerStreamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
      }
      clearTimeout(hideTimerRef.current);
      clearTimeout(skipTimerRef.current);
    };
  }, []);

  // Auto-hide UI controls (only on non-touch devices)
  useEffect(() => {
    // Check if it's a touch device
    const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (isTouchDevice) {
      setUiVisible(true);
      return;
    }
    
    if (!uiVisible) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    return () => clearTimeout(hideTimerRef.current);
  }, [uiVisible]);

  // Handle user activity to show/hide controls
  useEffect(() => {
    const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (isTouchDevice) return;
    
    const resetTimer = () => {
      if (!uiVisible) setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    };

    const events = ['mousemove', 'touchstart', 'touchmove', 'scroll', 'keydown'];
    events.forEach(event => window.addEventListener(event, resetTimer));

    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      clearTimeout(hideTimerRef.current);
    };
  }, [uiVisible]);

  // Close more menu when controls hide
  useEffect(() => {
    if (!uiVisible) setShowMoreMenu(false);
  }, [uiVisible]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.target.matches('input, textarea, [contenteditable]')) return;
      
      switch(e.key) {
        case 'm':
          onToggleAudio?.();
          break;
        case 'v':
          onToggleVideo?.();
          break;
        case 'n':
          handleSkip();
          break;
        case 'b':
          handleBlurClick();
          break;
        case 'Escape':
          if (showBlurConfirm) setShowBlurConfirm(false);
          if (showMoreMenu) setShowMoreMenu(false);
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onToggleAudio, onToggleVideo, showBlurConfirm, showMoreMenu]);

  const handleScreenTap = useCallback((e) => {
    // Don't toggle if tapping on controls
    if (e.target.closest('.control-bar')) return;
    
    const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    
    if (isTouchDevice) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        // Double tap detected - toggle controls
        setUiVisible(prev => !prev);
      }
      lastTapRef.current = now;
    } else {
      setUiVisible(prev => !prev);
    }
  }, []);

  const handleSkip = useCallback(() => {
    if (isSkipping) return;
    setIsSkipping(true);
    onFindRandomPeer?.();
    
    if (skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
    }
    
    skipTimerRef.current = setTimeout(() => {
      setIsSkipping(false);
      onSkip?.();
    }, 2000);
  }, [isSkipping, onFindRandomPeer, onSkip]);

  const handleBlurClick = useCallback(() => {
    setShowBlurConfirm(true);
    setShowMoreMenu(false);
  }, []);

  const handleConfirmBlur = useCallback(async () => {
    const newBlurState = !isBlurred;
    setIsBlurred(newBlurState);
    setShowBlurConfirm(false);
    
    if (onBlurToggle) {
      await onBlurToggle(newBlurState);
    }
  }, [isBlurred, onBlurToggle]);

  const handleCancelBlur = useCallback(() => {
    setShowBlurConfirm(false);
  }, []);

  const toggleMoreMenu = useCallback((e) => {
    e.stopPropagation();
    setShowMoreMenu(prev => !prev);
  }, []);

  // Memoized floating elements
  const floatingElements = useMemo(() => (
    <div className="floating-elements">
      <Heart className="float-heart-1" size={16} aria-hidden="true" />
      <Heart className="float-heart-2" size={12} aria-hidden="true" />
      <Sparkles className="float-sparkle-1" size={14} aria-hidden="true" />
      <Sparkles className="float-sparkle-2" size={18} aria-hidden="true" />
    </div>
  ), []);

  // Memoized background effects
  const backgroundEffects = useMemo(() => (
    <>
      <div className="gradient-orb-1" aria-hidden="true" />
      <div className="gradient-orb-2" aria-hidden="true" />
      <div className="noise-layer" aria-hidden="true" />
    </>
  ), []);

  return (
    <div 
      className="container" 
      onClick={handleScreenTap}
      role="main"
      aria-label="Video call screen"
    >
      {/* Background Effects */}
      {backgroundEffects}
      
      {/* Floating ambient elements */}
      {floatingElements}

      {/* REMOTE VIDEO */}
      <div className="remote-view">
        {/* Default poster/avatar */}
        {(!isRemoteConnected || !remoteVideoReady || isPartnerVideoOff) && (
          <div className="video-poster">
            <div className="poster-avatar">
              <User size={64} aria-hidden="true" />
            </div>
            {isRemoteConnected && !isPartnerVideoOff && !remoteVideoReady && (
              <div className="poster-text">Connecting video...</div>
            )}
            {!isRemoteConnected && !searching && (
              <div className="poster-text">Waiting for match</div>
            )}
          </div>
        )}

        <video
          ref={remoteVideoRef}
          className={`video-base ${searching ? 'searching-blur' : ''} ${isBlurred ? 'video-blur' : ''} ${remoteVideoReady && !isPartnerVideoOff ? 'video-visible' : 'video-hidden'}`}
          autoPlay
          playsInline
          aria-label="Remote video stream"
        />

        {/* Blur indicator */}
        {isBlurred && isRemoteConnected && !isPartnerVideoOff && (
          <div className="blur-indicator" role="status">
            <EyeOff size={14} aria-hidden="true" />
            <span>Video blurred</span>
          </div>
        )}

        {isRemoteConnected && isPartnerVideoOff && (
          <div className="partner-camera-off">
            <div className="camera-off-icon-wrapper">
              <VideoOff size={40} className="camera-off-icon-large" aria-hidden="true" />
            </div>
            <h3 className="partner-camera-off-title">Camera off</h3>
            <p className="partner-camera-off-text">Your match turned their camera off</p>
            <div className="camera-off-status">
              <span className="status-dot" aria-hidden="true" />
              Audio still connected
            </div>
          </div>
        )}

        {/* Partner muted chip */}
        {isRemoteConnected && isPartnerMuted && (
          <div className="status-chip chip-left" role="status">
            <VolumeX size={13} aria-hidden="true" />
            <span>Their mic is off</span>
          </div>
        )}

        {!isRemoteConnected && !searching && (
          <div className="placeholder">
            <div className="logo-wrapper">
              <div className="logo-glow" aria-hidden="true" />
              <div className="brand-text" aria-label="Orey">Orey!</div>
            </div>
            <div className="waiting-text">
              <Sparkles size={16} className="sparkle-icon" aria-hidden="true" />
              Ready to meet someone new?
            </div>
            <div className="loading-dots" aria-label="Loading">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
      </div>

      {/* LOCAL VIDEO */}
      <div className="local-view">
        {/* Default poster/avatar for local video */}
        {(!localStream || !localVideoReady) && videoEnabled && (
          <div className="video-poster local-poster">
            <div className="poster-avatar">
              <User size={48} aria-hidden="true" />
            </div>
            <div className="poster-text">Starting camera...</div>
          </div>
        )}

        <video
          ref={localVideoRef}
          className={`video-base mirrored ${localVideoReady && videoEnabled ? 'video-visible' : 'video-hidden'}`}
          autoPlay
          playsInline
          muted
          aria-label="Local video stream"
        />

        {/* You muted chip */}
        {!audioEnabled && (
          <div className="status-chip chip-right" role="status">
            <MicOff size={13} aria-hidden="true" />
            <span>Your mic is off</span>
          </div>
        )}

        {!videoEnabled && (
          <div className="local-camera-off">
            <div className="camera-off-icon-wrapper">
              <VideoOff size={28} className="camera-off-icon-small" aria-hidden="true" />
            </div>
            <span className="camera-off-text">Camera off</span>
            <p className="camera-off-subtext">Turn on to share your vibe</p>
          </div>
        )}
      </div>

      {/* ── CONTROL BAR ── */}
      <div
        className={`control-bar ${!uiVisible ? 'control-bar-hidden' : ''}`}
        onClick={e => e.stopPropagation()}
        role="toolbar"
        aria-label="Call controls"
      >
        {/* Mic button */}
        <button
          onClick={onToggleAudio}
          className={`control-button ${!audioEnabled ? 'control-button-off' : ''}`}
          aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          aria-pressed={!audioEnabled}
        >
          {audioEnabled ? <Mic size={20} aria-hidden="true" /> : <MicOff size={20} aria-hidden="true" />}
        </button>

        {/* Video button */}
        <button
          onClick={onToggleVideo}
          className={`control-button ${!videoEnabled ? 'control-button-off' : ''}`}
          aria-label={videoEnabled ? 'Stop video' : 'Start video'}
          aria-pressed={!videoEnabled}
        >
          {videoEnabled ? <Video size={20} aria-hidden="true" /> : <VideoOff size={20} aria-hidden="true" />}
        </button>

        {/* Next/Skip button */}
        <button
          onClick={handleSkip}
          disabled={isSkipping}
          className="next-button"
          aria-label={isSkipping ? 'Finding next match' : 'Skip to next match'}
        >
          {isSkipping ? (
            <Loader size={22} className="spinner" aria-hidden="true" />
          ) : (
            <SkipForward size={22} aria-hidden="true" />
          )}
        </button>

        {/* More options button */}
        <div className="more-menu-wrapper">
          <button
            onClick={toggleMoreMenu}
            className="control-button"
            aria-label="More options"
            aria-expanded={showMoreMenu}
          >
            <MoreHorizontal size={20} aria-hidden="true" />
          </button>

          {/* Dropdown menu */}
          {showMoreMenu && (
            <div className="dropdown-menu" role="menu">
              <button
                onClick={handleBlurClick}
                className="dropdown-item"
                role="menuitem"
              >
                {isBlurred ? (
                  <>
                    <Eye size={16} aria-hidden="true" />
                    <span>Remove Blur</span>
                  </>
                ) : (
                  <>
                    <EyeOff size={16} aria-hidden="true" />
                    <span>Blur Video</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* End call button */}
        <button
          onClick={onLeave}
          className="end-button"
          aria-label="End call"
        >
          <PhoneOff size={20} aria-hidden="true" />
        </button>
      </div>

      {/* ── BLUR CONFIRMATION MODAL ── */}
      {showBlurConfirm && (
        <div 
          className="modal-overlay" 
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="blur-modal-title"
        >
          <div className="modal">
            <div className="modal-icon" aria-hidden="true">
              {isBlurred ? <Eye size={28} /> : <EyeOff size={28} />}
            </div>
            <h2 id="blur-modal-title" className="modal-title">
              {isBlurred ? 'Remove video blur?' : 'Blur your video?'}
            </h2>
            <p className="modal-text">
              {isBlurred 
                ? 'The other person will be able to see you clearly again.'
                : 'The other person will see a blurred version of your video. You can unblur anytime.'}
            </p>
            <div className="modal-actions">
              <button 
                onClick={handleCancelBlur} 
                className="modal-cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBlur}
                className="modal-confirm-btn"
                aria-label={isBlurred ? 'Confirm remove blur' : 'Confirm blur'}
              >
                {isBlurred ? 'Remove Blur' : 'Apply Blur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── OVERLAYS ── */}
      {(searching || autoSearchCountdown !== null) && (
        <div className="overlay" role="alert" aria-live="polite">
          <div className="overlay-gradient" aria-hidden="true" />

          {autoSearchCountdown !== null ? (
            <div className="countdown-overlay">
              <div className="countdown-text" aria-label={`${autoSearchCountdown} seconds`}>
                {autoSearchCountdown}
              </div>
              <div className="encryption-badge">
                <Shield size={15} className="shield-icon" aria-hidden="true" />
                <span className="encryption-text">Secure connection ready</span>
              </div>
              <button 
                onClick={onCancelAutoSearch} 
                className="terminate-btn"
                aria-label="Cancel auto search"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="searching-overlay">
              <div className="orbiting-hearts" aria-hidden="true">
                <div className="orbit-ring">
                  <Heart size={16} className="orbit-heart-1" fill="currentColor" />
                  <Heart size={12} className="orbit-heart-2" fill="currentColor" />
                  <Heart size={14} className="orbit-heart-3" fill="currentColor" />
                </div>
                <div className="spinner-center">
                  <Loader size={30} className="spinner-icon" />
                </div>
              </div>
              <div className="searching-text-container">
                <div className="synchronizing-text">Looking for your match</div>
                <p className="searching-subtext">
                  Someone great is just around the corner…
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallScreen;
