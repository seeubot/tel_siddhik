
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, UserPlus, Zap, X
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro — Responsive Call Interface
 * Divided into separate JSX and CSS Module.
 */

const CallScreen = ({
  partner = null,
  roomId = "000-000",
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
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const uiTimerRef = useRef(null);

  const isPartnerVideoEnabled = partnerMedia?.video !== false;

  const resetUiTimer = useCallback(() => {
    clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
  }, []);

  useEffect(() => {
    resetUiTimer();
    return () => clearTimeout(uiTimerRef.current);
  }, [resetUiTimer]);

  const handleRootClick = useCallback((e) => {
    if (e.target.closest('button')) return;
    setUiVisible((prev) => {
      if (!prev) resetUiTimer();
      return !prev;
    });
  }, [resetUiTimer]);

  return (
    <div 
      className={`${styles.container} ${uiVisible ? '' : styles.uiHidden}`}
      onClick={handleRootClick}
    >
      {/* Grain overlay */}
      <div className={styles.grainOverlay} aria-hidden="true" />

      {/* STRANGER PANEL */}
      <div className={`${styles.panel} ${styles.remotePanel} ${searching ? styles.searchingBlur : ''}`}>
        <video
          ref={remoteVideoRef}
          className={styles.videoStream}
          autoPlay
          playsInline
          style={{ display: partner && isPartnerVideoEnabled ? 'block' : 'none' }}
        />

        {(!partner || !isPartnerVideoEnabled) && (
          <div className={styles.idleOverlay}>
            <div className={styles.brandBg}>OREY!</div>
            <p className={styles.statusText}>
              {searching ? 'SYNCING...' : 'STREAM IDLE'}
            </p>
          </div>
        )}

        <div className={styles.floatingLabelTop}>
          <div className={styles.badge}>
            <span className={styles.liveDot} />
            <span className={styles.badgeText}>Stranger</span>
          </div>
        </div>

        <div className={styles.roomInfo}>{roomId}</div>
        <div className={`${styles.gradient} ${styles.gradientBottom} md:hidden`} />
        <div className={`${styles.gradient} ${styles.gradientRight} hidden md:block`} />
      </div>

      {/* DIVIDER */}
      <div className={styles.divider} aria-hidden="true" />

      {/* YOU PANEL */}
      <div className={`${styles.panel} ${styles.localPanel}`}>
        <video
          ref={localVideoRef}
          className={`${styles.videoStream} ${styles.mirrored}`}
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />

        {!videoEnabled && (
          <div className={styles.idleOverlay}>
            <VideoOff size={32} strokeWidth={1} className="opacity-20" />
          </div>
        )}

        <div className={styles.floatingLabelBottom}>
          <div className={styles.badge}>
            <span className={styles.staticDot} />
            <span className={styles.badgeText}>You</span>
          </div>
        </div>

        <div className={`${styles.gradient} ${styles.gradientTop} md:hidden`} />
        <div className={`${styles.gradient} ${styles.gradientLeft} hidden md:block`} />
      </div>

      {/* CONTROL DOCK */}
      <div className={styles.controlDock}>
        <div className={styles.navGroup}>
          <button onClick={onLeave} className={styles.iconBtnSecondary} title="Stop Call">
            <X size={20} strokeWidth={2.5} />
          </button>
          
          <button onClick={onSkip} className={styles.nextBtn}>
            NEXT
            <div className={styles.nextIconBox}>
              <Zap size={14} fill="currentColor" />
            </div>
          </button>
        </div>

        <div className={styles.mediaGroup}>
            <button onClick={onShareId} className={styles.iconBtnSecondary}>
              <UserPlus size={18} />
            </button>
            <div className={styles.vSeparator} />
            <button
              onClick={onToggleVideo}
              className={`${styles.iconBtnMedia} ${!videoEnabled ? styles.btnActive : ''}`}
            >
              {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              onClick={onToggleAudio}
              className={`${styles.iconBtnMedia} ${!audioEnabled ? styles.btnActive : ''}`}
            >
              {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
        </div>
      </div>

      {/* SEARCH OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.fullOverlay} onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col items-center">
            {autoSearchCountdown !== null ? (
              <div className="flex flex-col items-center">
                <div className="flex items-start text-white">
                  <span className={styles.countdownNumber}>{autoSearchCountdown}</span>
                  <span className={styles.countdownExclamation}>!</span>
                </div>
                <p className={styles.incomingLabel}>INCOMING PEER</p>
                <button onClick={onCancelAutoSearch} className={styles.cancelBtn}>
                  CANCEL
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className={styles.loadingBrand}>OREY!</div>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} />
                </div>
                <p className={styles.syncLabel}>SYNCING PEERS</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CallScreen;


