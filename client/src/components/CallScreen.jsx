
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

  return (
    <div className={styles.root} onClick={toggleUI}>
      
      {/* Remote View (Top) */}
      <div className={`${styles.videoContainer} ${styles.remoteView}`}>
        <video
          ref={remoteVideoRef}
          className={styles.videoElement}
          autoPlay
          playsInline
          style={{ display: partner && partnerMedia.video ? 'block' : 'none' }}
        />
        
        {(!partner || !partnerMedia.video) && (
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
          {partnerMedia?.audio ? <Mic size={18} /> : <MicOff size={18} color="#ef4444" />}
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
          >
            {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          
          <button 
            className={`${styles.btn} ${audioEnabled ? styles.btnDefault : styles.btnOff}`}
            onClick={onToggleAudio}
          >
            {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          <button className={styles.btnEnd} onClick={onLeave}>
            <PhoneOff size={24} strokeWidth={2.5} style={{ transform: 'rotate(135deg)' }} />
          </button>

          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={onSkip}>
            <SkipForward size={20} />
          </button>

          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={onShareId}>
            <UserPlus size={20} />
          </button>
        </div>
      </div>

      {/* Room ID */}
      <div className={`${styles.roomBadge} ${!uiVisible ? styles.hiddenFade : ''}`}>
        <p className={styles.roomIdText}>ID: {roomId}</p>
      </div>

      {/* Search Overlay Logic */}
      {(searching || autoSearchCountdown !== null) && (
        <div 
          className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md" 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4 text-black text-center max-w-[80%]">
            {autoSearchCountdown !== null ? (
              <>
                <div className="text-7xl font-black">{autoSearchCountdown}</div>
                <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">Next match in...</p>
                <button 
                  onClick={onCancelAutoSearch}
                  className="mt-2 w-full py-3 bg-gray-100 rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  <X size={16} /> Cancel
                </button>
              </>
            ) : (
              <>
                <div className="w-10 h-10 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
                <p className="font-bold uppercase text-[10px] tracking-widest">Looking for someone...</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

