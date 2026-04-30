
import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  SkipForward
} from 'lucide-react';
import styles from './CallScreen.module.css';

const CallScreen = () => {
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [searching, setSearching] = useState(true);
  
  const [statusMessages, setStatusMessages] = useState({
    audio: false,
    video: false,
    blur: false
  });

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const hideTimerRef = useRef(null);
  const messageTimers = useRef({ audio: null, video: null, blur: null });

  const triggerStatusMessage = (type, isActive) => {
    if (!isActive) {
      setStatusMessages(prev => ({ ...prev, [type]: true }));
      if (messageTimers.current[type]) clearTimeout(messageTimers.current[type]);
      messageTimers.current[type] = setTimeout(() => {
        setStatusMessages(prev => ({ ...prev, [type]: false }));
      }, 5000);
    } else {
      setStatusMessages(prev => ({ ...prev, [type]: false }));
    }
  };

  useEffect(() => {
    const resetTimer = () => {
      setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
    };
    const events = ['mousemove', 'touchstart', 'keydown', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => events.forEach(e => window.removeEventListener(e, resetTimer));
  }, []);

  const handleSkip = useCallback(async () => {
    if (isSkipping) return;
    setIsSkipping(true);
    setSearching(true);
    
    await cardControls.start({ 
      x: 1000, 
      opacity: 0, 
      transition: { duration: 0.4, ease: "easeInOut" } 
    });

    // Simulate connection from backend
    setTimeout(() => {
      setSearching(false);
      setIsSkipping(false);
      x.set(0);
      cardControls.set({ x: 0, opacity: 1, scale: 1.1 });
      cardControls.start({ scale: 1, transition: { type: "spring", stiffness: 100, damping: 20 } });
    }, 2000);
  }, [isSkipping]);

  useEffect(() => {
    const timer = setTimeout(() => setSearching(false), 3000);
    return () => clearTimeout(timer);
  }, []);

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
    <div className={styles.container}>
      <div className={styles.partnerViewport}>
        <div className={styles.branding}>
          <Zap size={16} color="#6366f1" fill="#6366f1" />
          <span className={styles.brandingText}>Orey!</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            style={{ x, rotate, opacity }}
            animate={cardControls}
            onDragEnd={handleDragEnd}
            className={styles.videoWrapper}
          >
            {searching ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-20">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <div className="w-20 h-20 border-t-2 border-indigo-500 rounded-full animate-spin" />
                  <Heart className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={24} />
                </motion.div>
                <p className="mt-8 text-indigo-400/80 text-[10px] font-black uppercase tracking-[0.8em] animate-pulse">Searching</p>
              </div>
            ) : (
              <>
                <video ref={remoteVideoRef} className={styles.remoteVideo} autoPlay playsInline />
                <div className={styles.overlay}>
                  <AnimatePresence>
                    {statusMessages.audio && <StatusPill text="You Muted" icon={MicOff} color="rose" />}
                    {statusMessages.video && <StatusPill text="Camera Off" icon={VideoOff} color="rose" />}
                    {statusMessages.blur && <StatusPill text="Privacy Mode" icon={ShieldAlert} color="indigo" />}
                  </AnimatePresence>
                </div>
                <div className={styles.vignette} />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className={styles.userViewport}>
        <video 
          ref={localVideoRef} 
          className={`${styles.localVideo} ${!videoEnabled ? styles.videoDisabled : styles.videoEnabled} ${isBlurred ? styles.blurActive : ''}`} 
          autoPlay muted playsInline 
        />
        
        {isBlurred && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-950/20 backdrop-blur-sm">
            <EyeOff size={40} className="text-indigo-400/30" />
          </div>
        )}

        <AnimatePresence>
          {searching && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.1 }} exit={{ opacity: 0 }} className="relative flex flex-col items-center">
              <h1 className="text-[10rem] leading-none font-black italic tracking-tighter">O!</h1>
              <span className="text-[10px] uppercase tracking-[1.5em] -mt-4">Orey! Pro</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {uiVisible && (
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} className={styles.controlDockWrapper}>
              <div className={styles.controlDock}>
                <div className={styles.hardwareGroup}>
                  <FlexButton onClick={() => { setAudioEnabled(!audioEnabled); triggerStatusMessage('audio', !audioEnabled); }} Icon={audioEnabled ? Mic : MicOff} isActive={audioEnabled} isDanger={!audioEnabled} />
                  <FlexButton onClick={() => { setVideoEnabled(!videoEnabled); triggerStatusMessage('video', !videoEnabled); }} Icon={videoEnabled ? Video : VideoOff} isActive={videoEnabled} isDanger={!videoEnabled} />
                </div>

                <button onClick={handleSkip} disabled={isSkipping} className={styles.nextButton}>
                  {isSkipping ? <Loader className="animate-spin" size={16} /> : <SkipForward size={16} />}
                  <span className="hidden sm:inline">Next Match</span>
                  <span className="sm:hidden">Next</span>
                </button>

                <div className={styles.featureGroup}>
                  <FlexButton onClick={() => { setIsBlurred(!isBlurred); triggerStatusMessage('blur', isBlurred); }} Icon={isBlurred ? EyeOff : Eye} isActive={!isBlurred} isAccent={isBlurred} />
                  <button className={`${styles.flexBtn} ${styles.btnPhone}`}><PhoneOff size={18} /></button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const StatusPill = ({ text, icon: Icon, color }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
    className={`flex items-center gap-3 px-6 py-3 rounded-2xl backdrop-blur-2xl border border-white/5 shadow-2xl ${color === 'rose' ? 'bg-rose-500/10 text-rose-400' : 'bg-indigo-500/10 text-indigo-400'}`}
  >
    <Icon size={16} />
    <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{text}</span>
  </motion.div>
);

const FlexButton = ({ onClick, Icon, isActive, isDanger, isAccent }) => (
  <button 
    onClick={(e) => { e.stopPropagation(); onClick(); }} 
    className={`${styles.flexBtn} ${isDanger ? styles.btnDanger : isAccent ? styles.btnAccent : styles.btnHardwareActive}`}
  >
    <Icon size={18} />
  </button>
);

export default CallScreen;

