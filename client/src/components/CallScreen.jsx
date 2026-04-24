
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  SkipForward, 
  PhoneOff,
  Share2
} from 'lucide-react';
import styles from './CallScreen.module.css';

export default function CallScreen({
  localStream,
  remoteStream,
  peerName = "Syncing...",
  audioOn = true,
  videoOn = true,
  onToggleMic,
  onToggleCam,
  onShareId,
  onSkip,
  onLeave,
  searching = false,
  searchDelay = 3,
  onCancelSearch,
  searchMessage = "Finding your next vibe...",
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [countdown, setCountdown] = useState(null);

  const attachStream = useCallback((videoEl, stream) => {
    if (!videoEl || !stream) return;
    if (videoEl.srcObject === stream) return;
    videoEl.srcObject = stream;
    videoEl.play().catch(err => {
      if (err.name !== 'AbortError') console.warn('Video play failed', err);
    });
  }, []);

  useEffect(() => attachStream(localVideoRef.current, localStream), [localStream, attachStream]);
  useEffect(() => attachStream(remoteVideoRef.current, remoteStream), [remoteStream, attachStream]);

  useEffect(() => {
    if (!searching) { setCountdown(null); return; }
    setCountdown(searchDelay);
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [searching, searchDelay]);

  return (
    <div className={styles.stage}>
      {/* Remote */}
      <div className={styles.card}>
        <video ref={remoteVideoRef} autoPlay playsInline className={styles.videoElement} />
        {!remoteStream && (
          <div className={styles.placeholder}>
            <div className={styles.avatarCircle}>
              <div className={styles.avatar}>{peerName[0]}</div>
            </div>
          </div>
        )}
        <div className={styles.badge}>{peerName}</div>
      </div>

      {/* Local */}
      <div className={`${styles.card} ${!videoOn ? styles.localPlaceholderCard : ''}`}>
        <video ref={localVideoRef} autoPlay muted playsInline className={`${styles.videoElement} ${styles.localVideo}`} />
        <div className={styles.badge}>You</div>
        {!videoOn && (
          <div className={`${styles.placeholder} ${styles.localPlaceholder}`}>
            <div className={styles.avatarCircle}><div className={styles.avatar}>Y</div></div>
          </div>
        )}
        {!audioOn && <div className={styles.statusIcon}><MicOff size={20} /></div>}
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <button onClick={onToggleCam} className={`${styles.btn} ${videoOn ? styles.btnDark : styles.btnLight}`}>
          {videoOn ? <Video size={22} /> : <VideoOff size={22} />}
        </button>
        <button onClick={onToggleMic} className={`${styles.btn} ${audioOn ? styles.btnDark : styles.btnLight}`}>
          {audioOn ? <Mic size={22} /> : <MicOff size={22} />}
        </button>
        <button onClick={onLeave} className={`${styles.btn} ${styles.btnEnd}`}><PhoneOff size={28} /></button>
        <button onClick={onShareId} className={`${styles.btn} ${styles.btnDark}`}><Share2 size={22} /></button>
        <button onClick={onSkip} className={`${styles.btn} ${styles.btnNext}`}><SkipForward size={22} /></button>
      </div>

      {searching && (
        <div className={styles.searchOverlay}>
          <div className={styles.spinnerContainer}>
            <div className={styles.spinner} />
            <div className={styles.countdownText}>{countdown}</div>
          </div>
          <div className={styles.textCenter}>
            <h2 className={styles.searchTitle}>{searchMessage}</h2>
          </div>
          <button className={styles.btnCancel} onClick={onCancelSearch}>Cancel Search</button>
        </div>
      )}
    </div>
  );
}
