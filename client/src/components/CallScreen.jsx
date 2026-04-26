
import React, { useState, useCallback, useEffect } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, UserPlus,
  Zap
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro Application Interface
 * Separated into CSS Modules for modularity and performance.
 */
export default function CallScreen({
  partner = null,
  roomId = "000-000",
  oreyId = "",
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
  onShareId = () => {},
  onCancelAutoSearch = () => {},
}) {
  const [uiVisible, setUiVisible] = useState(true);

  // UI Auto-hide logic after 4 seconds of inactivity
  useEffect(() => {
    if (!uiVisible) return;
    const timer = setTimeout(() => setUiVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [uiVisible]);

  const toggleUI = useCallback((e) => {
    if (e.target.closest('button')) return;
    setUiVisible((prev) => !prev);
  }, []);

  const isPartnerVideoEnabled = partnerMedia?.video !== false;

  return (
    <div className={styles.root} onClick={toggleUI}>
      
      {/* --- Remote View (Stranger) --- */}
      <div className={`${styles.videoContainer} ${styles.remoteBorder} ${searching ? styles.searchingState : ''}`}>
        <video
          ref={remoteVideoRef}
          className={`${styles.videoElement} ${!searching ? styles.animateZoom : ''}`}
          autoPlay
          playsInline
          style={{ display: partner && isPartnerVideoEnabled ? 'block' : 'none' }}
        />
        
        {(!partner || !isPartnerVideoEnabled) && (
          <div className={styles.videoFallback}>
             <div className={styles.brandGhost}>OREY!</div>
             <p className={styles.statusSubtext}>
               {searching ? "SYNCING..." : "STREAM IDLE"}
             </p>
          </div>
        )}

        {/* Floating Label */}
        <div className={`${styles.floatingLabel} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={styles.labelCapsule}>
            <div className={`${styles.dot} ${styles.accentDot}`} />
            <span className={styles.labelText}>Stranger</span>
          </div>
        </div>
      </div>

      {/* --- Local View (You) --- */}
      <div className={styles.videoContainer}>
        <video
          ref={localVideoRef}
          className={`${styles.videoElement} ${styles.mirror}`}
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />
        {!videoEnabled && (
          <div className={styles.videoFallback}>
             <VideoOff size={24} className={styles.fallbackIcon} />
          </div>
        )}
        <div className={`${styles.floatingLabel} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={styles.labelCapsule}>
            <div className={`${styles.dot} ${styles.neutralDot}`} />
            <span className={styles.labelText}>You</span>
          </div>
        </div>
      </div>

      {/* --- Pro Compact Dock --- */}
      <div className={`${styles.controlsWrapper} ${!uiVisible ? styles.uiDockHidden : ''}`}>
        <div className={styles.controlsDock}>
          
          <div className={styles.mediaGroup}>
            <button 
              onClick={onToggleVideo}
              className={`${styles.btnCircle} ${!videoEnabled ? styles.btnAlert : ''}`}
              aria-label="Toggle Video"
            >
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button 
              onClick={onToggleAudio}
              className={`${styles.btnCircle} ${!audioEnabled ? styles.btnAlert : ''}`}
              aria-label="Toggle Audio"
            >
              {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
          </div>

          <button 
            onClick={onSkip}
            className={styles.btnNext}
          >
            NEXT <Zap size={14} className={styles.zapIcon} />
          </button>

          <div className={styles.utilityGroup}>
            <button 
              onClick={onShareId}
              className={styles.btnGhost}
              aria-label="Share ID"
            >
              <UserPlus size={18} />
            </button>
            <button 
              onClick={onLeave}
              className={styles.btnEnd}
              aria-label="End Call"
            >
              <PhoneOff size={18} />
            </button>
          </div>
          
        </div>
      </div>

      {/* --- Overlays --- */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay} onClick={(e) => e.stopPropagation()}>
          <div className={styles.overlayContent}>
            {autoSearchCountdown !== null ? (
              <div className={styles.countdownContainer}>
                <div className={styles.countdownTextWrapper}>
                   <span className={styles.countdownNumber}>{autoSearchCountdown}</span>
                   <span className={styles.countdownExclaim}>!</span>
                </div>
                <p className={styles.overlaySubtext}>CONNECTION INCOMING</p>
                <button 
                  onClick={onCancelAutoSearch}
                  className={styles.btnCancel}
                >
                  STOP SEARCH
                </button>
              </div>
            ) : (
              <div className={styles.loaderContainer}>
                <div className={styles.brandTitle}>OREY!</div>
                <div className={styles.loadingTrack}>
                  <div className={styles.loadingFill} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* System Info */}
      <div className={`${styles.systemInfo} ${!uiVisible ? styles.uiHidden : ''}`}>
        {roomId} // SECURE_LINE
      </div>
    </div>
  );
}


