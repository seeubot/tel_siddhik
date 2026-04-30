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
  PhoneOff, Loader, Heart, 
  ShieldAlert, Zap, Eye, EyeOff, 
  SkipForward, Wifi, WifiOff
} from 'lucide-react';
import styles from './CallScreen.module.css';

// Constants
const UI_HIDE_DELAY = 5000;
const STATUS_MESSAGE_DURATION = 5000;
const SEARCH_DURATION = 3000;
const DRAG_THRESHOLD = 120;
const SKIP_ANIMATION_DURATION = 2000;

const CallScreen = () => {
  // State management
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [searching, setSearching] = useState(true);
  const [connectionQuality, setConnectionQuality] = useState('excellent');
  
  const [statusMessages, setStatusMessages] = useState({
    audio: false,
    video: false,
    blur: false
  });

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const hideTimerRef = useRef(null);
  const messageTimers = useRef({ audio: null, video: null, blur: null });
  const streamRef = useRef(null);

  // Memoized values
  const statusPills = useMemo(() => [
    { key: 'audio', show: statusMessages.audio, text: "You Muted", icon: MicOff, color: "rose" },
    { key: 'video', show: statusMessages.video, text: "Camera Off", icon: VideoOff, color: "rose" },
    { key: 'blur', show: statusMessages.blur, text: "Privacy Mode", icon: ShieldAlert, color: "indigo" }
  ], [statusMessages]);

  // Cleanup function for timers
  const clearAllTimers = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    Object.values(messageTimers.current).forEach(timer => {
      if (timer) clearTimeout(timer);
    });
  }, []);

  // Toggle functions with status messages
  const toggleAudio = useCallback(() => {
    setAudioEnabled(prev => {
      const newState = !prev;
      triggerStatusMessage('audio', !newState);
      return newState;
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setVideoEnabled(prev => {
      const newState = !prev;
      triggerStatusMessage('video', !newState);
      return newState;
    });
  }, []);

  const toggleBlur = useCallback(() => {
    setIsBlurred(prev => {
      const newState = !prev;
      triggerStatusMessage('blur', newState);
      return newState;
    });
  }, []);

  // Status message handler
  const triggerStatusMessage = useCallback((type, isActive) => {
    if (isActive) {
      setStatusMessages(prev => ({ ...prev, [type]: true }));
      if (messageTimers.current[type]) clearTimeout(messageTimers.current[type]);
      messageTimers.current[type] = setTimeout(() => {
        setStatusMessages(prev => ({ ...prev, [type]: false }));
      }, STATUS_MESSAGE_DURATION);
    } else {
      setStatusMessages(prev => ({ ...prev, [type]: false }));
    }
  }, []);

  // UI visibility timer
  useEffect(() => {
    const resetTimer = () => {
      setUiVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), UI_HIDE_DELAY);
    };
    
    const events = ['mousemove', 'touchstart', 'keydown', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Skip/match next handler
  const handleSkip = useCallback(async () => {
    if (isSkipping) return;
    
    setIsSkipping(true);
    setSearching(true);
    
    // Animate card out
    await cardControls.start({ 
      x: 1000, 
      opacity: 0, 
      transition: { duration: 0.4, ease: "easeInOut" } 
    });

    // Simulate backend connection
    setTimeout(() => {
      setSearching(false);
      setIsSkipping(false);
      setConnectionQuality(Math.random() > 0.7 ? 'poor' : 'excellent');
      
      // Reset card position with spring animation
      x.set(0);
      cardControls.set({ x: 0, opacity: 1, scale: 1.1 });
      cardControls.start({ 
        scale: 1, 
        transition: { type: "spring", stiffness: 100, damping: 20 } 
      });
    }, SKIP_ANIMATION_DURATION);
  }, [isSkipping, cardControls, x]);

  // Initial search simulation
  useEffect(() => {
    const timer = setTimeout(() => setSearching(false), SEARCH_DURATION);
    return () => clearTimeout(timer);
  }, []);

  // Motion values
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-10, 10]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);
  const cardControls = useAnimation();

  // Drag handlers
  const handleDragEnd = useCallback((event, info) => {
    if (Math.abs(info.offset.x) > DRAG_THRESHOLD) {
      handleSkip();
    } else {
      cardControls.start({ x: 0, opacity: 1, rotate: 0 });
    }
  }, [handleSkip, cardControls]);

  // Render loading screen
  const renderLoadingScreen = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-20">
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="relative w-20 h-20">
          <div className="w-full h-full border-t-2 border-indigo-500 rounded-full animate-spin" />
          <Heart className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={24} />
        </div>
      </motion.div>
      <motion.p 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 text-indigo-400/80 text-[10px] font-black uppercase tracking-[0.8em] animate-pulse"
      >
        Searching
      </motion.p>
    </div>
  );

  // Render connection quality indicator
  const renderConnectionIndicator = () => (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full px-3 py-1.5"
    >
      {connectionQuality === 'excellent' ? (
        <Wifi size={14} className="text-green-400" />
      ) : (
        <WifiOff size={14} className="text-amber-400" />
      )}
      <span className="text-[10px] font-medium text-white/70 uppercase tracking-wider">
        {connectionQuality}
      </span>
    </motion.div>
  );

  return (
    <div className={styles.container}>
      {/* Partner Viewport */}
      <div className={styles.partnerViewport}>
        <div className={styles.branding}>
          <Zap size={16} color="#6366f1" fill="#6366f1" />
          <span className={styles.brandingText}>Orey!</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={searching ? 'searching' : 'connected'}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            style={{ x, rotate, opacity }}
            animate={cardControls}
            onDragEnd={handleDragEnd}
            className={styles.videoWrapper}
            whileHover={{ scale: 1.02 }}
          >
            {searching ? (
              renderLoadingScreen()
            ) : (
              <>
                <video 
                  ref={remoteVideoRef} 
                  className={styles.remoteVideo} 
                  autoPlay 
                  playsInline 
                  poster="/api/placeholder/800/600"
                />
                
                {/* Status Pills Overlay */}
                <div className={styles.overlay}>
                  <AnimatePresence>
                    {statusPills.map(pill => 
                      pill.show && (
                        <StatusPill 
                          key={pill.key}
                          text={pill.text} 
                          icon={pill.icon} 
                          color={pill.color} 
                        />
                      )
                    )}
                  </AnimatePresence>
                </div>
                
                {/* Connection Quality Indicator */}
                {renderConnectionIndicator()}
                
                <div className={styles.vignette} />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* User Viewport */}
      <div className={styles.userViewport}>
        <video 
          ref={localVideoRef} 
          className={`${styles.localVideo} ${!videoEnabled ? styles.videoDisabled : styles.videoEnabled} ${isBlurred ? styles.blurActive : ''}`} 
          autoPlay 
          muted 
          playsInline 
        />
        
        {isBlurred && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-950/20 backdrop-blur-sm"
          >
            <EyeOff size={40} className="text-indigo-400/30" />
            <span className="mt-2 text-[10px] text-indigo-400/40 font-medium uppercase tracking-wider">
              Privacy Mode
            </span>
          </motion.div>
        )}

        <AnimatePresence>
          {searching && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 0.1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              transition={{ duration: 0.5 }}
              className="relative flex flex-col items-center pointer-events-none"
            >
              <h1 className="text-[10rem] leading-none font-black italic tracking-tighter select-none">
                O!
              </h1>
              <span className="text-[10px] uppercase tracking-[1.5em] -mt-4 select-none">
                Orey! 
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Control Bar */}
        <AnimatePresence>
          {uiVisible && (
            <motion.div 
              initial={{ y: 60, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }} 
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={styles.controlDockWrapper}
            >
              <div className={styles.controlDock}>
                <div className={styles.hardwareGroup}>
                  <FlexButton 
                    onClick={toggleAudio} 
                    Icon={audioEnabled ? Mic : MicOff} 
                    isActive={audioEnabled} 
                    isDanger={!audioEnabled}
                    aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
                  />
                  <FlexButton 
                    onClick={toggleVideo} 
                    Icon={videoEnabled ? Video : VideoOff} 
                    isActive={videoEnabled} 
                    isDanger={!videoEnabled}
                    aria-label={videoEnabled ? "Turn off camera" : "Turn on camera"}
                  />
                </div>

                <button 
                  onClick={handleSkip} 
                  disabled={isSkipping} 
                  className={styles.nextButton}
                  aria-label="Next match"
                >
                  {isSkipping ? (
                    <Loader className="animate-spin" size={16} />
                  ) : (
                    <SkipForward size={16} />
                  )}
                  <span className="hidden sm:inline">Next Match</span>
                  <span className="sm:hidden">Next</span>
                </button>

                <div className={styles.featureGroup}>
                  <FlexButton 
                    onClick={toggleBlur} 
                    Icon={isBlurred ? EyeOff : Eye} 
                    isActive={!isBlurred} 
                    isAccent={isBlurred}
                    aria-label={isBlurred ? "Disable privacy mode" : "Enable privacy mode"}
                  />
                  <button 
                    className={`${styles.flexBtn} ${styles.btnPhone}`}
                    aria-label="End call"
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

// Sub-components
const StatusPill = React.memo(({ text, icon: Icon, color }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10, scale: 0.95 }} 
    animate={{ opacity: 1, y: 0, scale: 1 }} 
    exit={{ opacity: 0, scale: 0.95 }}
    transition={{ duration: 0.3 }}
    className={`${styles.statusPill} flex items-center gap-3 px-6 py-3 rounded-2xl backdrop-blur-2xl border border-white/5 shadow-2xl ${
      color === 'rose' 
        ? 'bg-rose-500/10 text-rose-400' 
        : 'bg-indigo-500/10 text-indigo-400'
    }`}
  >
    <Icon size={16} strokeWidth={2} />
    <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{text}</span>
  </motion.div>
));

StatusPill.displayName = 'StatusPill';

const FlexButton = React.memo(({ onClick, Icon, isActive, isDanger, isAccent, ...props }) => (
  <button 
    onClick={(e) => { 
      e.stopPropagation(); 
      onClick(); 
    }} 
    className={`${styles.flexBtn} ${
      isDanger 
        ? styles.btnDanger 
        : isAccent 
          ? styles.btnAccent 
          : styles.btnHardwareActive
    }`}
    {...props}
  >
    <Icon size={18} strokeWidth={2} />
  </button>
));

FlexButton.displayName = 'FlexButton';

export default React.memo(CallScreen);
