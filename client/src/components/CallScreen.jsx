import React, { useState, useCallback } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, SkipForward, X, UserPlus
} from 'lucide-react';
import styles from './CallScreen.module.css';

export default function CallScreen({
  partner,
  roomId,
  oreyId,
  localVideoRef,
  remoteVideoRef,
  audioEnabled,
  videoEnabled,
  partnerMedia,
  searching,
  autoSearchCountdown,
  onToggleAudio,
  onToggleVideo,
  onSkip,
  onLeave,
  onShareId,
  onCancelAutoSearch,
}) {
  const [uiVisible, setUiVisible] = useState(true);

  const toggleUI = useCallback((e) => {
    // Only toggle if the click wasn't on an interactive button or overlay
    if (e.target.closest('button')) return;
    setUiVisible((prev) => !prev);
  }, []);

  const partnerInitials = (partner?.userName || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Safe check for partner media
  const isPartnerVideoEnabled = partnerMedia?.video !== false;
  const isPartnerAudioEnabled = partnerMedia?.audio === true;

  return (
    <div className={styles.root} onClick={toggleUI}>
      
      {/* Remote View (Top) */}
      <div className={`${styles.videoContainer} ${styles.remoteView}`}>
        <video
          ref={remoteVideoRef}
          className={styles.videoElement}
          autoPlay
          playsInline
          style={{ display: partner && isPartnerVideoEnabled ? 'block' : 'none' }}
        />
        
        {(!partner || !isPartnerVideoEnabled) && (
          <div className={`${styles.fallback} ${styles.remoteFallback}`}>
             <div className={styles.avatar}>{partnerInitials}</div>
             <p className={styles.statusText}>
               {searching ? "Finding Partner..." : "Partner Camera Off"}
             </p>
          </div>
        )}

        <div className={styles.label}>
          <span className={styles.labelText}>{partner?.userName || 'Searching...'}</span>
        </div>

        <div className={`${styles.indicator} ${!uiVisible ? styles.hiddenFade : ''}`}>
          {isPartnerAudioEnabled ? <Mic size={18} /> : <MicOff size={18} color="#ef4444" />}
        </div>
      </div>

      {/* Local View (Bottom) */}
      <div className={`${styles.videoContainer} ${styles.localView}`}>
        <video
          ref={localVideoRef}
          className={`${styles.videoElement} ${styles.mirror}`}
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />

        {!videoEnabled && (
          <div className={`${styles.fallback} ${styles.localFallback}`}>
             <VideoOff size={48} color="rgba(255,255,255,0.1)" />
          </div>
        )}

        <div className={styles.label}>
          <span className={styles.labelText}>You</span>
        </div>

        <div className={`${styles.indicator} ${!uiVisible ? styles.hiddenFade : ''}`}>
          {!audioEnabled && <MicOff size={18} color="#ef4444" />}
        </div>
      </div>

      {/* Controls Bar */}
      <div className={`${styles.controlsWrapper} ${!uiVisible ? styles.hidden : ''}`}>
        <div className={styles.controlsBar}>
          <button 
            className={`${styles.btn} ${videoEnabled ? styles.btnDefault : styles.btnOff}`}
            onClick={onToggleVideo}
            aria-label={videoEnabled ? "Disable video" : "Enable video"}
          >
            {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          
          <button 
            className={`${styles.btn} ${audioEnabled ? styles.btnDefault : styles.btnOff}`}
            onClick={onToggleAudio}
            aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
          >
            {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          <button 
            className={styles.btnEnd} 
            onClick={onLeave}
            aria-label="End call"
          >
            <PhoneOff size={24} strokeWidth={2.5} style={{ transform: 'rotate(135deg)' }} />
          </button>

          <button 
            className={`${styles.btn} ${styles.btnGhost}`} 
            onClick={onSkip}
            aria-label="Skip to next person"
          >
            <SkipForward size={20} />
          </button>

          <button 
            className={`${styles.btn} ${styles.btnGhost}`} 
            onClick={onShareId}
            aria-label="Share room ID"
          >
            <UserPlus size={20} />
          </button>
        </div>
      </div>

      {/* Room ID */}
      <div className={`${styles.roomBadge} ${!uiVisible ? styles.hiddenFade : ''}`}>
        <p className={styles.roomIdText}>ID: {roomId}</p>
      </div>

      {/* Search Overlay Logic - Pure CSS Modules */}
      {(searching || autoSearchCountdown !== null) && (
        <div 
          className={styles.searchOverlay}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.searchModal}>
            {autoSearchCountdown !== null ? (
              <>
                <div className={styles.countdownNumber}>{autoSearchCountdown}</div>
                <p className={styles.countdownLabel}>Next match in...</p>
                <button 
                  onClick={onCancelAutoSearch}
                  className={styles.cancelButton}
                  aria-label="Cancel auto search"
                >
                  <X size={16} /> Cancel
                </button>
              </>
            ) : (
              <>
                <div className={styles.loader} />
                <p className={styles.searchLabel}>Looking for someone...</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
