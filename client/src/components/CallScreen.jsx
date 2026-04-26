import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, UserPlus, Zap
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro — Half & Half CallScreen
 * Remote video on top half, local video on bottom half.
 * Controls dock floats over the center divider.
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
  const uiTimerRef = useRef(null);

  const isPartnerVideoEnabled = partnerMedia?.video !== false;

  const resetUiTimer = useCallback(() => {
    clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
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
    <div className={styles.root} onClick={handleRootClick}>

      {/* ── Grain overlay ── */}
      <div className={styles.grain} aria-hidden="true" />

      {/* ════════════════════════════
          TOP HALF — Remote / Stranger
      ════════════════════════════ */}
      <div className={`${styles.halfPanel} ${styles.remotePanel} ${searching ? styles.remotePanelSearching : ''}`}>

        <video
          ref={remoteVideoRef}
          className={`${styles.halfVideo} ${!searching ? styles.animateZoom : ''}`}
          autoPlay
          playsInline
          style={{ display: partner && isPartnerVideoEnabled ? 'block' : 'none' }}
        />

        {(!partner || !isPartnerVideoEnabled) && (
          <div className={styles.halfFallback}>
            <div className={styles.brandGhost}>OREY!</div>
            <p className={styles.idleText}>
              {searching ? 'SYNCING...' : 'STREAM IDLE'}
            </p>
          </div>
        )}

        {/* Stranger label — top-left of top panel */}
        <div className={`${styles.panelLabel} ${styles.panelLabelTopLeft} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={styles.capsule}>
            <span className={styles.liveDot} />
            <span className={styles.labelText}>Stranger</span>
          </div>
        </div>

        {/* Room ID — top-right of top panel */}
        <div className={`${styles.roomId} ${!uiVisible ? styles.uiHidden : ''}`}>
          {roomId} // SECURE_LINE
        </div>

        {/* Bottom vignette fades into divider */}
        <div className={styles.bottomVignette} aria-hidden="true" />
      </div>

      {/* ════════════════════════════
          BOTTOM HALF — Local / You
      ════════════════════════════ */}
      <div className={`${styles.halfPanel} ${styles.localPanel}`}>

        <video
          ref={localVideoRef}
          className={`${styles.halfVideo} ${styles.mirror}`}
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />

        {!videoEnabled && (
          <div className={styles.halfFallback}>
            <VideoOff size={28} strokeWidth={1.5} style={{ color: 'rgba(255,255,255,0.2)' }} />
          </div>
        )}

        {/* You label — bottom-left of bottom panel */}
        <div className={`${styles.panelLabel} ${styles.panelLabelBottomLeft} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={styles.capsule}>
            <span className={styles.neutralDot} />
            <span className={styles.labelText}>You</span>
          </div>
        </div>

        {/* Top vignette fades into divider */}
        <div className={styles.topVignette} aria-hidden="true" />
      </div>

      {/* ════════════════════════════
          CENTER DIVIDER LINE
      ════════════════════════════ */}
      <div className={styles.divider} aria-hidden="true" />

      {/* ════════════════════════════
          CONTROLS DOCK — floats over center
      ════════════════════════════ */}
      <div className={`${styles.dockWrapper} ${!uiVisible ? styles.dockHidden : ''}`}>
        <div className={styles.dock}>

          <div className={styles.mediaGroup}>
            <button
              onClick={onToggleVideo}
              className={`${styles.btnCircle} ${!videoEnabled ? styles.btnAlert : ''}`}
              aria-label="Toggle Video"
            >
              {videoEnabled ? <Video size={18} strokeWidth={1.8} /> : <VideoOff size={18} strokeWidth={1.8} />}
            </button>
            <button
              onClick={onToggleAudio}
              className={`${styles.btnCircle} ${!audioEnabled ? styles.btnAlert : ''}`}
              aria-label="Toggle Audio"
            >
              {audioEnabled ? <Mic size={18} strokeWidth={1.8} /> : <MicOff size={18} strokeWidth={1.8} />}
            </button>
          </div>

          <button onClick={onSkip} className={styles.btnNext}>
            NEXT <Zap size={13} className={styles.zapIcon} />
          </button>

          <div className={styles.utilityGroup}>
            <button onClick={onShareId} className={styles.btnGhost} aria-label="Share ID">
              <UserPlus size={18} strokeWidth={1.8} />
            </button>
            <button onClick={onLeave} className={styles.btnEnd} aria-label="End Call">
              <PhoneOff size={18} strokeWidth={1.8} />
            </button>
          </div>

        </div>
      </div>

      {/* ── Searching / Countdown overlay ── */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay} onClick={(e) => e.stopPropagation()}>
          <div className={styles.overlayContent}>
            {autoSearchCountdown !== null ? (
              <div className={styles.countdownContainer}>
                <div className={styles.countdownRow}>
                  <span className={styles.countdownNumber}>{autoSearchCountdown}</span>
                  <span className={styles.countdownExclaim}>!</span>
                </div>
                <p className={styles.overlaySubtext}>CONNECTION INCOMING</p>
                <button onClick={onCancelAutoSearch} className={styles.btnCancel}>
                  STOP SEARCH
                </button>
              </div>
            ) : (
              <div className={styles.loaderContainer}>
                <div className={styles.loaderBrand}>OREY!</div>
                <div className={styles.loaderTrack}>
                  <div className={styles.loaderFill} />
                </div>
                <p className={styles.loaderSubtext}>SYNCING...</p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
