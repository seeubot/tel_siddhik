import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Loader, 
  Flag, Shield, VolumeX
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro - Call Screen Component
 * Refined peer-to-peer video interface with CSS Module support.
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
      <div className={styles.noiseLayer} />

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
            <span className={styles.partnerMutedText}>Muted</span>
          </div>
        )}

        {!isRemoteConnected && !searching && (
          <div className={styles.placeholder}>
            <div className={styles.brandText}>Orey!</div>
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
            <div className={styles.cameraOffIcon}>
              <VideoOff size={32} className="text-white/10" />
            </div>
            <span className={styles.cameraOffText}>Camera Suspended</span>
          </div>
        )}

        {!audioEnabled && (
          <div className={styles.muteIndicator}>
            <MicOff size={14} className="text-red-500" />
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

          {/* Next / Skip Button */}
          <button
            onClick={handleNextClick}
            disabled={isConnecting}
            className={styles.nextBtn}
          >
            {isConnecting ? (
              <Loader size={16} className={styles.spinner} />
            ) : (
              <Zap size={16} className={styles.zapIcon} />
            )}
            <span>{isConnecting ? 'Wait' : 'Next'}</span>
          </button>

          <div className={styles.divider} />

          {/* Report */}
          <button 
            onClick={onReport}
            className={`${styles.controlBtn} ${styles.btnReport}`}
            aria-label="Report user"
          >
            <Flag size={18} />
          </button>

          {/* Leave */}
          <button 
            onClick={onLeave}
            className={`${styles.controlBtn} ${styles.btnLeave}`}
            aria-label="Leave call"
          >
            <PhoneOff size={18} />
          </button>
        </div>
      </div>

      {/* OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay}>
          {autoSearchCountdown !== null ? (
            <div className={styles.countdownOverlay}>
              <div className={styles.countdownText}>{autoSearchCountdown}</div>
              <div className={styles.encryptionBadge}>
                <Shield size={16} className="text-pink-500" />
                <span className={styles.encryptionText}>Encryption Linked</span>
              </div>
              <button onClick={onCancelAutoSearch} className={styles.terminateBtn}>
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
    </div>
  );
};

export default CallScreen;
