import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Loader, 
  Flag, Shield, Activity
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro - Call Screen Component
 * Refined peer-to-peer video interface with CSS Module support.
 */

const CallScreen = ({
  partner = null,
  roomId = "BR-772-XP",
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
  onReport = () => {},  // NEW: Report handler
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const mouseMoveTimerRef = useRef(null);

  const isRemoteConnected = !!partner && (partnerMedia?.video !== false);

  // Auto-hide UI interaction logic
  useEffect(() => {
    const handleInteraction = () => {
      setUiVisible(true);
      clearTimeout(mouseMoveTimerRef.current);
      mouseMoveTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    };
    window.addEventListener('mousemove', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    return () => {
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

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
    <div className={styles.container}>
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
      <div className={`${styles.controlWrapper} ${!uiVisible ? styles.uiHidden : ''}`}>
        
        {/* Partner Info Bar */}
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
              onClick={onReport} 
              className={styles.reportBtn}
              title="Report User"
            >
              <Flag size={14} />
              <span>Report</span>
            </button>
          </div>
        )}

        <div className={styles.statusPill}>
          <div className={`${styles.statusDot} ${isRemoteConnected ? styles.statusConnected : styles.statusSearching}`} />
          <span className={styles.statusText}>
            {isRemoteConnected ? `Live Hub • ${roomId}` : 'Searching Mesh...'}
          </span>
          <div className={styles.statusDivider} />
          <Activity size={12} className="text-white/20" />
        </div>

        <div className={styles.mainIsland}>
          {/* Media Controls */}
          <div className={styles.controlsLeft}>
            <button 
              onClick={onToggleVideo}
              className={`${styles.controlBtn} ${!videoEnabled ? styles.btnDanger : styles.btnDefault}`}
            >
              {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button 
              onClick={onToggleAudio}
              className={`${styles.controlBtn} ${!audioEnabled ? styles.btnDanger : styles.btnDefault}`}
            >
              {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
          </div>

          {/* Next / Skip Button */}
          <button
            onClick={handleNextClick}
            disabled={isConnecting}
            className={styles.nextBtn}
          >
            {isConnecting ? (
              <Loader size={18} className={styles.spinner} />
            ) : (
              <Zap size={18} className={styles.zapIcon} />
            )}
            <span>{isConnecting ? 'Wait' : 'Next'}</span>
          </button>

          {/* Utility Controls */}
          <div className={styles.controlsRight}>
            {/* Report button in main island too (mobile-friendly) */}
            <button 
              onClick={onReport}
              className={`${styles.controlBtn} ${styles.btnReport}`}
              title="Report User"
            >
              <Flag size={19} />
            </button>
            <button 
              onClick={onLeave}
              className={`${styles.controlBtn} ${styles.btnDanger} ${styles.btnLeave}`}
            >
              <PhoneOff size={20} />
            </button>
          </div>
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
