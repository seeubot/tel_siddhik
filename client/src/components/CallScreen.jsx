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
const INITIAL_SEARCH_DURATION = 3000;
const SKIP_ANIMATION_DURATION = 2000;
const DRAG_THRESHOLD = 120;

const CallScreen = () => {
  // State
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

  // Debug: Log render
  useEffect(() => {
    console.log('CallScreen mounted');
    return () => console.log('CallScreen unmounted');
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

  // Toggle functions
  const toggleAudio = useCallback(() => {
    setAudioEnabled(prev => {
      const newState = !prev;
      triggerStatusMessage('audio', !newState);
      return newState;
    });
  }, [triggerStatusMessage]);

  const toggleVideo = useCallback(() => {
    setVideoEnabled(prev => {
      const newState = !prev;
      triggerStatusMessage('video', !newState);
      return newState;
    });
  }, [triggerStatusMessage]);

  const toggleBlur = useCallback(() => {
    setIsBlurred(prev => {
      const newState = !prev;
      triggerStatusMessage('blur', newState);
      return newState;
    });
  }, [triggerStatusMessage]);

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
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      Object.values(messageTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  // Initial search simulation
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearching(false);
      console.log('Initial search complete');
    }, INITIAL_SEARCH_DURATION);
    return () => clearTimeout(timer);
  }, []);

  // Motion values
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-10, 10]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);
  const cardControls = useAnimation();

  // Skip handler
  const handleSkip = useCallback(async () => {
    if (isSkipping) return;
    
    setIsSkipping(true);
    setSearching(true);
    
    try {
      await cardControls.start({ 
        x: 1000, 
        opacity: 0, 
        transition: { duration: 0.4, ease: "easeInOut" } 
      });
    } catch (error) {
      console.error('Animation error:', error);
    }

    setTimeout(() => {
      setSearching(false);
      setIsSkipping(false);
      setConnectionQuality(Math.random() > 0.7 ? 'poor' : 'excellent');
      
      x.set(0);
      cardControls.set({ x: 0, opacity: 1, scale: 1.1 });
      cardControls.start({ 
        scale: 1, 
        transition: { type: "spring", stiffness: 100, damping: 20 } 
      });
    }, SKIP_ANIMATION_DURATION);
  }, [isSkipping, cardControls, x]);

  // Drag handler
  const handleDragEnd = useCallback((event, info) => {
    if (Math.abs(info.offset.x) > DRAG_THRESHOLD) {
      handleSkip();
    } else {
      cardControls.start({ x: 0, opacity: 1, rotate: 0 });
    }
  }, [handleSkip, cardControls]);

  // Memoized status pills config
  const statusPillsConfig = useMemo(() => [
    { key: 'audio', show: statusMessages.audio, text: "You Muted", icon: MicOff, color: "rose" },
    { key: 'video', show: statusMessages.video, text: "Camera Off", icon: VideoOff, color: "rose" },
    { key: 'blur', show: statusMessages.blur, text: "Privacy Mode", icon: ShieldAlert, color: "indigo" }
  ], [statusMessages]);

  // Render loading/searching screen
  const renderSearchingScreen = () => (
    <div className={styles.loadingContainer}>
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
        className="mt-8 text-indigo-400/80 text-xs font-black uppercase tracking-[0.8em] animate-pulse"
      >
        Searching
      </motion.p>
    </div>
  );

  // Render partner video or loading
  const renderPartnerContent = () => (
    <>
      {searching ? renderSearchingScreen() : (
        <>
          <video 
            ref={remoteVideoRef} 
            className={styles.remoteVideo} 
            autoPlay 
            playsInline 
            muted={false}
            poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%2318181b'/%3E%3Ctext x='400' y='300' font-family='sans-serif' font-size='24' fill='%23a1a1aa' text-anchor='middle' dominant-baseline='middle'%3EPartner Video%3C/text%3E%3C/svg%3E"
          />
          
          {/* Status Pills */}
          <div className={styles.overlay}>
            <AnimatePresence>
              {statusPillsConfig.map(pill => 
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
          
          {/* Connection Quality */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={styles.connectionIndicator}
          >
            {connectionQuality === 'excellent' ? (
              <>
                <Wifi size={14} className="text-green-400" />
                <span className="text-green-400">Excellent</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-amber-400" />
                <span className="text-amber-400">Poor</span>
              </>
            )}
          </motion.div>
          
          <div className={styles.vignette} />
        </>
      )}
    </>
  );

  return (
    <div className={styles.container}>
      {/* Partner Viewport */}
      <div className={styles.partnerViewport}>
        {/* Branding */}
        <div className={styles.branding}>
          <Zap size={16} color="#6366f1" fill="#6366f1" />
          <span className={styles.brandingText}>Orey!</span>
        </div>

        {/* Draggable Video Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={searching ? 'searching' : 'connected'}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            style={{ x, rotate, opacity }}
            animate={cardControls}
            onDragEnd={handleDragEnd}
            className={styles.videoWrapper}
          >
            {renderPartnerContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* User Viewport */}
      <div className={styles.userViewport}>
        {/* Local Video */}
        <video 
          ref={localVideoRef} 
          className={`${styles.localVideo} ${!videoEnabled ? styles.videoDisabled : styles.videoEnabled} ${isBlurred ? styles.blurActive : ''}`} 
          autoPlay 
          muted 
          playsInline 
          poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%2309090b'/%3E%3Ctext x='200' y='150' font-family='sans-serif' font-size='18' fill='%2352525b' text-anchor='middle' dominant-baseline='middle'%3EYour Video%3C/text%3E%3C/svg%3E"
        />
        
        {/* Privacy Mode Overlay */}
        <AnimatePresence>
          {isBlurred && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-950/20 backdrop-blur-sm z-10"
            >
              <EyeOff size={40} className="text-indigo-400/30" />
              <span className="mt-2 text-xs text-indigo-400/40 font-medium uppercase tracking-wider">
                Privacy Mode
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Watermark (shows during searching) */}
        <AnimatePresence>
          {searching && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 0.08, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              transition={{ duration: 0.5 }}
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            >
              <h1 className="text-[10rem] leading-none font-black italic tracking-tighter select-none">
                O!
              </h1>
              <span className="text-sm uppercase tracking-[1.5em] -mt-4 select-none opacity-50">
                Orey! Pro
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Control Dock */}
        <AnimatePresence>
          {uiVisible && (
            <motion.div 
              initial={{ y: 80, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }} 
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={styles.controlDockWrapper}
            >
              <div className={styles.controlDock}>
                {/* Hardware Controls */}
                <div className={styles.hardwareGroup}>
                  <FlexButton 
                    onClick={toggleAudio} 
                    Icon={audioEnabled ? Mic : MicOff} 
                    isDanger={!audioEnabled}
                    aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
                    title={audioEnabled ? "Mute" : "Unmute"}
                  />
                  <FlexButton 
                    onClick={toggleVideo} 
                    Icon={videoEnabled ? Video : VideoOff} 
                    isDanger={!videoEnabled}
                    aria-label={videoEnabled ? "Turn off camera" : "Turn on camera"}
                    title={videoEnabled ? "Camera Off" : "Camera On"}
                  />
                </div>

                {/* Next Button */}
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
                  <span>Next</span>
                </button>

                {/* Feature Controls */}
                <div className={styles.featureGroup}>
                  <FlexButton 
                    onClick={toggleBlur} 
                    Icon={isBlurred ? EyeOff : Eye} 
                    isAccent={isBlurred}
                    aria-label={isBlurred ? "Disable privacy mode" : "Enable privacy mode"}
                    title={isBlurred ? "Privacy Off" : "Privacy Mode"}
                  />
                  <button 
                    className={`${styles.flexBtn} ${styles.btnPhone}`}
                    aria-label="End call"
                    title="End Call"
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

// Status Pill Component
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
    <span className="text-xs font-bold uppercase tracking-[0.2em]">{text}</span>
  </motion.div>
));

StatusPill.displayName = 'StatusPill';

// Flex Button Component
const FlexButton = React.memo(({ onClick, Icon, isDanger, isAccent, ...props }) => (
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

export default CallScreen;
