
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  UserPlus, Zap,
  Share2, VolumeX
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * OREY! PRO - High Fidelity Call Screen
 * Separated into clean JSX and CSS Module.
 */

const CallScreen = () => {
  const [partner, setPartner] = useState(null);
  const [searching, setSearching] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [uiVisible, setUiVisible] = useState(true);
  const [countdown, setCountdown] = useState(null);
  
  const uiTimerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const resetUiTimer = useCallback(() => {
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 8000);
  }, []);

  useEffect(() => {
    if (uiVisible) resetUiTimer();
    return () => clearTimeout(uiTimerRef.current);
  }, [uiVisible, resetUiTimer, searching]);

  const handleToggleUI = (e) => {
    if (e.target.closest('button')) return;
    setUiVisible(!uiVisible);
  };

  const handleSkip = () => {
    setPartner(null);
    setSearching(true);
    setCountdown(null);
    setTimeout(() => {
      setSearching(false);
      setCountdown(3);
    }, 2000);
  };

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    } else if (countdown === 0) {
      setPartner({ id: 'Stranger_' + Math.floor(Math.random() * 9000 + 1000) });
      setCountdown(null);
    }
  }, [countdown]);

  // Start discovery on mount
  useEffect(() => {
    handleSkip();
  }, []);

  return (
    <div className={styles.container} onClick={handleToggleUI}>
      <div className={styles.grainOverlay} />

      {/* PEER PANEL */}
      <div className={`${styles.panel} ${searching ? styles.searchingPanel : ''}`}>
        {partner ? (
          <video ref={remoteVideoRef} className={styles.video} autoPlay playsInline />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center opacity-10 px-4 text-center">
            <div className="text-[14vw] md:text-[10vw] font-black italic tracking-tighter uppercase mix-blend-difference">OREY!</div>
            <div className="text-[8px] md:text-[10px] tracking-[0.6em] font-bold uppercase mt-[-10px] text-white">
              {searching ? 'SCANNING' : 'ESTABLISHING'}
            </div>
          </div>
        )}
        
        <div className={`absolute top-6 left-6 z-20 transition-all duration-700 ${uiVisible ? 'translate-y-0 opacity-100' : '-translate-y-12 opacity-0'}`}>
          <div className={styles.badge}>
            <div className={partner ? styles.liveDot : 'w-1.5 h-1.5 rounded-full bg-zinc-700'} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90">
              {partner ? partner.id : 'Awaiting Peer'}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      {/* LOCAL PANEL */}
      <div className={styles.panel}>
        {videoEnabled ? (
          <video ref={localVideoRef} className={`${styles.video} ${styles.mirror}`} autoPlay playsInline muted />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <VideoOff size={48} className="text-white/5" strokeWidth={1} />
          </div>
        )}
        
        <div className={`absolute bottom-6 md:top-6 left-6 z-20 transition-all duration-700 ${uiVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>
          <div className={styles.badge}>
            <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90">You</span>
            {!audioEnabled && (
              <>
                <div className="w-[1px] h-3 bg-white/10 mx-1" />
                <VolumeX size={12} className="text-rose-500" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* --- CONTROL DOCK --- */}
      <div className={`${styles.dockWrapper} ${uiVisible ? '' : 'translate-y-24 opacity-0'}`}>
        <div className={styles.dock}>
          <div className="flex items-center px-2">
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-all text-white/30 hover:text-white shrink-0">
              <Share2 size={18} />
            </button>
          </div>

          <div className="w-[1px] h-8 bg-white/10 mx-1" />

          <div className="flex items-center gap-2 px-1">
            <button 
              onClick={() => setVideoEnabled(!videoEnabled)}
              className={`${styles.mediaBtn} ${!videoEnabled ? styles.mediaBtnActive : ''}`}
            >
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button 
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`${styles.mediaBtn} ${!audioEnabled ? styles.mediaBtnActive : ''}`}
            >
              {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
          </div>

          <button onClick={handleSkip} className={styles.skipBtn}>
            <span className="font-black text-[11px] tracking-[0.25em] uppercase">Skip</span>
            <div className={styles.skipIconWrapper}>
              <Zap size={15} fill="currentColor" />
            </div>
          </button>
        </div>
        <div className="opacity-10 text-[8px] font-black tracking-[0.8em] uppercase text-white">Tap Screen to Focus</div>
      </div>

      {/* OVERLAYS */}
      {searching && (
        <div className={`${styles.overlay} bg-black/95 backdrop-blur-3xl`}>
          <div className={styles.loadingBar} />
          <div className="mt-10 text-[9px] font-black tracking-[1em] text-white/20 uppercase animate-pulse">Syncing Connection</div>
        </div>
      )}

      {countdown !== null && (
        <div className={`${styles.overlay} bg-black/90 backdrop-blur-[100px]`}>
           <div className="text-[30vw] md:text-[15rem] font-black italic tracking-tighter leading-none animate-pulse text-white/10">
            {countdown}
          </div>
          <div className="text-rose-500 font-black tracking-[0.6em] uppercase text-[10px] md:text-xs mt-4">Establishing Secure Node</div>
        </div>
      )}
    </div>
  );
};

export default CallScreen;

