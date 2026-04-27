
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Loader, 
  Layers, Shield, Activity
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro - Call Screen Component
 * Refined peer-to-peer video interface with CSS Module support.
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
  onCancelAutoSearch = () => {},
  onFindRandomPeer = () => {},
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const mouseMoveTimerRef = useRef(null);

  const isRemoteConnected = !!partner && (partnerMedia?.video !== false);

  // Auto-hide UI interaction logic
  useEffect(() => {
    const handleInteraction = () => {
      setUiVisible(true);
      clearTimeout(mouseMoveTimerRef.current);
      mouseMoveTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    };
    window.addEventListener('mousemove', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    return () => {
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  const handleNextClick = () => {
    if (isConnecting) return;
    setIsConnecting(true);
    onFindRandomPeer?.();
    setTimeout(() => {
      setIsConnecting(false);
      onSkip?.();
    }, 2000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.noiseLayer} />

      {/* REMOTE VIEW */}
      <div className={styles.remoteView}>
        <video
          ref={remoteVideoRef}
          className={`${styles.videoBase} ${searching ? styles.searchingBlur : ''}`}
          autoPlay playsInline
          style={{ display: isRemoteConnected ? 'block' : 'none' }}
        />
        
        {!isRemoteConnected && !searching && (
          <div className={styles.placeholder}>
            <div className={styles.brandText}>Orey!</div>
            <div className="flex gap-2 mt-4 opacity-20">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      {/* LOCAL VIEW */}
      <div className={styles.localView}>
        <video
          ref={localVideoRef}
          className={`${styles.videoBase} ${isBlurred ? styles.localBlurred : styles.mirrored}`}
          autoPlay playsInline muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />
        
        {!videoEnabled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#08080c]">
            <div className="w-20 h-20 rounded-full bg-white/[0.02] flex items-center justify-center border border-white/[0.05]">
              <VideoOff size={32} className="text-white/10" />
            </div>
            <span className="text-[10px] font-bold tracking-widest text-white/20 uppercase mt-4">Camera Suspended</span>
          </div>
        )}

        {!audioEnabled && (
          <div className="absolute top-4 right-4 p-2 bg-red-500/20 backdrop-blur-md rounded-full border border-red-500/20">
            <MicOff size={14} className="text-red-500" />
          </div>
        )}
      </div>

      {/* CONTROL INTERFACE */}
      <div className={`${styles.controlWrapper} ${!uiVisible ? styles.uiHidden : ''}`}>
        
        <div className={styles.statusPill}>
          <div className={`w-1.5 h-1.5 rounded-full ${isRemoteConnected ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-orange-500 animate-pulse'}`} />
          <span className={styles.statusText}>
            {isRemoteConnected ? `Live Hub • ${roomId}` : 'Searching Mesh...'}
          </span>
          <div className="w-[1px] h-3 bg-white/10 mx-1" />
          <Activity size={12} className="text-white/20" />
        </div>

        <div className={styles.mainIsland}>
          {/* Media Controls */}
          <div className="flex items-center gap-1 pl-1">
            <button 
              onClick={onToggleVideo}
              className={`${styles.controlBtn} ${!videoEnabled ? styles.btnDanger : 'hover:bg-white/5'}`}
            >
              {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button 
              onClick={onToggleAudio}
              className={`${styles.controlBtn} ${!audioEnabled ? styles.btnDanger : 'hover:bg-white/5'}`}
            >
              {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
          </div>

          {/* Next Button */}
          <button
            onClick={handleNextClick}
            disabled={isConnecting}
            className={styles.nextBtn}
          >
            {isConnecting ? (
              <Loader size={18} className="animate-spin opacity-50" />
            ) : (
              <Zap size={18} className="fill-current" />
            )}
            <span>{isConnecting ? 'Wait' : 'Next'}</span>
          </button>

          {/* Utility Controls */}
          <div className="flex items-center gap-1 pr-1">
            <button 
              onClick={() => setIsBlurred(!isBlurred)}
              className={`${styles.controlBtn} ${isBlurred ? styles.btnActive : 'hover:bg-white/5 opacity-60'}`}
            >
              <Layers size={19} strokeWidth={2.5} />
            </button>
            <button 
              onClick={onLeave}
              className={`${styles.controlBtn} ${styles.btnDanger} hover:bg-red-600 hover:text-white`}
            >
              <PhoneOff size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay}>
          {autoSearchCountdown !== null ? (
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-700">
              <div className={styles.countdownText}>{autoSearchCountdown}</div>
              <div className="flex items-center gap-3 px-6 py-2 rounded-2xl bg-white/5 border border-white/10 mb-8">
                <Shield size={16} className="text-pink-500" />
                <span className="text-[10px] font-black tracking-[0.3em] uppercase opacity-50">Encryption Linked</span>
              </div>
              <button onClick={onCancelAutoSearch} className="px-12 py-4 rounded-3xl border border-white/10 text-[10px] font-black tracking-widest text-white/30 uppercase hover:bg-white/5 hover:text-white transition-all">
                Terminate Session
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-white/5" />
                <div className="absolute inset-0 w-20 h-20 rounded-full border-t-4 border-pink-500 animate-spin" />
              </div>
              <div className="text-[10px] font-black tracking-[1em] text-white/10 uppercase">Synchronizing</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallScreen;

