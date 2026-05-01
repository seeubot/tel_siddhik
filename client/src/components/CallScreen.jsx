import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { 
  motion, 
  useMotionValue, 
  useTransform, 
  useAnimation, 
  AnimatePresence 
} from 'framer-motion';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, Loader, Sparkles,
  Eye, EyeOff, SkipForward,
  Heart, ShieldAlert, Zap, VolumeX
} from 'lucide-react';

const App = ({
  partner = null,
  localVideoRef: externalLocalRef,
  remoteVideoRef: externalRemoteRef,
  audioEnabled = true,
  videoEnabled = true,
  partnerMedia = { video: true, audio: true },
  localStream = null,
  partnerStream = null,
  searching: externalSearching = false,
  autoSearchCountdown = null,
  onToggleAudio = () => {},
  onToggleVideo = () => {},
  onSkip = () => {},
  onLeave = () => {},
  onCancelAutoSearch = () => {},
  onFindRandomPeer = () => {},
  onBlurToggle = () => {},
}) => {
  // --- STATE ---
  const [audioEnabledState, setAudioEnabledState] = useState(audioEnabled);
  const [videoEnabledState, setVideoEnabledState] = useState(videoEnabled);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [searching, setSearching] = useState(externalSearching);
  
  // Status messages for partner feedback (5s duration)
  const [statusMessages, setStatusMessages] = useState({
    audio: false,
    video: false,
    blur: false
  });

  // --- REFS ---
  const localVideoRefInternal = useRef(null);
  const remoteVideoRefInternal = useRef(null);
  const localVideoRef = externalLocalRef || localVideoRefInternal;
  const remoteVideoRef = externalRemoteRef || remoteVideoRefInternal;
  const hideTimerRef = useRef(null);
  const skipTimerRef = useRef(null);
  const messageTimers = useRef({ audio: null, video: null, blur: null });
  const localStreamRef = useRef(localStream);
  const partnerStreamRef = useRef(partnerStream);

  // Sync external state
  useEffect(() => setAudioEnabledState(audioEnabled), [audioEnabled]);
  useEffect(() => setVideoEnabledState(videoEnabled), [videoEnabled]);
  useEffect(() => setSearching(externalSearching), [externalSearching]);

  // Update refs when streams change
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    partnerStreamRef.current = partnerStream;
  }, [partnerStream]);

  const isRemoteConnected = !!partner;
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  // Handle video stream sources with proper cleanup
  useEffect(() => {
    if (remoteVideoRef?.current && partnerStream) {
      const videoElement = remoteVideoRef.current;
      videoElement.srcObject = partnerStream;
      
      return () => {
        if (videoElement.srcObject === partnerStream) {
          videoElement.srcObject = null;
        }
      };
    }
  }, [partnerStream, remoteVideoRef]);

  useEffect(() => {
    if (localVideoRef?.current && localStream) {
      const videoElement = localVideoRef.current;
      videoElement.srcObject = localStream;
      
      return () => {
        if (videoElement.srcObject === localStream) {
          videoElement.srcObject = null;
        }
      };
    }
  }, [localStream, localVideoRef]);

  // Cleanup tracks on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
      }
      if (partnerStreamRef.current) {
        partnerStreamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
      }
      clearTimeout(hideTimerRef.current);
      clearTimeout(skipTimerRef.current);
      Object.values(messageTimers.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  // --- LOGIC: STATUS MESSAGE TIMEOUTS ---
  const triggerStatusMessage = useCallback((type, isActive) => {
    // We only show the message when the feature is "disabled" or "privacy on"
    if (!isActive) {
      setStatusMessages(prev => ({ ...prev, [type]: true }));
      
      if (messageTimers.current[type]) clearTimeout(messageTimers.current[type]);
      
      messageTimers.current[type] = setTimeout(() => {
        setStatusMessages(prev => ({ ...prev, [type]: false }));
      }, 5000);
    } else {
      // If toggled back to normal, hide message immediately
      setStatusMessages(prev => ({ ...prev, [type]: false }));
    }
  }, []);

  // --- UI LOGIC: AUTO HIDE CONTROLS ---
  useEffect(() => {
    const resetTimer = () => {
      setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
    };
    const events = ['mousemove', 'touchstart', 'touchmove', 'keydown', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  // --- LOGIC: SKIP/NEXT ---
  const handleSkip = useCallback(async () => {
    if (isSkipping) return;
    setIsSkipping(true);
    onFindRandomPeer?.();
    
    // Clear any existing timer
    if (skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
    }

    await cardControls.start({ 
      x: 1000, 
      opacity: 0, 
      transition: { duration: 0.4, ease: "easeInOut" } 
    });

    skipTimerRef.current = setTimeout(() => {
      setIsSkipping(false);
      onSkip?.();
      
      x.set(0);
      cardControls.set({ x: 0, opacity: 1, scale: 1.1 });
      cardControls.start({ scale: 1, transition: { type: "spring", stiffness: 100, damping: 20 } });
    }, 2000);
  }, [isSkipping, onFindRandomPeer, onSkip]);

  // --- MOTION ---
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-10, 10]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);
  const cardControls = useAnimation();

  const handleDragEnd = (event, info) => {
    if (Math.abs(info.offset.x) > 120) {
      handleSkip();
    } else {
      cardControls.start({ x: 0, opacity: 1, rotate: 0 });
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden select-none font-sans text-white">
      
      {/* TOP: PARTNER VIEWPORT */}
      <div className="relative flex-[1.4] w-full z-10 overflow-hidden bg-zinc-900">
        
        {/* BRANDING: TOP LEFT */}
        <div className="absolute top-6 left-6 z-50 flex items-center gap-2 opacity-60">
          <Zap size={16} className="text-indigo-500 fill-indigo-500" />
          <span className="text-xl font-black italic tracking-tighter">Orey!</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            style={{ x, rotate, opacity }}
            animate={cardControls}
            onDragEnd={handleDragEnd}
            className="relative w-full h-full cursor-grab active:cursor-grabbing"
          >
            {searching ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-20">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative"
                >
                  <div className="w-20 h-20 border-t-2 border-indigo-500 rounded-full animate-spin" />
                  <Heart className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={24} />
                </motion.div>
                <p className="mt-8 text-indigo-400/80 text-[10px] font-black uppercase tracking-[0.8em] animate-pulse tracking-widest">Searching</p>
              </div>
            ) : (
              <>
                {/* Remote Video Stream */}
                <video
                  ref={remoteVideoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  style={{ display: isRemoteConnected && !isPartnerVideoOff ? 'block' : 'none' }}
                  poster="https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=1000&auto=format&fit=crop"
                />

                {isRemoteConnected && isPartnerVideoOff && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-30 p-8 text-center">
                    <div className="mb-6 p-6 rounded-full bg-rose-500/5 border border-rose-500/10">
                      <VideoOff size={40} className="text-white/20" />
                    </div>
                    <h3 className="text-xl font-bold text-white/55 mb-2">Camera off</h3>
                    <p className="text-sm text-white/30 mb-4">Your match turned their camera off</p>
                    <div className="flex items-center gap-2 text-xs text-rose-400/50 px-4 py-2 bg-rose-500/5 rounded-full border border-rose-500/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                      Audio still connected
                    </div>
                  </div>
                )}

                {/* Partner muted chip */}
                {isRemoteConnected && isPartnerMuted && (
                  <div className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 bg-black/65 backdrop-blur-xl rounded-full border border-rose-500/25 text-xs font-semibold text-rose-400">
                    <VolumeX size={13} />
                    <span>Their mic is off</span>
                  </div>
                )}
                
                {/* STATUS MESSAGE OVERLAY FOR PARTNER ACTIONS (5s Timeout) */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center gap-4 z-30">
                    <AnimatePresence>
                        {statusMessages.audio && (
                            <StatusPill text="You Muted" icon={MicOff} color="rose" />
                        )}
                        {statusMessages.video && (
                            <StatusPill text="Camera Off" icon={VideoOff} color="rose" />
                        )}
                        {statusMessages.blur && (
                            <StatusPill text="Privacy Mode" icon={ShieldAlert} color="indigo" />
                        )}
                    </AnimatePresence>
                </div>

                {!isRemoteConnected && (
                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/20 pointer-events-none" />
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* BOTTOM: LOCAL VIEWPORT */}
      <div className="relative flex-1 w-full bg-zinc-950 z-10 flex flex-col items-center justify-center">
        <div className="absolute inset-0 overflow-hidden">
            {/* Local Video Stream */}
            <video
              ref={localVideoRef}
              className={`w-full h-full object-cover scale-x-[-1] transition-all duration-700 
                ${!videoEnabledState ? 'opacity-0' : 'opacity-40'} 
                ${isBlurred ? 'blur-[100px] brightness-[0.3]' : 'blur-0'}`}
              autoPlay
              muted
              playsInline
              style={{ display: videoEnabledState ? 'block' : 'none' }}
            />

            {/* You muted chip */}
            {!audioEnabledState && (
              <div className="absolute top-4 right-4 z-30 flex items-center gap-2 px-3 py-1.5 bg-black/65 backdrop-blur-xl rounded-full border border-rose-500/25 text-xs font-semibold text-rose-400">
                <MicOff size={13} />
                <span>Your mic is off</span>
              </div>
            )}
            
            {/* Blur Mode UI Feedback */}
            <AnimatePresence>
              {isBlurred && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-950/20 backdrop-blur-sm"
                  >
                     <EyeOff size={40} className="text-indigo-400/30" />
                  </motion.div>
              )}
            </AnimatePresence>

            {!videoEnabledState && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950">
                <div className="mb-4 p-4 rounded-full bg-rose-500/5 border border-rose-500/10">
                  <VideoOff size={28} className="text-white/15" />
                </div>
                <span className="text-[10px] font-bold tracking-[0.1em] text-white/20 uppercase">Camera off</span>
                <p className="text-xs text-white/10 italic mt-1">Turn on to share your vibe</p>
              </div>
            )}
        </div>

        {/* DEFAULT OREY BRANDING (Visible until connection) */}
        <AnimatePresence>
          {searching && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 0.1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="relative flex flex-col items-center pointer-events-none"
            >
               <h1 className="text-[10rem] leading-none font-black italic tracking-tighter">O!</h1>
               <span className="text-[10px] uppercase tracking-[1.5em] -mt-4">Orey! Pro</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- AUTO-FLEX RESPONSIVE CONTROL BAR --- */}
        <AnimatePresence>
          {uiVisible && (
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="absolute bottom-8 left-4 right-4 md:left-auto md:right-auto md:min-w-[500px] z-50"
            >
              <div className="flex items-center justify-between w-full p-2 bg-zinc-900/90 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.7)]">
                
                {/* Left Hardware Controls */}
                <div className="flex-1 flex items-center justify-start gap-1.5 pl-1">
                    <FlexButton 
                        onClick={() => {
                          const newState = !audioEnabledState;
                          setAudioEnabledState(newState);
                          triggerStatusMessage('audio', newState);
                          onToggleAudio?.();
                        }} 
                        Icon={audioEnabledState ? Mic : MicOff} 
                        isActive={audioEnabledState}
                        isDanger={!audioEnabledState}
                    />
                    <FlexButton 
                        onClick={() => {
                          const newState = !videoEnabledState;
                          setVideoEnabledState(newState);
                          triggerStatusMessage('video', newState);
                          onToggleVideo?.();
                        }} 
                        Icon={videoEnabledState ? Video : VideoOff} 
                        isActive={videoEnabledState}
                        isDanger={!videoEnabledState}
                    />
                </div>

                {/* Center Match Action */}
                <button
                    onClick={handleSkip}
                    disabled={isSkipping}
                    className="flex-[2.5] mx-2 h-14 bg-white text-black rounded-full flex items-center justify-center gap-2 font-black italic uppercase tracking-widest text-[10px] sm:text-xs active:scale-95 transition-all shadow-xl disabled:opacity-50"
                >
                    {isSkipping ? <Loader className="animate-spin" size={16} /> : <SkipForward size={16} />}
                    <span className="hidden sm:inline">Next Match</span>
                    <span className="sm:hidden">Next</span>
                </button>

                {/* Right Feature Controls */}
                <div className="flex-1 flex items-center justify-end gap-1.5 pr-1">
                    <FlexButton 
                        onClick={() => {
                          const newState = !isBlurred;
                          setIsBlurred(newState);
                          triggerStatusMessage('blur', !newState); // message logic is inverse for blur
                          onBlurToggle?.(newState);
                        }} 
                        Icon={isBlurred ? EyeOff : Eye} 
                        isActive={!isBlurred}
                        isAccent={isBlurred}
                    />
                    <button 
                        onClick={onLeave}
                        className="w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 active:bg-rose-600 active:text-white transition-all"
                    >
                        <PhoneOff size={18} />
                    </button>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// Internal Helper: Feedback Overlay (5s Duration)
const StatusPill = ({ text, icon: Icon, color }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`flex items-center gap-3 px-6 py-3 rounded-2xl backdrop-blur-2xl border border-white/5 shadow-2xl
            ${color === 'rose' ? 'bg-rose-500/10 text-rose-400' : 'bg-indigo-500/10 text-indigo-400'}`}
    >
        <Icon size={16} />
        <span className="text-[10px] font-black uppercase tracking-[0.2em]">{text}</span>
    </motion.div>
);

// Internal Helper: Fully Responsive Button
const FlexButton = ({ onClick, Icon, isActive, isDanger, isAccent }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`
      min-w-[40px] h-10 sm:min-w-[48px] sm:h-12 flex items-center justify-center rounded-full transition-all duration-300 border
      ${isDanger 
        ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/20' 
        : isAccent 
        ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/20' 
        : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white'}
    `}
  >
    <Icon size={18} />
  </button>
);

export default App;
