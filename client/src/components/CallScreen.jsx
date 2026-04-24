
import React, { useRef, useEffect, useState } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  UserPlus, 
  SkipForward, 
  PhoneOff,
  Share2
} from 'lucide-react';
import styles from './CallScreen.module.css';

export default function CallScreen({
  localVideoRef,
  remoteVideoRef,
  peerName = "Username 1",
  remoteVideoOn = false,
  audioOn = true,
  videoOn = true,
  onToggleMic = () => {},
  onToggleCam = () => {},
  onShareId = () => {},
  onSkip = () => {},
  onLeave = () => {},
  searching = false,
  searchDelay = 5000,
  onCancelSearch = () => {},
  searchMessage = "Finding your next vibe...",
}) {
  const [countdown, setCountdown] = useState(null);

  // Countdown logic for the search overlay
  useEffect(() => {
    if (!searching || !searchDelay) {
      setCountdown(null);
      return;
    }
    const end = Date.now() + searchDelay;
    const interval = setInterval(() => {
      const left = Math.ceil((end - Date.now()) / 1000);
      setCountdown(left > 0 ? left : 0);
    }, 200);
    return () => clearInterval(interval);
  }, [searching, searchDelay]);

  return (
    <div className={styles.stage}>
      {/* Remote Participant Card */}
      <div className={styles.card}>
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className={styles.videoElement}
        />
        
        <div className={styles.badge}>{peerName}</div>

        {!remoteVideoOn && (
          <div className={styles.placeholder}>
            <div className={styles.avatarCircle}>
              <div className={styles.avatar}>{peerName[0]}</div>
            </div>
          </div>
        )}

        {!remoteVideoOn && (
          <div className={styles.statusIcon}>
            <VideoOff size={20} />
          </div>
        )}
      </div>

      {/* Local Participant Card */}
      <div className={`${styles.card} ${!videoOn ? styles.localPlaceholderCard : ''}`}>
        <video 
          ref={localVideoRef} 
          autoPlay 
          muted 
          playsInline 
          className={`${styles.videoElement} ${styles.localVideo}`}
        />
        
        <div className={styles.badge}>You (Username 2)</div>

        {!videoOn && (
          <div className={`${styles.placeholder} ${styles.localPlaceholder}`}>
            <div className={styles.avatarCircle}>
              <div className={styles.avatar}>Y</div>
            </div>
          </div>
        )}

        {!audioOn && (
          <div className={styles.statusIcon}>
            <MicOff size={20} />
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className={styles.controls}>
        <button 
          onClick={onToggleCam}
          className={`${styles.btn} ${videoOn ? styles.btnDark : styles.btnLight}`}
          aria-label="Toggle Camera"
        >
          {videoOn ? <Video size={22} /> : <VideoOff size={22} />}
        </button>

        <button 
          onClick={onToggleMic}
          className={`${styles.btn} ${audioOn ? styles.btnDark : styles.btnLight}`}
          aria-label="Toggle Microphone"
        >
          {audioOn ? <Mic size={22} /> : <MicOff size={22} />}
        </button>

        <button 
          onClick={onLeave}
          className={`${styles.btn} ${styles.btnEnd}`}
          aria-label="End Call"
        >
          <PhoneOff size={28} />
        </button>

        <button 
          onClick={onShareId}
          className={`${styles.btn} ${styles.btnDark}`}
          aria-label="Share ID"
        >
          <Share2 size={22} />
        </button>

        <button 
          onClick={onSkip}
          className={`${styles.btn} ${styles.btnNext}`}
          aria-label="Next Person"
        >
          <SkipForward size={22} />
        </button>
      </div>

      {/* Auto-Search Overlay */}
      {searching && (
        <div className={styles.searchOverlay}>
          <div className={styles.spinnerContainer}>
            <div className={styles.spinner} />
            <div className={styles.countdownText}>{countdown}</div>
          </div>
          
          <div className={styles.textCenter}>
            <h2 className={styles.searchTitle}>{searchMessage}</h2>
            <p style={{ color: '#6b7280', marginTop: '0.5rem', textAlign: 'center' }}>
              Finding a safe match for you...
            </p>
          </div>

          <button className={styles.btnCancel} onClick={onCancelSearch}>
            Cancel Search
          </button>
        </div>
      )}
    </div>
  );
}

