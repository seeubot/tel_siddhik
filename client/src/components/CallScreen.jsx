import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, Loader,
  Shield, VolumeX, Heart, Sparkles,
  Eye, EyeOff, SkipForward, MoreHorizontal,
  User, Zap, MessageCircle
} from 'lucide-react';
import styles from './CallScreen.module.css';

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
  const controlsContainerRef = useRef(null);

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
    const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (isTouchDevice) {
      setUiVisible(true);
      return;
    }
    
    if (!uiVisible) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
    return () => clearTimeout(hideTimerRef.current);
  }, [uiVisible]);

  // Handle user activity to show/hide controls
  useEffect(() => {
    const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (isTouchDevice) return;
    
    const resetTimer = () => {
      if (!uiVisible) setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
    };

    const events = ['mousemove', 'touchstart', 'touchmove', 'keydown'];
    events.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));

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
          e.preventDefault();
          onToggleAudio?.();
          break;
        case 'v':
          e.preventDefault();
          onToggleVideo?.();
          break;
        case 'n':
          e.preventDefault();
          handleSkip();
          break;
        case 'b':
          e.preventDefault();
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
    if (e.target.closest(`.${styles.controlsContainer}`)) return;
    
    const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    
    if (isTouchDevice) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
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

  // Particle effect elements
  const particleEffects = useMemo(() => (
    <div className={styles.particles} aria-hidden="true">
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className={styles.particle}
          style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 10}s`,
            animationDuration: `${10 + Math.random() * 20}s`,
            opacity: Math.random() * 0.3 + 0.1,
            width: `${2 + Math.random() * 4}px`,
            height: `${2 + Math.random() * 4}px`,
          }}
        />
      ))}
    </div>
  ), []);

  return (
    <div 
      className={styles.container} 
      onClick={handleScreenTap}
      role="main"
      aria-label="Video call screen"
    >
      {/* Particle effects */}
      {particleEffects}

      {/* Status Bar */}
      <div className={`${styles.statusBar} ${!uiVisible ? styles.statusBarHidden : ''}`}>
        <div className={styles.statusLeft}>
          <div className={styles.connectionDot} aria-hidden="true" />
          <span className={styles.statusText}>
            {isRemoteConnected ? 'Connected' : searching ? 'Searching...' : 'Ready'}
          </span>
        </div>
        {isRemoteConnected && (
          <div className={styles.statusRight}>
            {isPartnerMuted && (
              <span className={styles.statusBadge}>
                <VolumeX size={12} />
                Muted
              </span>
            )}
          </div>
        )}
      </div>

      {/* REMOTE VIDEO */}
      <div className={styles.remoteView}>
        {/* Poster/Avatar overlay */}
        {(!isRemoteConnected || !remoteVideoReady || isPartnerVideoOff) && (
          <div className={styles.videoPoster}>
            {isRemoteConnected && isPartnerVideoOff ? (
              <>
                <div className={styles.posterAvatarLarge}>
                  <User size={80} aria-hidden="true" />
                </div>
                <h2 className={styles.posterTitle}>Camera Off</h2>
                <p className={styles.posterSubtitle}>Your match has disabled their camera</p>
                <div className={styles.posterStatus}>
                  <div className={styles.pulseDot} />
                  <span>Audio connected</span>
                </div>
              </>
            ) : (
              <>
                <div className={styles.posterAvatarLarge}>
                  {searching ? (
                    <Loader size={80} className={styles.posterSpinner} />
                  ) : (
                    <User size={80} aria-hidden="true" />
                  )}
                </div>
                <h2 className={styles.posterTitle}>
                  {searching ? 'Looking for someone' : 'Waiting for a match'}
                </h2>
                <p className={styles.posterSubtitle}>
                  {searching 
                    ? 'Finding the perfect connection...' 
                    : 'You\'re ready to meet someone new'}
                </p>
              </>
            )}
          </div>
        )}

        <video
          ref={remoteVideoRef}
          className={`${styles.video} ${isBlurred ? styles.videoBlurred : ''} ${remoteVideoReady && !isPartnerVideoOff ? styles.videoVisible : ''}`}
          autoPlay
          playsInline
          aria-label="Remote video stream"
        />

        {/* Blur indicator */}
        {isBlurred && remoteVideoReady && !isPartnerVideoOff && (
          <div className={styles.blurOverlay} role="status">
            <EyeOff size={16} aria-hidden="true" />
            <span>Blurred</span>
          </div>
        )}
      </div>

      {/* LOCAL VIDEO */}
      <div className={styles.localView}>
        {(!localStream || !localVideoReady) && videoEnabled ? (
          <div className={styles.videoPoster}>
            <div className={styles.posterAvatarSmall}>
              <Loader size={32} className={styles.posterSpinner} />
            </div>
            <span className={styles.posterLabel}>Camera starting...</span>
          </div>
        ) : !videoEnabled ? (
          <div className={styles.videoPoster}>
            <div className={styles.posterAvatarSmall}>
              <VideoOff size={32} aria-hidden="true" />
            </div>
            <span className={styles.posterLabel}>Camera off</span>
          </div>
        ) : null}

        <video
          ref={localVideoRef}
          className={`${styles.video} ${styles.mirrored} ${localVideoReady && videoEnabled ? styles.videoVisible : ''}`}
          autoPlay
          playsInline
          muted
          aria-label="Local video stream"
        />

        {/* Local status badges */}
        {!audioEnabled && (
          <div className={`${styles.localBadge} ${styles.localBadgeAudio}`} role="status">
            <MicOff size={14} aria-hidden="true" />
            <span>Muted</span>
          </div>
        )}
      </div>

      {/* CONTROLS */}
      <div
        ref={controlsContainerRef}
        className={`${styles.controlsContainer} ${!uiVisible ? styles.controlsHidden : ''}`}
        onClick={e => e.stopPropagation()}
        role="toolbar"
        aria-label="Call controls"
      >
        <div className={styles.controlsWrapper}>
          {/* Mic button */}
          <button
            onClick={onToggleAudio}
            className={`${styles.controlButton} ${!audioEnabled ? styles.controlButtonActive : ''}`}
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={!audioEnabled}
          >
            <div className={styles.controlIcon}>
              {audioEnabled ? <Mic size={22} aria-hidden="true" /> : <MicOff size={22} aria-hidden="true" />}
            </div>
            <span className={styles.controlLabel}>
              {audioEnabled ? 'Mute' : 'Unmute'}
            </span>
          </button>

          {/* Video button */}
          <button
            onClick={onToggleVideo}
            className={`${styles.controlButton} ${!videoEnabled ? styles.controlButtonActive : ''}`}
            aria-label={videoEnabled ? 'Stop video' : 'Start video'}
            aria-pressed={!videoEnabled}
          >
            <div className={styles.controlIcon}>
              {videoEnabled ? <Video size={22} aria-hidden="true" /> : <VideoOff size={22} aria-hidden="true" />}
            </div>
            <span className={styles.controlLabel}>
              {videoEnabled ? 'Camera' : 'Camera'}
            </span>
          </button>

          {/* Blur button */}
          <button
            onClick={handleBlurClick}
            className={`${styles.controlButton} ${isBlurred ? styles.controlButtonActive : ''}`}
            aria-label={isBlurred ? 'Remove video blur' : 'Blur video'}
          >
            <div className={styles.controlIcon}>
              {isBlurred ? <Eye size={22} aria-hidden="true" /> : <EyeOff size={22} aria-hidden="true" />}
            </div>
            <span className={styles.controlLabel}>Blur</span>
          </button>

          {/* Skip button */}
          <button
            onClick={handleSkip}
            disabled={isSkipping}
            className={styles.skipButton}
            aria-label={isSkipping ? 'Finding next match' : 'Skip to next match'}
          >
            <div className={styles.skipButtonInner}>
              {isSkipping ? (
                <Loader size={28} className={styles.spinner} aria-hidden="true" />
              ) : (
                <>
                  <SkipForward size={28} aria-hidden="true" />
                  <Heart size={14} className={styles.skipHeart} aria-hidden="true" />
                </>
              )}
            </div>
          </button>

          {/* More button */}
          <div className={styles.moreMenuWrapper}>
            <button
              onClick={toggleMoreMenu}
              className={styles.controlButton}
              aria-label="More options"
              aria-expanded={showMoreMenu}
            >
              <div className={styles.controlIcon}>
                <MoreHorizontal size={22} aria-hidden="true" />
              </div>
              <span className={styles.controlLabel}>More</span>
            </button>

            {showMoreMenu && (
              <div className={styles.dropdownMenu} role="menu">
                <button className={styles.dropdownItem} role="menuitem">
                  <MessageCircle size={18} aria-hidden="true" />
                  <span>Send Message</span>
                </button>
                <button className={styles.dropdownItem} role="menuitem">
                  <Zap size={18} aria-hidden="true" />
                  <span>Quick Match</span>
                </button>
              </div>
            )}
          </div>

          {/* End button */}
          <button
            onClick={onLeave}
            className={styles.endButton}
            aria-label="End call"
          >
            <PhoneOff size={24} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* BLUR CONFIRMATION MODAL */}
      {showBlurConfirm && (
        <div 
          className={styles.modalOverlay} 
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="blur-modal-title"
        >
          <div className={styles.modal}>
            <div className={styles.modalIconWrapper}>
              <div className={styles.modalIcon}>
                {isBlurred ? <Eye size={32} aria-hidden="true" /> : <EyeOff size={32} aria-hidden="true" />}
              </div>
            </div>
            <h2 id="blur-modal-title" className={styles.modalTitle}>
              {isBlurred ? 'Remove Blur?' : 'Blur Video?'}
            </h2>
            <p className={styles.modalText}>
              {isBlurred 
                ? 'Your video will become clear and visible to the other person.'
                : 'Your video will be blurred for privacy. You can undo this anytime.'}
            </p>
            <div className={styles.modalActions}>
              <button onClick={handleCancelBlur} className={styles.modalBtnCancel}>
                Cancel
              </button>
              <button
                onClick={handleConfirmBlur}
                className={styles.modalBtnConfirm}
                aria-label={isBlurred ? 'Confirm remove blur' : 'Confirm blur video'}
              >
                {isBlurred ? 'Show Video' : 'Blur Video'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.fullscreenOverlay} role="alert" aria-live="polite">
          <div className={styles.overlayGlow} aria-hidden="true" />

          {autoSearchCountdown !== null ? (
            <div className={styles.countdownContent}>
              <div className={styles.countdownNumber} aria-label={`${autoSearchCountdown} seconds`}>
                {autoSearchCountdown}
              </div>
              <div className={styles.secureBadge}>
                <Shield size={16} className={styles.shieldIcon} aria-hidden="true" />
                <span>Secure connection</span>
              </div>
              <button onClick={onCancelAutoSearch} className={styles.cancelBtn}>
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.searchingContent}>
              <div className={styles.searchingAnimation} aria-hidden="true">
                <div className={styles.orbitContainer}>
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className={styles.orbitRing}
                      style={{
                        animationDelay: `${i * 0.5}s`,
                        width: `${80 + i * 30}px`,
                        height: `${80 + i * 30}px`,
                      }}
                    >
                      <Heart
                        size={12}
                        className={styles.orbitHeart}
                        fill="currentColor"
                      />
                    </div>
                  ))}
                </div>
                <Loader size={40} className={styles.searchingSpinner} />
              </div>
              <h2 className={styles.searchingTitle}>Finding your match</h2>
              <p className={styles.searchingText}>
                Connecting you with someone amazing...
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallScreen;
