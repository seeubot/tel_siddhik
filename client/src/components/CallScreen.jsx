import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  UserPlus, Zap, MoreHorizontal, 
  ShieldCheck, Sparkles
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro — Responsive Call Interface
 * - Mobile: Top/Bottom split
 * - Desktop: Side-by-Side split
 * - Features: Rebuilt branding & Mute indicators
 * - Enhanced Control Bar: Premium glass-morphism with micro-interactions
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
  const [nextHovered, setNextHovered] = useState(false);
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

        {/* Remote Mute Indicator */}
        {partner && !partnerMedia?.audio && (
          <div className={styles.remoteMuteBadge}>
            <MicOff size={12} />
          </div>
        )}
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
            <span className={styles.muteLabel}>MUTED</span>
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
              <div className={`${styles.statusDot} ${videoEnabled ? styles.dotActive : ''}`} />
              <span className={styles.tagLabel}>Preview</span>
          </div>
        </div>
      </div>

      {/* ENHANCED OMNI-PILL CONTROL BAR */}
      <div className={styles.controlWrapper}>
        <div className={styles.omniPill}>
          {/* Left Button Group - Media Controls */}
          <div className={styles.btnGroup}>
            <button 
              onClick={onToggleVideo}
              className={`${styles.actionBtn} ${!videoEnabled ? styles.btnAlert : ''}`}
              aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
              title={videoEnabled ? 'Camera On' : 'Camera Off'}
            >
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              {!videoEnabled && <span className={styles.btnGlow} />}
            </button>
            
            <div className={styles.btnDivider} />
            
            <button 
              onClick={onToggleAudio}
              className={`${styles.actionBtn} ${!audioEnabled ? styles.btnAlert : ''}`}
              aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
              title={audioEnabled ? 'Mic On' : 'Mic Off'}
            >
              {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              {!audioEnabled && <span className={styles.btnGlow} />}
            </button>
          </div>

          {/* Center - NEXT Button */}
          <button 
            onClick={onSkip} 
            className={styles.nextBtn}
            onMouseEnter={() => setNextHovered(true)}
            onMouseLeave={() => setNextHovered(false)}
          >
            <span className={styles.nextText}>NEXT</span>
            <Zap 
              size={12} 
              fill="currentColor" 
              className={`${styles.zapIcon} ${nextHovered ? styles.zapActive : ''}`}
            />
            {nextHovered && <Sparkles size={10} className={styles.sparkleLeft} />}
            {nextHovered && <Sparkles size={8} className={styles.sparkleRight} />}
          </button>

          {/* Right Button Group - Actions */}
          <div className={styles.btnGroup}>
            <button 
              onClick={onShareId} 
              className={styles.actionBtn}
              aria-label="Share room ID"
              title="Invite"
            >
              <UserPlus size={18} />
            </button>
            
            <div className={styles.btnDivider} />
            
            <button 
              className={styles.actionBtn}
              aria-label="More options"
              title="More"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
        
        {/* Footer Security Note */}
        <div className={styles.footerNote}>
          <ShieldCheck size={10} className={styles.shieldIcon} />
          <span>Encrypted Peer Node</span>
        </div>
      </div>

      {/* SEARCHING OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.fullOverlay} onClick={(e) => e.stopPropagation()}>
          <div className={styles.overlayContent}>
            {autoSearchCountdown !== null ? (
              <div className={styles.countdownBox}>
                <div className={styles.countdownRing}>
                  <div className={styles.countdownNumber}>
                    {autoSearchCountdown}<span className={styles.accentRed}>!</span>
                  </div>
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
