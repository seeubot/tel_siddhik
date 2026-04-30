import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, Loader,
  Shield, VolumeX, Heart, Sparkles,
  Eye, EyeOff, SkipForward
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
  const hideTimerRef = useRef(null);
  const skipTimerRef = useRef(null);
  const localStreamRef = useRef(localStream);
  const partnerStreamRef = useRef(partnerStream);

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
      
      return () => {
        if (videoElement.srcObject === partnerStream) {
          videoElement.srcObject = null;
        }
      };
    }
  }, [partnerStream, remoteVideoRef]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      const videoElement = localVideoRef.current;
      videoElement.srcObject = localStream;
      
      return () => {
        if (videoElement.srcObject === localStream) {
          videoElement.srcObject = null;
        }
      };
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

  // Auto-hide UI controls
  useEffect(() => {
    if (!uiVisible) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    return () => clearTimeout(hideTimerRef.current);
  }, [uiVisible]);

  // Handle user activity to show/hide controls
  useEffect(() => {
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Don't trigger if typing in an input
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
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onToggleAudio, onToggleVideo, showBlurConfirm]);

  const handleScreenTap = useCallback(() => {
    setUiVisible(prev => !prev);
  }, []);

  const handleSkip = useCallback(() => {
    if (isSkipping) return;
    setIsSkipping(true);
    onFindRandomPeer?.();
    
    // Clear any existing timer
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
  }, []);

  const handleConfirmBlur = useCallback(async () => {
    const newBlurState = !isBlurred;
    setIsBlurred(newBlurState);
    setShowBlurConfirm(false);
    
    // Call the parent handler if provided
    if (onBlurToggle) {
      await onBlurToggle(newBlurState);
    }
  }, [isBlurred, onBlurToggle]);

  const handleCancelBlur = useCallback(() => {
    setShowBlurConfirm(false);
  }, []);

  // Memoized floating elements
  const floatingElements = useMemo(() => (
    <div className={styles.floatingElements}>
      <Heart className={styles.floatHeart1} size={16} aria-hidden="true" />
      <Heart className={styles.floatHeart2} size={12} aria-hidden="true" />
      <Sparkles className={styles.floatSparkle1} size={14} aria-hidden="true" />
      <Sparkles className={styles.floatSparkle2} size={18} aria-hidden="true" />
    </div>
  ), []);

  // Memoized background effects
  const backgroundEffects = useMemo(() => (
    <>
      <div className={styles.gradientOrb1} aria-hidden="true" />
      <div className={styles.gradientOrb2} aria-hidden="true" />
      <div className={styles.noiseLayer} aria-hidden="true" />
    </>
  ), []);

  return (
    <div 
      className={styles.container} 
      onClick={handleScreenTap}
      role="main"
      aria-label="Video call screen"
    >
      {/* Background Effects */}
      {backgroundEffects}
      
      {/* Floating ambient elements */}
      {floatingElements}

      {/* REMOTE VIDEO */}
      <div className={styles.remoteView}>
        <video
          ref={remoteVideoRef}
          className={`${styles.videoBase} ${searching ? styles.searchingBlur : ''} ${isBlurred ? styles.videoBlur : ''}`}
          autoPlay
          playsInline
          style={{ display: isRemoteConnected && !isPartnerVideoOff ? 'block' : 'none' }}
          aria-label="Remote video stream"
        />

        {/* Blur indicator */}
        {isBlurred && isRemoteConnected && !isPartnerVideoOff && (
          <div className={styles.blurIndicator} role="status">
            <EyeOff size={14} aria-hidden="true" />
            <span>Video blurred</span>
          </div>
        )}

        {isRemoteConnected && isPartnerVideoOff && (
          <div className={styles.partnerCameraOff}>
            <div className={styles.cameraOffIconWrapper}>
              <VideoOff size={40} className={styles.cameraOffIconLarge} aria-hidden="true" />
            </div>
            <h3 className={styles.partnerCameraOffTitle}>Camera off</h3>
            <p className={styles.partnerCameraOffText}>Your match turned their camera off</p>
            <div className={styles.cameraOffStatus}>
              <span className={styles.statusDot} aria-hidden="true" />
              Audio still connected
            </div>
          </div>
        )}

        {/* Partner muted chip */}
        {isRemoteConnected && isPartnerMuted && (
          <div className={`${styles.statusChip} ${styles.chipLeft}`} role="status">
            <VolumeX size={13} aria-hidden="true" />
            <span>Their mic is off</span>
          </div>
        )}

        {!isRemoteConnected && !searching && (
          <div className={styles.placeholder}>
            <div className={styles.logoWrapper}>
              <div className={styles.logoGlow} aria-hidden="true" />
              <div className={styles.brandText} aria-label="Orey">Orey!</div>
            </div>
            <div className={styles.waitingText}>
              <Sparkles size={16} className={styles.sparkleIcon} aria-hidden="true" />
              Ready to meet someone new?
            </div>
            <div className={styles.loadingDots} aria-label="Loading">
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        )}
      </div>

      {/* LOCAL VIDEO */}
      <div className={styles.localView}>
        <video
          ref={localVideoRef}
          className={`${styles.videoBase} ${styles.mirrored}`}
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
          aria-label="Local video stream"
        />

        {/* You muted chip */}
        {!audioEnabled && (
          <div className={`${styles.statusChip} ${styles.chipRight}`} role="status">
            <MicOff size={13} aria-hidden="true" />
            <span>Your mic is off</span>
          </div>
        )}

        {!videoEnabled && (
          <div className={styles.localCameraOff}>
            <div className={styles.cameraOffIconWrapper}>
              <VideoOff size={28} className={styles.cameraOffIconSmall} aria-hidden="true" />
            </div>
            <span className={styles.cameraOffText}>Camera off</span>
            <p className={styles.cameraOffSubtext}>Turn on to share your vibe</p>
          </div>
        )}
      </div>

      {/* ── CONTROL BAR ── */}
      <div
        className={`${styles.controlBar} ${!uiVisible ? styles.controlBarHidden : ''}`}
        onClick={e => e.stopPropagation()}
        role="toolbar"
        aria-label="Call controls"
      >
        {/* Left cluster */}
        <div className={styles.cluster}>
          <button
            onClick={onToggleAudio}
            className={`${styles.iconBtn} ${!audioEnabled ? styles.iconBtnDanger : ''}`}
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={!audioEnabled}
          >
            <span className={styles.iconWrap}>
              {audioEnabled ? <Mic size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />}
            </span>
            <span className={styles.btnLabel}>{audioEnabled ? 'Mute' : 'Unmute'}</span>
          </button>

          <button
            onClick={onToggleVideo}
            className={`${styles.iconBtn} ${!videoEnabled ? styles.iconBtnDanger : ''}`}
            aria-label={videoEnabled ? 'Stop video' : 'Start video'}
            aria-pressed={!videoEnabled}
          >
            <span className={styles.iconWrap}>
              {videoEnabled ? <Video size={18} aria-hidden="true" /> : <VideoOff size={18} aria-hidden="true" />}
            </span>
            <span className={styles.btnLabel}>{videoEnabled ? 'Camera' : 'No cam'}</span>
          </button>
        </div>

        {/* Center: Next pill (prominent CTA) */}
        <button
          onClick={handleSkip}
          disabled={isSkipping}
          className={styles.nextPill}
          aria-label={isSkipping ? 'Finding next match' : 'Skip to next match'}
        >
          {isSkipping ? (
            <>
              <Loader size={17} className={styles.spinner} aria-hidden="true" />
              <span>Finding…</span>
            </>
          ) : (
            <>
              <SkipForward size={17} aria-hidden="true" />
              <span>Next</span>
            </>
          )}
        </button>

        {/* Right cluster */}
        <div className={styles.cluster}>
          <button
            onClick={handleBlurClick}
            className={`${styles.iconBtn} ${isBlurred ? styles.iconBtnActive : ''}`}
            aria-label={isBlurred ? 'Remove video blur' : 'Blur video'}
            aria-pressed={isBlurred}
          >
            <span className={styles.iconWrap}>
              {isBlurred ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
            </span>
            <span className={styles.btnLabel}>{isBlurred ? 'Unblur' : 'Blur'}</span>
          </button>

          <button
            onClick={onLeave}
            className={styles.endBtn}
            aria-label="End call"
          >
            <span className={styles.iconWrap}>
              <PhoneOff size={18} aria-hidden="true" />
            </span>
            <span className={styles.btnLabel}>End</span>
          </button>
        </div>
      </div>

      {/* ── BLUR CONFIRMATION MODAL ── */}
      {showBlurConfirm && (
        <div 
          className={styles.modalOverlay} 
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="blur-modal-title"
        >
          <div className={styles.modal}>
            <div className={styles.modalIcon} aria-hidden="true">
              {isBlurred ? <Eye size={28} /> : <EyeOff size={28} />}
            </div>
            <h2 id="blur-modal-title" className={styles.modalTitle}>
              {isBlurred ? 'Remove video blur?' : 'Blur your video?'}
            </h2>
            <p className={styles.modalText}>
              {isBlurred 
                ? 'The other person will be able to see you clearly again.'
                : 'The other person will see a blurred version of your video. You can unblur anytime.'}
            </p>
            <div className={styles.modalActions}>
              <button 
                onClick={handleCancelBlur} 
                className={styles.modalCancelBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBlur}
                className={styles.modalConfirmBtn}
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
        <div className={styles.overlay} role="alert" aria-live="polite">
          <div className={styles.overlayGradient} aria-hidden="true" />

          {autoSearchCountdown !== null ? (
            <div className={styles.countdownOverlay}>
              <div className={styles.countdownText} aria-label={`${autoSearchCountdown} seconds`}>
                {autoSearchCountdown}
              </div>
              <div className={styles.encryptionBadge}>
                <Shield size={15} className={styles.shieldIcon} aria-hidden="true" />
                <span className={styles.encryptionText}>Secure connection ready</span>
              </div>
              <button 
                onClick={onCancelAutoSearch} 
                className={styles.terminateBtn}
                aria-label="Cancel auto search"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.searchingOverlay}>
              <div className={styles.orbitingHearts} aria-hidden="true">
                <div className={styles.orbitRing}>
                  <Heart size={16} className={styles.orbitHeart1} fill="currentColor" />
                  <Heart size={12} className={styles.orbitHeart2} fill="currentColor" />
                  <Heart size={14} className={styles.orbitHeart3} fill="currentColor" />
                </div>
                <div className={styles.spinnerCenter}>
                  <Loader size={30} className={styles.spinnerIcon} />
                </div>
              </div>
              <div className={styles.searchingTextContainer}>
                <div className={styles.synchronizingText}>Looking for your match</div>
                <p className={styles.searchingSubtext}>
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
