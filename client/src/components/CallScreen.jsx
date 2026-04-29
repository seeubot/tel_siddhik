import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Loader, 
  Flag, Shield, VolumeX, Heart, Sparkles
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! - Call Screen Component
 * Dating app themed video interface with romantic aesthetics
 */

const CallScreen = ({
  partner = null,
  localVideoRef,
  remoteVideoRef,
  audioEnabled = true,
  videoEnabled = true,
  partnerMedia = { video: true, audio: true },
  searching = false,
  autoSearchCountdown = null,
  onToggleAudio = () => {},
  onToggleVideo = () => {},
  onSkip = () => {},
  onLeave = () => {},
  onCancelAutoSearch = () => {},
  onFindRandomPeer = () => {},
  onReport = () => {},
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const hideTimerRef = useRef(null);

  const isRemoteConnected = !!partner && (partnerMedia?.video !== false);
  const isPartnerMuted = partner && !partnerMedia?.audio;

  // Touch/Click to toggle UI visibility
  const handleScreenTap = useCallback(() => {
    setUiVisible(prev => !prev);
  }, []);

  // Auto-hide UI after 4 seconds of inactivity
  useEffect(() => {
    if (!uiVisible) return;
    
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setUiVisible(false);
    }, 4000);

    return () => clearTimeout(hideTimerRef.current);
  }, [uiVisible]);

  // Reset timer on user interaction
  useEffect(() => {
    const resetTimer = () => {
      if (!uiVisible) {
        setUiVisible(true);
      }
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setUiVisible(false);
      }, 4000);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('touchmove', resetTimer);
    
    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('touchmove', resetTimer);
      clearTimeout(hideTimerRef.current);
    };
  }, [uiVisible]);

  const handleNextClick = () => {
    if (isConnecting) return;
    setIsConnecting(true);
    onFindRandomPeer?.();
    setTimeout(() => {
      setIsConnecting(false);
      onSkip?.();
    }, 2000);
  };

  return (
    <div className={styles.container} onClick={handleScreenTap}>
      {/* Background Ambient Effects */}
      <div className={styles.gradientOrb1} />
      <div className={styles.gradientOrb2} />
      <div className={styles.noiseLayer} />
      
      {/* Floating Romantic Elements */}
      <div className={styles.floatingElements}>
        <Heart className={styles.floatHeart1} size={16} />
        <Heart className={styles.floatHeart2} size={12} />
        <Sparkles className={styles.floatSparkle1} size={14} />
        <Sparkles className={styles.floatSparkle2} size={18} />
      </div>

      {/* REMOTE VIEW */}
      <div className={styles.remoteView}>
        <video
          ref={remoteVideoRef}
          className={`${styles.videoBase} ${searching ? styles.searchingBlur : ''}`}
          autoPlay 
          playsInline
          style={{ display: isRemoteConnected ? 'block' : 'none' }}
        />
        
        {/* Partner Muted Indicator */}
        {isPartnerMuted && isRemoteConnected && (
          <div className={styles.partnerMutedBadge}>
            <VolumeX size={14} />
            <span className={styles.partnerMutedText}>Partner Muted</span>
          </div>
        )}

        {/* Connection Status */}
        {isRemoteConnected && !isPartnerMuted && (
          <div className={styles.connectedBadge}>
            <Heart size={12} className={styles.heartIcon} />
            <span>Connected</span>
          </div>
        )}

        {!isRemoteConnected && !searching && (
          <div className={styles.placeholder}>
            <div className={styles.logoWrapper}>
              <div className={styles.logoGlow} />
              <div className={styles.brandText}>Orey!</div>
            </div>
            <div className={styles.waitingText}>
              <Sparkles size={16} className={styles.sparkleIcon} />
              Waiting for someone special...
            </div>
            <div className={styles.loadingDots}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        )}
      </div>

      {/* LOCAL VIEW */}
      <div className={styles.localView}>
        <video
          ref={localVideoRef}
          className={`${styles.videoBase} ${styles.mirrored}`}
          autoPlay 
          playsInline 
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />
        
        {!videoEnabled && (
          <div className={styles.cameraOffOverlay}>
            <div className={styles.cameraOffIconWrapper}>
              <div className={styles.cameraOffIcon}>
                <VideoOff size={28} />
              </div>
            </div>
            <span className={styles.cameraOffText}>Camera Off</span>
            <p className={styles.cameraOffSubtext}>Turn on camera to share your vibe</p>
          </div>
        )}

        {!audioEnabled && videoEnabled && (
          <div className={styles.muteIndicator}>
            <MicOff size={14} />
          </div>
        )}
      </div>

      {/* CONTROL INTERFACE */}
      <div 
        className={`${styles.controlWrapper} ${!uiVisible ? styles.uiHidden : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.mainIsland}>
          {/* Microphone */}
          <button 
            onClick={onToggleAudio}
            className={`${styles.controlBtn} ${!audioEnabled ? styles.btnDanger : styles.btnDefault}`}
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          </button>

          {/* Camera */}
          <button 
            onClick={onToggleVideo}
            className={`${styles.controlBtn} ${!videoEnabled ? styles.btnDanger : styles.btnDefault}`}
            aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          </button>

          <div className={styles.divider} />

          {/* Next / Find Match Button */}
          <button
            onClick={handleNextClick}
            disabled={isConnecting}
            className={styles.nextBtn}
          >
            {isConnecting ? (
              <>
                <Loader size={16} className={styles.spinner} />
                <span>Finding...</span>
              </>
            ) : (
              <>
                <Heart size={16} fill="currentColor" className={styles.heartBeat} />
                <span>Next Match</span>
              </>
            )}
          </button>

          <div className={styles.divider} />

          {/* Report */}
          <button 
            onClick={onReport}
            className={`${styles.controlBtn} ${styles.btnReport}`}
            aria-label="Report user"
          >
            <Flag size={16} />
          </button>

          {/* Leave */}
          <button 
            onClick={onLeave}
            className={`${styles.controlBtn} ${styles.btnLeave}`}
            aria-label="Leave call"
          >
            <PhoneOff size={16} />
          </button>
        </div>
      </div>

      {/* OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay}>
          <div className={styles.overlayGradient} />
          
          {autoSearchCountdown !== null ? (
            <div className={styles.countdownOverlay}>
              <div className={styles.countdownText}>{autoSearchCountdown}</div>
              <div className={styles.encryptionBadge}>
                <Shield size={16} className={styles.shieldIcon} />
                <span className={styles.encryptionText}>Secure Connection Ready</span>
                <Heart size={12} className={styles.heartSmall} />
              </div>
              <button onClick={onCancelAutoSearch} className={styles.terminateBtn}>
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.searchingOverlay}>
              <div className={styles.searchingAnimation}>
                <div className={styles.orbitingHearts}>
                  <div className={styles.orbitRing}>
                    <Heart size={16} className={styles.orbitHeart1} fill="currentColor" />
                    <Heart size={12} className={styles.orbitHeart2} fill="currentColor" />
                    <Heart size={14} className={styles.orbitHeart3} fill="currentColor" />
                  </div>
                  <div className={styles.spinnerCenter}>
                    <Loader size={32} className={styles.spinnerIcon} />
                  </div>
                </div>
              </div>
              <div className={styles.searchingTextContainer}>
                <div className={styles.synchronizingText}>Finding Your Match</div>
                <p className={styles.searchingSubtext}>Someone amazing is nearby...</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallScreen;
