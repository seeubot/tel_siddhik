import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  UserPlus, Zap, Pencil, Check
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * CallScreen Component
 * Stacks vertically on mobile, side-by-side on desktop.
 * Real camera/mic via getUserMedia, editable username badge.
 */

const CallScreen = () => {
  const [partner, setPartner]                         = useState(null);
  const [audioEnabled, setAudioEnabled]               = useState(true);
  const [videoEnabled, setVideoEnabled]               = useState(true);
  const [searching, setSearching]                     = useState(false);
  const [autoSearchCountdown, setAutoSearchCountdown] = useState(null);
  const [uiVisible, setUiVisible]                     = useState(true);
  const [partnerName, setPartnerName]                 = useState('Waiting...');
  const [userName, setUserName]                       = useState('You');
  const [editingName, setEditingName]                 = useState(false);
  const [nameInput, setNameInput]                     = useState('You');
  const [camError, setCamError]                       = useState(false);

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const uiTimerRef     = useRef(null);
  const nameInputRef   = useRef(null);

  // ── Acquire local camera + mic ───────────────────────────────────────────
  useEffect(() => {
    let active = true;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      })
      .catch(() => { if (active) setCamError(true); });

    return () => {
      active = false;
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Toggle video track ───────────────────────────────────────────────────
  useEffect(() => {
    localStreamRef.current
      ?.getVideoTracks()
      .forEach(t => { t.enabled = videoEnabled; });
  }, [videoEnabled]);

  // ── Toggle audio track ───────────────────────────────────────────────────
  useEffect(() => {
    localStreamRef.current
      ?.getAudioTracks()
      .forEach(t => { t.enabled = audioEnabled; });
  }, [audioEnabled]);

  // ── UI auto-hide timer ───────────────────────────────────────────────────
  const resetUiTimer = useCallback(() => {
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
  }, []);

  useEffect(() => {
    resetUiTimer();
    return () => { if (uiTimerRef.current) clearTimeout(uiTimerRef.current); };
  }, [resetUiTimer]);

  const handleRootClick = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    setUiVisible((prev) => { if (!prev) resetUiTimer(); return !prev; });
  };

  // ── Editable username ────────────────────────────────────────────────────
  const startEditName = (e) => {
    e.stopPropagation();
    setNameInput(userName);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  };

  const commitName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) setUserName(trimmed);
    else setNameInput(userName);
    setEditingName(false);
  };

  const handleNameKey = (e) => {
    if (e.key === 'Enter') commitName();
    if (e.key === 'Escape') { setEditingName(false); setNameInput(userName); }
  };

  // ── Skip / match logic ───────────────────────────────────────────────────
  const onSkip = () => {
    setPartner(null);
    setPartnerName('Searching...');
    setSearching(true);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setTimeout(() => { setSearching(false); setAutoSearchCountdown(3); }, 1500);
  };

  useEffect(() => {
    if (autoSearchCountdown !== null && autoSearchCountdown > 0) {
      const timer = setTimeout(() => setAutoSearchCountdown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (autoSearchCountdown === 0) {
      setAutoSearchCountdown(null);
      const randomId = Math.floor(Math.random() * 9000) + 1000;
      setPartner({ id: randomId });
      setPartnerName(`Stranger #${randomId}`);
    }
  }, [autoSearchCountdown]);

  const isConnected = !!partner;

  return (
    <div className={styles.appContainer} onClick={handleRootClick}>
      <div className={styles.grain} aria-hidden="true" />

      {/* ── PARTNER PANEL ── */}
      <div className={`${styles.panel} ${styles.partnerPanel} ${searching ? styles.searchingBlur : ''}`}>
        {isConnected ? (
          <video
            ref={remoteVideoRef}
            className={styles.videoEl}
            autoPlay
            playsInline
          />
        ) : (
          <div className={styles.partnerWaiting}>
            <span className={styles.placeholderBrand}>OREY!</span>
          </div>
        )}

        <div className={`${styles.statusBadge} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={styles.badgeContent}>
            <div className={`${styles.dot} ${isConnected ? styles.dotGreen : styles.dotRed}`} />
            <span className={styles.badgeText}>{partnerName}</span>
          </div>
        </div>
      </div>

      {/* ── LOCAL PANEL ── */}
      <div className={`${styles.panel} ${styles.localPanel}`}>
        {camError ? (
          <div className={styles.camError}>
            <VideoOff size={36} />
            <span>Camera unavailable</span>
          </div>
        ) : videoEnabled ? (
          <video
            ref={localVideoRef}
            className={`${styles.videoEl} ${styles.mirrored}`}
            autoPlay
            muted
            playsInline
          />
        ) : (
          <div className={styles.idleIcon}>
            <VideoOff size={40} />
          </div>
        )}

        <div className={`${styles.statusBadge} ${!uiVisible ? styles.uiHidden : ''}`}>
          <div className={styles.badgeContent}>
            <div className={`${styles.dot} ${styles.dotGray}`} />

            {editingName ? (
              <>
                <input
                  ref={nameInputRef}
                  className={styles.badgeNameInput}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={handleNameKey}
                  maxLength={20}
                />
                <button className={styles.badgeEditBtn} onClick={commitName}>
                  <Check size={11} />
                </button>
              </>
            ) : (
              <>
                <span className={styles.badgeText}>{userName}</span>
                <button className={styles.badgeEditBtn} onClick={startEditName}>
                  <Pencil size={10} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTROLS DOCK ── */}
      <div className={`${styles.controlDock} ${!uiVisible ? styles.dockHidden : ''}`}>
        <div className={styles.pillBar}>
          <button onClick={onSkip} className={styles.nextBtn}>
            NEXT <Zap size={14} fill="currentColor" />
          </button>

          <div className={styles.divider} />

          <div className={styles.mediaActions}>
            <button
              onClick={() => setVideoEnabled(v => !v)}
              className={`${styles.iconBtn} ${!videoEnabled ? styles.btnActive : ''}`}
              title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button
              onClick={() => setAudioEnabled(a => !a)}
              className={`${styles.iconBtn} ${!audioEnabled ? styles.btnActive : ''}`}
              title={audioEnabled ? 'Mute' : 'Unmute'}
            >
              {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button className={styles.iconBtn} title="Add friend">
              <UserPlus size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ── SEARCHING OVERLAY ── */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay}>
          {autoSearchCountdown !== null ? (
            <div className={styles.countdownContainer}>
              <div className={styles.numberRow}>
                <span className={styles.countdownNum}>{autoSearchCountdown}</span>
                <span className={styles.exclamation}>!</span>
              </div>
              <p className={styles.overlayLabel}>MATCH FOUND</p>
              <button onClick={() => setAutoSearchCountdown(null)} className={styles.cancelBtn}>
                CANCEL
              </button>
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
