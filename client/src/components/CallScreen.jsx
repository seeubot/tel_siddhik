
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Ghost,
  Lock, Eye, EyeOff
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * OREY! PRO - CLEAN 50/50 SPLIT
 * Logic and structure for the video call interface.
 */

const CallScreen = () => {
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isPrivacyBlurred, setIsPrivacyBlurred] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [uiVisible, setUiVisible] = useState(true);
  const [countdown, setCountdown] = useState(null);
  
  const uiTimerRef = useRef(null);

  const toggleAudio = () => setIsAudioEnabled(!isAudioEnabled);
  const toggleVideo = () => setIsVideoEnabled(!isVideoEnabled);
  const togglePrivacyBlur = () => setIsPrivacyBlurred(!isPrivacyBlurred);

  const startNextSearch = useCallback(() => {
    if (isSearching) return;
    setIsSearching(true);
    setConnectionStatus('searching');
    setTimeout(() => setCountdown(3), 1500);
  }, [isSearching]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      setIsSearching(false);
      setConnectionStatus('connected');
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    const showUI = () => {
      setUiVisible(true);
      clearTimeout(uiTimerRef.current);
      uiTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
    };
    window.addEventListener('mousemove', showUI);
    window.addEventListener('touchstart', showUI);
    return () => {
      window.removeEventListener('mousemove', showUI);
      window.removeEventListener('touchstart', showUI);
    };
  }, []);

  return (
    <div className={`${styles.container} ${!uiVisible ? styles.uiHidden : ''}`}>
      
      {/* 50/50 Adaptive Video Split */}
      <main className={styles.mainGrid}>
        
        {/* REMOTE PEER */}
        <section className={`${styles.videoSection} ${isSearching ? styles.searchingPeer : ''}`}>
          <video className={styles.videoStream} autoPlay playsInline />
          
          {!connectionStatus === 'connected' && !isSearching && (
            <div className={styles.placeholderLogo}>
              <h1 className={styles.brandText}>Orey!</h1>
            </div>
          )}
        </section>

        {/* LOCAL USER */}
        <section className={styles.videoSectionLocal}>
          <video 
            className={`${styles.videoStream} ${styles.mirrored} ${!isVideoEnabled ? styles.videoOff : ''} ${isPrivacyBlurred ? styles.privacyBlur : ''}`} 
            autoPlay playsInline muted 
          />

          {isPrivacyBlurred && isVideoEnabled && (
            <div className={styles.blurIndicator}>
               <Ghost size={64} className={styles.ghostIcon} />
            </div>
          )}

          {!isVideoEnabled && (
            <div className={styles.blackout}>
               <VideoOff size={32} className={styles.fadedIcon} />
            </div>
          )}
        </section>
      </main>

      {/* BOTTOM CONTROL DOCK */}
      <div className={`${styles.controlDock} ${uiVisible ? styles.dockVisible : styles.dockHidden}`}>
        <div className={styles.dockWrapper}>
          
          <div className={styles.mainPill}>
            
            {/* Media Group */}
            <div className={styles.actionGroupLeft}>
              <button 
                onClick={toggleVideo}
                className={`${styles.iconBtn} ${!isVideoEnabled ? styles.btnDanger : ''}`}
              >
                {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
              <button 
                onClick={toggleAudio}
                className={`${styles.iconBtn} ${!isAudioEnabled ? styles.btnDanger : ''}`}
              >
                {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
            </div>

            {/* Primary Action */}
            <button 
              onClick={startNextSearch}
              disabled={isSearching}
              className={styles.nextBtn}
            >
              <span className={styles.nextText}>
                {isSearching ? 'Sync' : 'Next'}
              </span>
              <Zap size={16} fill="currentColor" />
            </button>

            {/* System Group */}
            <div className={styles.actionGroupRight}>
              <button 
                onClick={togglePrivacyBlur}
                className={`${styles.iconBtn} ${isPrivacyBlurred ? styles.btnActive : ''}`}
              >
                {isPrivacyBlurred ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
              <button 
                onClick={() => window.location.reload()}
                className={`${styles.iconBtn} ${styles.btnHangup}`}
              >
                <PhoneOff size={20} />
              </button>
            </div>
          </div>

          <div className={styles.securityNote}>
            <Lock size={10} className={styles.greenText} />
            <span className={styles.noteText}>E2E SECURE MESH</span>
          </div>
        </div>
      </div>

      {/* SYNC OVERLAY */}
      {isSearching && (
        <div className={styles.syncOverlay}>
          <div className={styles.syncContent}>
            {countdown !== null ? (
              <div className={styles.countdownValue}>{countdown}</div>
            ) : (
              <div className={styles.loadingSpinner}>
                <div className={styles.spinnerCircle} />
                <h2 className={styles.loadingText}>SWITCHING</h2>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CallScreen;

