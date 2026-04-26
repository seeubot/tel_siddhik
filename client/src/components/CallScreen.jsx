
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  UserPlus, Zap,
  Share2, MoreHorizontal, VolumeX
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * OREY! PRO - Refined Call Screen
 * Clean logic split from styles.
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
    clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 8000);
  }, []);

  useEffect(() => {
    if (uiVisible) resetUiTimer();
    return () => clearTimeout(uiTimerRef.current);
  }, [uiVisible, resetUiTimer, searching]);

  const handleToggleUI = (e) => {
    if (e.target.closest(`.${styles.dock}`)) return;
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

  return (
    <div className={styles.container} onClick={handleToggleUI}>
      <div className={styles.grainOverlay} />

      {/* STRANGER PANEL */}
      <div className={`${styles.panel} ${styles.strangerPanel} ${searching ? styles.searchingPanel : ''}`}>
        {partner ? (
          <video ref={remoteVideoRef} className={styles.video} autoPlay playsInline />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center opacity-10 px-4 text-center">
            <div className="text-[14vw] md:text-[10vw] font-black italic tracking-tighter mix-blend-difference uppercase">OREY!</div>
            <div className="text-[8px] md:text-[10px] tracking-[0.6em] font-bold uppercase mt-[-10px]">{searching ? 'SCANNING' : 'ESTABLISHING'}</div>
          </div>
        )}
        
        <div className={`absolute top-6 left-6 z-20 transition-all duration-700 ${uiVisible ? 'translate-y-0 opacity-100' : '-translate-y-12 opacity-0'}`}>
          <div className={styles.badge}>
            <div className={`w-1.5 h-1.5 rounded-full ${partner ? 'bg-rose-500 animate-pulse' : 'bg-zinc-700'}`} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90 truncate max-w-[120px]">
              {partner ? partner.id : 'Awaiting Peer'}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      {/* YOU PANEL */}
      <div className={`${styles.panel} ${styles.youPanel}`}>
        {videoEnabled ? (
          <video ref={localVideoRef} className={`${styles.video} ${styles.mirror}`} autoPlay playsInline muted />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/40">
            <VideoOff size={48} className="text-white/5" strokeWidth={1} />
          </div>
        )}
        
        <div className={`absolute bottom-6 md:top-6 left-6 z-20 transition-all duration-700 ${uiVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>
          <div className={styles.badge}>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90">You</span>
            </div>
            {!audioEnabled && (
              <>
                <div className="w-[1px] h-3 bg-white/10 mx-1" />
                <VolumeX size={12} className="text-rose-500" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* --- CONTROL INTERFACE --- */}
      <div className={`${styles.dockWrapper} ${uiVisible ? '' : 'translate-y-24 opacity-0'}`}>
        <div className={styles.dock}>
          {/* Utilities */}
          <div className="flex items-center pl-1">
            <button className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full hover:bg-white/5 transition-all active:scale-90 text-white/30 hover:text-white shrink-0">
              <Share2 size={18} strokeWidth={2} />
            </button>
            <button className="hidden sm:flex w-12 h-12 items-center justify-center rounded-full hover:bg-white/5 transition-all active:scale-90 text-white/30 hover:text-white shrink-0">
              <UserPlus size={18} strokeWidth={2} />
            </button>
          </div>

          <div className="w-[1px] h-8 bg-white/5 mx-1 shrink-0" />

          {/* Media Controls */}
          <div className="flex items-center gap-1.5 md:gap-2 px-1">
            <button 
              onClick={() => setVideoEnabled(!videoEnabled)}
              className={`w-11 h-11 md:w-13 md:h-13 flex items-center justify-center rounded-full transition-all active:scale-90 shrink-0 ${videoEnabled ? 'bg-white/[0.03] text-white/60 border border-white/5' : 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'}`}
            >
              {videoEnabled ? <Video size={18} md:size={20} /> : <VideoOff size={18} md:size={20} />}
            </button>
            <button 
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`w-11 h-11 md:w-13 md:h-13 flex items-center justify-center rounded-full transition-all active:scale-90 shrink-0 ${audioEnabled ? 'bg-white/[0.03] text-white/60 border border-white/5' : 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'}`}
            >
              {audioEnabled ? <Mic size={18} md:size={20} /> : <MicOff size={18} md:size={20} />}
            </button>
          </div>

          {/* SKIP ACTION */}
          <button onClick={handleSkip} className={styles.skipBtn}>
            <span className="text-black font-black text-[11px] md:text-[12px] tracking-[0.25em] uppercase truncate">Skip</span>
            <div className={styles.skipIconWrapper}>
              <Zap size={15} md:size={16} fill="currentColor" />
            </div>
          </button>
        </div>

        <div className="opacity-10 text-[8px] font-black tracking-[0.8em] uppercase pointer-events-none text-center">
          Tap Screen to Focus
        </div>
      </div>

      {/* --- OVERLAYS --- */}
      {searching && (
        <div className="absolute inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-6 text-center">
          <div className={styles.loadingLine}>
            <div className={styles.loadingBar} />
          </div>
          <div className="mt-10 text-[9px] font-black tracking-[1em] text-white/20 uppercase animate-pulse">Syncing Connection</div>
        </div>
      )}

      {countdown !== null && (
        <div className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-[100px] flex flex-col items-center justify-center">
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
