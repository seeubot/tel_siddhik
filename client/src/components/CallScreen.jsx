import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  UserPlus, Zap, MapPin, Navigation,
  ShieldCheck
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro — Responsive Call Interface
 * - Mobile: Top/Bottom split
 * - Desktop: Side-by-Side split
 * - Features: Live GPS location, Mouse-aware controls, Improved UI
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
  const [userLocation, setUserLocation] = useState(null);
  const [locationString, setLocationString] = useState('TG');
  const uiTimerRef = useRef(null);
  const mouseMoveTimerRef = useRef(null);
  const containerRef = useRef(null);

  const isPartnerVideoEnabled = partnerMedia?.video !== false;
  const isRemoteConnected = partner && isPartnerVideoEnabled;

  // Get live GPS location
  useEffect(() => {
    if (!navigator.geolocation) {
      console.log('Geolocation not supported');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setUserLocation({ latitude, longitude, accuracy });
        
        // Convert coordinates to short location code
        const latCode = Math.abs(latitude).toFixed(1);
        const lonCode = Math.abs(longitude).toFixed(1);
        const latDir = latitude >= 0 ? 'N' : 'S';
        const lonDir = longitude >= 0 ? 'E' : 'W';
        setLocationString(`${latCode}${latDir}·${lonCode}${lonDir}`);
      },
      (error) => {
        console.error('Geolocation error:', error);
        // Fallback to IP-based location or default
        setLocationString('AP');
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Mouse movement handler to show UI
  useEffect(() => {
    const handleMouseMove = (e) => {
      setUiVisible(true);
      
      clearTimeout(mouseMoveTimerRef.current);
      clearTimeout(uiTimerRef.current);
      
      // Hide UI after 4 seconds of no mouse movement
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

    // Initial hide timer
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

        {/* Location-based Room Tag */}
        <div className={styles.roomTag}>
          <div className={styles.tagContent}>
            <MapPin size={10} className={styles.locationIcon} />
            <span className={styles.monoText}>{locationString}</span>
            {userLocation && (
              <span className={styles.gpsDot} />
            )}
          </div>
        </div>

        {/* Remote User Tag */}
        {partner && (
          <div className={styles.userTag}>
            <div className={styles.tagContent}>
              <span className={styles.tagLabel}>YOU</span>
            </div>
          </div>
        )}
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

        {/* Local Mute Indicator - Redesigned as icon overlay */}
        {!audioEnabled && (
          <div className={styles.muteOverlay}>
            <MicOff size={24} strokeWidth={1.5} />
          </div>
        )}

        {!videoEnabled && (
          <div className={styles.brandingCenter}>
            <div className={styles.brandTextMain}>OREY!</div>
            <p className={styles.cameraOffText}>Camera Off</p>
          </div>
        )}

        {/* "YOU" Tag instead of Preview */}
        <div className={styles.previewTag}>
          <div className={styles.tagContent}>
            <div className={`${styles.statusDot} ${videoEnabled ? styles.dotActive : ''}`} />
            <span className={styles.tagLabel}>YOU</span>
          </div>
        </div>
      </div>

      {/* ENHANCED CONTROL BAR - No 3 dots, Mouse-aware */}
      <div className={`${styles.controlWrapper} ${uiVisible ? styles.controlVisible : ''}`}>
        <div className={styles.omniPill}>
          {/* Left - Media Controls */}
          <div className={styles.btnGroup}>
            <button 
              onClick={onToggleVideo}
              className={`${styles.actionBtn} ${!videoEnabled ? styles.btnAlert : ''}`}
              aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              {!videoEnabled && <span className={styles.btnGlow} />}
            </button>
            
            <div className={styles.btnDivider} />
            
            <button 
              onClick={onToggleAudio}
              className={`${styles.actionBtn} ${!audioEnabled ? styles.btnAlert : ''}`}
              aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
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
          </button>

          {/* Right - Single Action Button */}
          <div className={styles.btnGroup}>
            <button 
              onClick={onShareId} 
              className={styles.actionBtn}
              aria-label="Share room ID"
            >
              <UserPlus size={18} />
            </button>
          </div>
        </div>
        
        {/* Footer with Live Location */}
        <div className={styles.footerNote}>
          <Navigation size={10} className={styles.navIcon} />
          <span>{locationString}</span>
          <span className={styles.dot} />
          <ShieldCheck size={10} />
          <span>Encrypted</span>
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
