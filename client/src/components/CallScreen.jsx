import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  UserPlus, Zap, MoreHorizontal, 
  ShieldCheck
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro — Responsive Call Interface
 * - Mobile: Top/Bottom split
 * - Desktop: Side-by-Side split
 * - Features: Rebuilt branding & Mute indicators
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
  onShareId = () => {},
  onCancelAutoSearch = () => {},
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const uiTimerRef = useRef(null);

  const isPartnerVideoEnabled = partnerMedia?.video !== false;
  const isRemoteConnected = partner && isPartnerVideoEnabled;

  const resetUiTimer = useCallback(() => {
    clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 6000);
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
      className={`${styles.container} ${!uiVisible ? styles.uiHidden : ''}`}
      onClick={handleRootClick}
    >
      {/* Texture Overlay */}
      <div className={styles.grainOverlay} />
      
      {/* REMOTE STREAM (Top on Mobile / Left on Desktop) */}
      <div className={`${styles.panel} ${styles.remotePanel} ${searching ? styles.searchingBlur : ''}`}>
        <video
          ref={remoteVideoRef}
          className={styles.videoStream}
          autoPlay
          playsInline
          style={{ display: isRemoteConnected ? 'block' : 'none' }}
        />

        {!isRemoteConnected && (
          <div className={styles.brandingCenter}>
            <div className={styles.brandTextMain}>OREY!</div>
            <p className={styles.statusLabel}>
              {searching ? 'Syncing Mesh' : 'Secure Node'}
            </p>
          </div>
        )}

        <div className={styles.roomTag}>
           <div className={styles.tagContent}>
              <span className={styles.monoText}>{roomId}</span>
           </div>
        </div>
      </div>

      {/* LOCAL STREAM (Bottom on Mobile / Right on Desktop) */}
      <div className={`${styles.panel} ${styles.localPanel}`}>
        <video
          ref={localVideoRef}
          className={`${styles.videoStream} ${styles.mirrored}`}
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />

        {/* Local Mute Indicator */}
        {!audioEnabled && (
          <div className={styles.muteIndicator}>
            <MicOff size={16} />
          </div>
        )}

        {!videoEnabled && (
          <div className={styles.brandingCenter}>
             <div className={`${styles.brandTextMain} opacity-5`}>OREY!</div>
             <p className={styles.cameraOffText}>Camera Off</p>
          </div>
        )}

        <div className={styles.previewTag}>
          <div className={styles.tagContent}>
              <div className={styles.statusDot} />
              <span className={styles.tagLabel}>Preview</span>
          </div>
        </div>
      </div>

      {/* OMNI-PILL CONTROL BAR */}
      <div className={styles.controlWrapper}>
        <div className={styles.omniPill}>
          <div className={styles.btnGroup}>
            <button 
              onClick={onToggleVideo}
              className={`${styles.actionBtn} ${!videoEnabled ? styles.btnAlert : ''}`}
            >
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button 
              onClick={onToggleAudio}
              className={`${styles.actionBtn} ${!audioEnabled ? styles.btnAlert : ''}`}
            >
              {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
          </div>

          <button onClick={onSkip} className={styles.nextBtn}>
            <span className={styles.nextText}>NEXT</span>
            <Zap size={10} fill="currentColor" className={styles.zapIcon} />
          </button>

          <div className={styles.btnGroup}>
            <button onClick={onShareId} className={styles.actionBtn}>
              <UserPlus size={18} />
            </button>
            <button className={styles.actionBtn}>
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
        
        <div className={styles.footerNote}>
            <ShieldCheck size={10} />
            <span>Encrypted Peer Node</span>
        </div>
      </div>

      {/* SEARCHING OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.fullOverlay} onClick={(e) => e.stopPropagation()}>
          <div className={styles.overlayContent}>
            {autoSearchCountdown !== null ? (
              <div className={styles.countdownBox}>
                <div className={styles.countdownNumber}>
                  {autoSearchCountdown}<span className={styles.accentRed}>!</span>
                </div>
                <p className={styles.incomingText}>Peer Found</p>
                <button onClick={onCancelAutoSearch} className={styles.abortBtn}>
                  Abort Sync
                </button>
              </div>
            ) : (
              <div className={styles.syncBox}>
                <div className={styles.loadingBrand}>OREY!</div>
                <div className={styles.dotRunner}>
                  <div className={styles.dot} style={{ animationDelay: '0s' }} />
                  <div className={styles.dot} style={{ animationDelay: '0.2s' }} />
                  <div className={styles.dot} style={{ animationDelay: '0.4s' }} />
                </div>
                <p className={styles.syncText}>Scanning Peer Mesh</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CallScreen;
