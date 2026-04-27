import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  UserPlus, Zap, PhoneOff,
  ShieldCheck, Circle
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro — Responsive Call Interface
 * - Mobile: Top/Bottom split
 * - Desktop: Side-by-Side split
 * - Features: Proper mute indicators, Streamlined controls, Peer status
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
  const mouseMoveTimerRef = useRef(null);
  const containerRef = useRef(null);

  const isPartnerVideoEnabled = partnerMedia?.video !== false;
  const isPartnerAudioEnabled = partnerMedia?.audio !== false;
  const isRemoteConnected = partner && isPartnerVideoEnabled;

  // Mouse movement handler to show UI
  useEffect(() => {
    const handleMouseMove = () => {
      setUiVisible(true);
      
      clearTimeout(mouseMoveTimerRef.current);
      clearTimeout(uiTimerRef.current);
      
      mouseMoveTimerRef.current = setTimeout(() => {
        setUiVisible(false);
      }, 4000);
    };

    const handleMouseLeave = () => {
      clearTimeout(mouseMoveTimerRef.current);
      mouseMoveTimerRef.current = setTimeout(() => {
        setUiVisible(false);
      }, 2000);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);
    }

    uiTimerRef.current = setTimeout(() => setUiVisible(false), 6000);

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
      clearTimeout(mouseMoveTimerRef.current);
      clearTimeout(uiTimerRef.current);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`${styles.container} ${!uiVisible ? styles.uiHidden : ''}`}
    >
      {/* Texture Overlay */}
      <div className={styles.grainOverlay} />
      
      {/* REMOTE STREAM */}
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

        {/* Remote User Status Indicators */}
        {partner && (
          <>
            <div className={styles.remoteTag}>
              <div className={styles.tagContent}>
                <div className={`${styles.statusDot} ${isPartnerVideoEnabled ? styles.dotActive : ''}`} />
                <span className={styles.tagLabel}>Peer</span>
              </div>
            </div>

            {/* Show muted indicator for partner */}
            {!isPartnerAudioEnabled && (
              <div className={styles.peerMuteIndicator}>
                <MicOff size={14} strokeWidth={2} />
              </div>
            )}
          </>
        )}

        {/* Room ID Tag */}
        <div className={styles.roomTag}>
          <div className={styles.tagContent}>
            <span className={styles.monoText}>{roomId}</span>
          </div>
        </div>
      </div>

      {/* LOCAL STREAM */}
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
          <div className={styles.brandingCenter}>
            <div className={styles.brandTextMain}>OREY!</div>
            <p className={styles.cameraOffText}>Camera Off</p>
          </div>
        )}

        {/* Local "YOU" Tag */}
        <div className={styles.localTag}>
          <div className={styles.tagContent}>
            <div className={`${styles.statusDot} ${videoEnabled ? styles.dotActive : ''}`} />
            <span className={styles.tagLabel}>You</span>
          </div>
        </div>

        {/* Local Mute Indicator - Corner badge */}
        {!audioEnabled && (
          <div className={styles.localMuteBadge}>
            <MicOff size={14} strokeWidth={2} />
          </div>
        )}
      </div>

      {/* REDESIGNED CONTROL BAR */}
      <div className={`${styles.controlWrapper} ${uiVisible ? styles.controlVisible : ''}`}>
        <div className={styles.controlBar}>
          {/* Camera Toggle */}
          <button 
            onClick={onToggleVideo}
            className={`${styles.controlBtn} ${!videoEnabled ? styles.controlOff : ''}`}
            aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            <div className={styles.btnInner}>
              {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </div>
            <span className={styles.btnLabel}>Camera</span>
          </button>

          {/* Mic Toggle */}
          <button 
            onClick={onToggleAudio}
            className={`${styles.controlBtn} ${!audioEnabled ? styles.controlOff : ''}`}
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            <div className={styles.btnInner}>
              {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </div>
            <span className={styles.btnLabel}>Mic</span>
          </button>

          {/* NEXT Button - Center */}
          <button 
            onClick={onSkip} 
            className={styles.nextBtn}
            onMouseEnter={() => setNextHovered(true)}
            onMouseLeave={() => setNextHovered(false)}
          >
            <span className={styles.nextText}>NEXT</span>
            <Zap 
              size={14} 
              className={`${styles.zapIcon} ${nextHovered ? styles.zapActive : ''}`}
            />
          </button>

          {/* Invite Button */}
          <button 
            onClick={onShareId} 
            className={styles.controlBtn}
            aria-label="Invite peer"
          >
            <div className={styles.btnInner}>
              <UserPlus size={20} />
            </div>
            <span className={styles.btnLabel}>Invite</span>
          </button>

          {/* Leave Button */}
          <button 
            onClick={onLeave} 
            className={`${styles.controlBtn} ${styles.leaveBtn}`}
            aria-label="Leave call"
          >
            <div className={styles.btnInner}>
              <PhoneOff size={20} />
            </div>
            <span className={styles.btnLabel}>Leave</span>
          </button>
        </div>
        
        {/* Security Badge */}
        <div className={styles.securityBadge}>
          <ShieldCheck size={10} />
          <span>E2E Encrypted</span>
          <Circle size={4} fill="currentColor" />
          <span>{roomId}</span>
        </div>
      </div>

      {/* SEARCHING OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.fullOverlay}>
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
