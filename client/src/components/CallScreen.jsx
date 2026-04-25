
import React, { useState, useCallback, useEffect } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, SkipForward, X, UserPlus,
  Zap
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Branded Video Chat Interface
 * Integrated with CSS Modules and the signature #FF2D55 palette.
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

  // Auto-hide UI logic after 4 seconds of inactivity
  useEffect(() => {
    if (!uiVisible) return;
    const timer = setTimeout(() => setUiVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [uiVisible]);

  const toggleUI = useCallback((e) => {
    // Only toggle if not clicking an interactive button
    if (e.target.closest('button')) return;
    setUiVisible((prev) => !prev);
  }, []);

  const isPartnerVideoEnabled = partnerMedia?.video !== false;

  return (
    <div className={styles.root} onClick={toggleUI}>
      
      {/* --- Remote View (Stranger) --- */}
      <div className={styles.remoteContainer}>
        <video
          ref={remoteVideoRef}
          className={styles.videoElement}
          autoPlay
          playsInline
          style={{ display: partner && isPartnerVideoEnabled ? 'block' : 'none' }}
        />
        
        {(!partner || !isPartnerVideoEnabled) && (
          <div className={styles.videoFallback}>
             <div className={styles.brandGhost}>
               OREY<span className={styles.accentText}>!</span>
             </div>
             <p className={styles.statusSubtext}>
               {searching ? "LOCATING PEER" : "CAMERA SUSPENDED"}
             </p>
          </div>
        )}

        {/* Floating Label */}
        <div className={`${styles.floatingLabel} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={styles.labelCapsule}>
            <div className={styles.pulseDot} />
            <span className={styles.labelText}>Stranger</span>
          </div>
        </div>
      </div>

      {/* --- Local View (You) --- */}
      <div className={styles.localContainer}>
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
             <VideoOff size={32} className={styles.fallbackIcon} />
          </div>
        )}

        <div className={`${styles.floatingLabel} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={`${styles.labelCapsule} ${styles.localLabel}`}>
            <div className={styles.staticDot} />
            <span className={styles.labelText}>You</span>
          </div>
        </div>
      </div>

      {/* --- Orey! Control Dock --- */}
      <div className={`${styles.controlsWrapper} ${!uiVisible ? styles.uiDockHidden : ''}`}>
        <div className={styles.controlsDock}>
          <button 
            onClick={onToggleVideo}
            className={`${styles.btnCircle} ${!videoEnabled ? styles.btnAlert : ''}`}
            aria-label="Toggle Video"
          >
            {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          
          <button 
            onClick={onToggleAudio}
            className={`${styles.btnCircle} ${!audioEnabled ? styles.btnAlert : ''}`}
            aria-label="Toggle Audio"
          >
            {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          <button 
            onClick={onSkip}
            className={styles.btnNext}
          >
            NEXT <Zap size={14} fill="white" />
          </button>

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

      {/* --- Search / Countdown Overlay --- */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay} onClick={(e) => e.stopPropagation()}>
          <div className={styles.overlayContent}>
            {autoSearchCountdown !== null ? (
              <div className={styles.countdownContainer}>
                <div className={styles.countdownWrapper}>
                  <div className={styles.countdownText}>{autoSearchCountdown}</div>
                  <div className={styles.countdownExclaim}>!</div>
                </div>
                <p className={styles.overlaySubtext}>FINDING NEW OREY!</p>
                <button 
                  onClick={onCancelAutoSearch}
                  className={styles.btnTerminate}
                >
                  TERMINATE
                </button>
              </div>
            ) : (
              <div className={styles.loaderContainer}>
                <div className={styles.brandTitle}>
                  Orey<span className={styles.accentText}>!</span>
                </div>
                <div className={styles.loadingBarTrack}>
                  <div className={styles.loadingBarFill} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Room ID Hint */}
      <div className={`${styles.roomHint} ${!uiVisible ? styles.uiHidden : ''}`}>
        ID: {roomId}
      </div>
    </div>
  );
}


