
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  UserPlus, Zap
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * CallScreen Component
 * Stacks vertically on mobile, side-by-side on desktop.
 * Dynamic name generation and unified linear controls.
 */

const CallScreen = () => {
  const [partner, setPartner] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [searching, setSearching] = useState(false);
  const [autoSearchCountdown, setAutoSearchCountdown] = useState(null);
  const [uiVisible, setUiVisible] = useState(true);
  const [partnerName, setPartnerName] = useState("Waiting...");

  const uiTimerRef = useRef(null);

  const resetUiTimer = useCallback(() => {
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
  }, []);

  useEffect(() => {
    resetUiTimer();
    return () => { if (uiTimerRef.current) clearTimeout(uiTimerRef.current); };
  }, [resetUiTimer]);

  const handleRootClick = (e) => {
    if (e.target.closest('button')) return;
    setUiVisible((prev) => {
      if (!prev) resetUiTimer();
      return !prev;
    });
  };

  const onSkip = () => {
    setPartner(null);
    setPartnerName("Searching...");
    setSearching(true);
    setTimeout(() => {
      setSearching(false);
      setAutoSearchCountdown(3);
    }, 1500);
  };

  useEffect(() => {
    if (autoSearchCountdown !== null && autoSearchCountdown > 0) {
      const timer = setTimeout(() => setAutoSearchCountdown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else if (autoSearchCountdown === 0) {
      setAutoSearchCountdown(null);
      const randomId = Math.floor(Math.random() * 9000) + 1000;
      setPartner({ id: randomId });
      setPartnerName(`Stranger #${randomId}`);
    }
  }, [autoSearchCountdown]);

  return (
    <div className={styles.appContainer} onClick={handleRootClick}>
      <div className={styles.grain} aria-hidden="true" />

      {/* STRANGER PANEL */}
      <div className={`${styles.panel} ${styles.partnerPanel} ${searching ? styles.searchingBlur : ''}`}>
        <div className={styles.placeholderBrand}>OREY!</div>
        
        {partner && <div className={styles.videoSim} />}

        <div className={`${styles.statusBadge} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={styles.badgeContent}>
            <div className={`${styles.dot} ${partner ? styles.dotGreen : styles.dotRed}`} />
            <span className={styles.badgeText}>{partnerName}</span>
          </div>
        </div>
      </div>

      {/* YOU PANEL */}
      <div className={`${styles.panel} ${styles.localPanel}`}>
        {videoEnabled ? (
          <div className={`${styles.videoSim} ${styles.mirrored}`} />
        ) : (
          <div className={styles.idleIcon}><VideoOff size={40} /></div>
        )}

        <div className={`${styles.statusBadge} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={styles.badgeContent}>
            <div className={`${styles.dot} ${styles.dotGray}`} />
            <span className={styles.badgeText}>You</span>
          </div>
        </div>
      </div>

      {/* UNIFIED CONTROLS */}
      <div className={`${styles.controlDock} ${!uiVisible ? styles.dockHidden : ''}`}>
        <div className={styles.pillBar}>
          <button onClick={onSkip} className={styles.nextBtn}>
            NEXT <Zap size={14} fill="currentColor" />
          </button>

          <div className={styles.divider} />

          <div className={styles.mediaActions}>
            <button 
              onClick={() => setVideoEnabled(!videoEnabled)}
              className={`${styles.iconBtn} ${!videoEnabled ? styles.btnActive : ''}`}
            >
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button 
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`${styles.iconBtn} ${!audioEnabled ? styles.btnActive : ''}`}
            >
              {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button className={styles.iconBtn}>
              <UserPlus size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* SEARCHING OVERLAY */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay}>
          {autoSearchCountdown !== null ? (
            <div className={styles.countdownContainer}>
              <div className={styles.numberRow}>
                <span className={styles.countdownNum}>{autoSearchCountdown}</span>
                <span className={styles.exclamation}>!</span>
              </div>
              <p className={styles.overlayLabel}>MATCH FOUND</p>
              <button onClick={() => setAutoSearchCountdown(null)} className={styles.cancelBtn}>CANCEL</button>
            </div>
          ) : (
            <div className={styles.loadingContainer}>
              <div className={styles.loadingTrack}>
                <div className={styles.loadingFill} />
              </div>
              <p className={styles.syncLabel}>SYNCING PEERS</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallScreen;

