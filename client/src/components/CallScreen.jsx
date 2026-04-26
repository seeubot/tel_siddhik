import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, UserPlus, Zap
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro — Redesigned CallScreen
 * Full-bleed remote video with draggable PiP local view.
 * Cinematic aesthetic: dark, immersive, minimal chrome.
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

  // PiP drag state
  const pipRef = useRef(null);
  const dragState = useRef({ dragging: false, offX: 0, offY: 0 });
  const [pipPos, setPipPos] = useState({ right: 20, bottom: 110, left: null, top: null });

  const isPartnerVideoEnabled = partnerMedia?.video !== false;

  // UI auto-hide
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

  // PiP drag handlers
  const handlePipMouseDown = useCallback((e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const pip = pipRef.current;
    const rect = pip.getBoundingClientRect();
    dragState.current = { dragging: true, offX: e.clientX - rect.left, offY: e.clientY - rect.top };
  }, []);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragState.current.dragging) return;
      const pip = pipRef.current;
      if (!pip) return;
      const root = pip.parentElement;
      const rRect = root.getBoundingClientRect();
      let x = e.clientX - dragState.current.offX - rRect.left;
      let y = e.clientY - dragState.current.offY - rRect.top;
      x = Math.max(8, Math.min(x, rRect.width - pip.offsetWidth - 8));
      y = Math.max(8, Math.min(y, rRect.height - pip.offsetHeight - 8));
      setPipPos({ left: x, top: y, right: null, bottom: null });
    };
    const onMouseUp = () => { dragState.current.dragging = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const pipStyle = {
    ...(pipPos.left !== null ? { left: pipPos.left, top: pipPos.top, right: 'auto', bottom: 'auto' } : { right: pipPos.right, bottom: pipPos.bottom }),
  };

  return (
    <div className={styles.root} onClick={handleRootClick}>

      {/* ── Grain overlay ── */}
      <div className={styles.grain} aria-hidden="true" />

      {/* ── Remote video (full bleed) ── */}
      <div className={`${styles.remotePanel} ${searching ? styles.remotePanelSearching : ''}`}>
        <div className={styles.letterboxTop} aria-hidden="true" />
        <div className={styles.letterboxBottom} aria-hidden="true" />

        <video
          ref={remoteVideoRef}
          className={`${styles.remoteVideo} ${!searching ? styles.animateZoom : ''}`}
          autoPlay
          playsInline
          style={{ display: partner && isPartnerVideoEnabled ? 'block' : 'none' }}
        />

        {(!partner || !isPartnerVideoEnabled) && (
          <div className={styles.remoteFallback}>
            <div className={styles.brandGhost}>OREY!</div>
            <p className={styles.idleText}>
              {searching ? 'SYNCING...' : 'STREAM IDLE'}
            </p>
          </div>
        )}
      </div>

      {/* ── Stranger label (top-left) ── */}
      <div className={`${styles.strangerLabel} ${!uiVisible ? styles.uiHidden : ''}`}>
        <div className={styles.capsule}>
          <span className={styles.liveDot} />
          <span className={styles.labelText}>Stranger</span>
        </div>
      </div>

      {/* ── Room ID (top-right) ── */}
      <div className={`${styles.roomId} ${!uiVisible ? styles.uiHidden : ''}`}>
        {roomId} // SECURE_LINE
      </div>

      {/* ── PiP local video ── */}
      <div
        ref={pipRef}
        className={styles.pipContainer}
        style={pipStyle}
        onMouseDown={handlePipMouseDown}
      >
        <video
          ref={localVideoRef}
          className={styles.pipVideo}
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />
        {!videoEnabled && (
          <div className={styles.pipFallback}>
            <VideoOff size={20} strokeWidth={1.5} style={{ color: 'rgba(255,255,255,0.3)' }} />
          </div>
        )}
        <div className={`${styles.pipLabel} ${!uiVisible ? styles.uiHidden : ''}`}>
          <span className={styles.pipDot} />
          <span className={styles.pipLabelText}>You</span>
        </div>
      </div>

      {/* ── Controls dock ── */}
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
