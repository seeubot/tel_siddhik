import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { 
  motion, 
  useMotionValue, 
  useTransform, 
  useAnimation, 
  AnimatePresence,
  useSpring
} from 'framer-motion';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, Loader, Eye, EyeOff, 
  SkipForward, Heart, ShieldAlert, 
  Zap, VolumeX, Sparkles
} from 'lucide-react';
import './App.css';

// Status Pill Component
const StatusPill = ({ text, icon: Icon, color }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`status-pill ${color === 'rose' ? 'status-pill-rose' : 'status-pill-indigo'}`}
    >
        <Icon size={16} />
        <span className="pill-text">{text}</span>
    </motion.div>
);

// Flex Button Component
const FlexButton = ({ onClick, Icon, isActive, isDanger, isAccent }) => (
  <motion.button
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`flex-button ${isDanger ? 'flex-button-danger' : isAccent ? 'flex-button-accent' : 'flex-button-default'}`}
  >
    <Icon size={18} />
  </motion.button>
);

// Floating Particles Component
const FloatingParticles = () => {
  const particles = useMemo(() => 
    Array.from({ length: 15 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 3 + Math.random() * 4,
      size: 2 + Math.random() * 4
    })), []
  );

  return (
    <div className="particles-container">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
          }}
          animate={{
            y: [-10, -40, -10],
            x: [0, 15, 0],
            opacity: [0, 0.3, 0],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
};

// Swipe Hint Component
const SwipeHint = () => (
  <motion.div 
    className="swipe-hint"
    initial={{ opacity: 0 }}
    animate={{ opacity: [0, 0.5, 0] }}
    transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
  >
    <motion.div
      animate={{ x: [0, 15, 0] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      <SkipForward size={14} />
    </motion.div>
    <span>Swipe to skip</span>
  </motion.div>
);

const App = ({
  partner = null,
  externalLocalRef,
  externalRemoteRef,
  audioEnabled = true,
  videoEnabled = true,
  partnerMedia = { video: true, audio: true },
  localStream = null,
  partnerStream = null,
  searching: externalSearching = false,
  onToggleAudio = () => {},
  onToggleVideo = () => {},
  onSkip = () => {},
  onLeave = () => {},
  onFindRandomPeer = () => {},
  onBlurToggle = () => {},
}) => {
  // State
  const [audioEnabledState, setAudioEnabledState] = useState(audioEnabled);
  const [videoEnabledState, setVideoEnabledState] = useState(videoEnabled);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [searching, setSearching] = useState(externalSearching);
  const [isDragging, setIsDragging] = useState(false);
  
  const [statusMessages, setStatusMessages] = useState({
    audio: false, video: false, blur: false
  });

  // Refs
  const localVideoRefInternal = useRef(null);
  const remoteVideoRefInternal = useRef(null);
  const localVideoRef = externalLocalRef || localVideoRefInternal;
  const remoteVideoRef = externalRemoteRef || remoteVideoRefInternal;
  const hideTimerRef = useRef(null);
  const skipTimerRef = useRef(null);
  const messageTimers = useRef({ audio: null, video: null, blur: null });

  // Sync external state
  useEffect(() => setAudioEnabledState(audioEnabled), [audioEnabled]);
  useEffect(() => setVideoEnabledState(videoEnabled), [videoEnabled]);
  useEffect(() => setSearching(externalSearching), [externalSearching]);

  // Handle video stream sources
  useEffect(() => {
    if (remoteVideoRef?.current && partnerStream) {
      remoteVideoRef.current.srcObject = partnerStream;
    }
  }, [partnerStream, remoteVideoRef]);

  useEffect(() => {
    if (localVideoRef?.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, localVideoRef]);

  // Derived state
  const isRemoteConnected = !!partner;
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  // Status message handler
  const triggerStatusMessage = useCallback((type, isActive) => {
    if (!isActive) {
      setStatusMessages(prev => ({ ...prev, [type]: true }));
      if (messageTimers.current[type]) clearTimeout(messageTimers.current[type]);
      messageTimers.current[type] = setTimeout(() => {
        setStatusMessages(prev => ({ ...prev, [type]: false }));
      }, 5000);
    } else {
      setStatusMessages(prev => ({ ...prev, [type]: false }));
    }
  }, []);

  // Auto-hide controls
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

  // Skip handler
  const handleSkip = useCallback(async () => {
    if (isSkipping) return;
    setIsSkipping(true);
    onFindRandomPeer?.();
    
    if (skipTimerRef.current) clearTimeout(skipTimerRef.current);

    await cardControls.start({ 
      x: isDragging ? x.get() * 3 : 1000,
      y: -50,
      rotate: 15,
      opacity: 0,
      scale: 0.8,
      transition: { duration: 0.5, ease: "easeOut" } 
    });

    skipTimerRef.current = setTimeout(() => {
      setIsSkipping(false);
      onSkip?.();
      x.set(0);
      cardControls.set({ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1.1 });
      cardControls.start({ 
        scale: 1, 
        transition: { type: "spring", stiffness: 80, damping: 15 } 
      });
    }, 2000);
  }, [isSkipping, isDragging, onFindRandomPeer, onSkip]);

  // Motion values
  const x = useMotionValue(0);
  const y = useSpring(0, { stiffness: 100, damping: 30 });
  const rotate = useTransform(x, [-300, 300], [-15, 15]);
  const opacityValue = useTransform(x, [-200, -100, 0, 100, 200], [0.3, 1, 1, 1, 0.3]);
  const scaleValue = useTransform(x, [-200, 0, 200], [0.9, 1, 0.9]);
  const rotateY = useTransform(x, [-100, 100], [5, -5]);
  const cardControls = useAnimation();

  // Auto-float animation
  useEffect(() => {
    if (!isDragging && !searching && isRemoteConnected) {
      cardControls.start({
        y: [0, -15, 0],
        transition: {
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }
      });
    }
  }, [isDragging, searching, isRemoteConnected, cardControls]);

  // Drag handlers
  const handleDragStart = () => {
    setIsDragging(true);
    cardControls.stop();
  };

  const handleDragEnd = (event, info) => {
    setIsDragging(false);
    if (Math.abs(info.offset.x) > 120) {
      handleSkip();
    } else {
      cardControls.start({ 
        x: 0, 
        y: 0, 
        opacity: 1, 
        rotate: 0, 
        scale: 1,
        transition: { type: "spring", stiffness: 150, damping: 20 } 
      });
    }
  };

  return (
    <div className="app-container">
      {/* TOP: PARTNER VIEWPORT */}
      <div className="partner-viewport">
        {/* Branding */}
        <div className="branding">
          <Zap size={16} className="branding-icon" />
          <span className="branding-text">Orey!</span>
        </div>

        <FloatingParticles />

        <AnimatePresence mode="wait">
          <motion.div
            drag="x"
            dragConstraints={{ left: -50, right: 50 }}
            dragElastic={0.1}
            style={{ x, y, rotate, opacity: opacityValue, scale: scaleValue }}
            animate={cardControls}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className="card-wrapper"
          >
            {/* Card with 3D effect */}
            <motion.div 
              className="card-3d"
              style={{
                transformStyle: "preserve-3d",
                transform: `perspective(1000px) rotateY(${rotateY.get()}deg)`
              }}
            >
              <div className="card-gradient" />
              
              {searching ? (
                <div className="searching-state">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }} 
                    className="searching-animation"
                  >
                    <div className="searching-spinner" />
                    <Heart className="searching-heart" size={28} />
                  </motion.div>
                  <p className="searching-title">Searching</p>
                  <p className="searching-subtitle">Finding someone special...</p>
                </div>
              ) : (
                <>
                  <video
                    ref={remoteVideoRef}
                    className="remote-video"
                    autoPlay
                    playsInline
                    style={{ display: isRemoteConnected && !isPartnerVideoOff ? 'block' : 'none' }}
                  />

                  {isRemoteConnected && isPartnerVideoOff && (
                    <div className="camera-off-state">
                      <motion.div 
                        whileHover={{ scale: 1.05 }}
                        className="camera-off-icon-wrapper"
                      >
                        <VideoOff size={40} className="camera-off-icon" />
                      </motion.div>
                      <h3 className="camera-off-title">Camera off</h3>
                      <p className="camera-off-text">Your match turned their camera off</p>
                      <div className="camera-off-status">
                        <span className="camera-off-dot" />
                        Audio still connected
                      </div>
                    </div>
                  )}

                  {isRemoteConnected && isPartnerMuted && (
                    <motion.div 
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className="muted-chip-left"
                    >
                      <VolumeX size={13} />
                      <span>Their mic is off</span>
                    </motion.div>
                  )}

                  {!isDragging && isRemoteConnected && <SwipeHint />}
                  
                  <div className="status-messages-container">
                    <AnimatePresence>
                      {statusMessages.audio && <StatusPill text="You Muted" icon={MicOff} color="rose" />}
                      {statusMessages.video && <StatusPill text="Camera Off" icon={VideoOff} color="rose" />}
                      {statusMessages.blur && <StatusPill text="Privacy Mode" icon={ShieldAlert} color="indigo" />}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* BOTTOM: LOCAL VIEWPORT */}
      <div className="local-viewport">
        <div className="local-video-container">
          <video
            ref={localVideoRef}
            className={`local-video ${!videoEnabledState ? 'video-hidden' : 'video-visible'} ${isBlurred ? 'video-blurred' : ''}`}
            autoPlay
            muted
            playsInline
            style={{ display: videoEnabledState ? 'block' : 'none' }}
          />

          {!audioEnabledState && (
            <motion.div 
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="muted-chip-right"
            >
              <MicOff size={13} />
              <span>Your mic is off</span>
            </motion.div>
          )}
          
          <AnimatePresence>
            {isBlurred && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="blur-overlay"
              >
                <EyeOff size={40} className="blur-overlay-icon" />
              </motion.div>
            )}
          </AnimatePresence>

          {!videoEnabledState && (
            <div className="camera-off-local">
              <div className="camera-off-local-icon-wrapper">
                <VideoOff size={28} className="camera-off-local-icon" />
              </div>
              <span className="camera-off-local-text">Camera off</span>
            </div>
          )}
        </div>

        {searching && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 0.1, scale: 1 }} 
            exit={{ opacity: 0 }} 
            className="branding-watermark"
          >
            <h1 className="branding-watermark-text">O!</h1>
            <span className="branding-watermark-subtext">Orey! Pro</span>
          </motion.div>
        )}

        {/* Control Bar */}
        <AnimatePresence>
          {uiVisible && (
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="control-bar-wrapper"
            >
              <div className="control-bar">
                <div className="control-group-left">
                  <FlexButton 
                    onClick={() => {
                      const ns = !audioEnabledState;
                      setAudioEnabledState(ns);
                      triggerStatusMessage('audio', ns);
                      onToggleAudio?.();
                    }} 
                    Icon={audioEnabledState ? Mic : MicOff} 
                    isActive={audioEnabledState}
                    isDanger={!audioEnabledState}
                  />
                  <FlexButton 
                    onClick={() => {
                      const ns = !videoEnabledState;
                      setVideoEnabledState(ns);
                      triggerStatusMessage('video', ns);
                      onToggleVideo?.();
                    }} 
                    Icon={videoEnabledState ? Video : VideoOff} 
                    isActive={videoEnabledState}
                    isDanger={!videoEnabledState}
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSkip}
                  disabled={isSkipping}
                  className="skip-button"
                >
                  {isSkipping ? (
                    <Loader className="skip-button-spinner" size={16} />
                  ) : (
                    <SkipForward size={16} />
                  )}
                  <span className="skip-button-text-desktop">Next Match</span>
                  <span className="skip-button-text-mobile">Next</span>
                </motion.button>

                <div className="control-group-right">
                  <FlexButton 
                    onClick={() => {
                      const ns = !isBlurred;
                      setIsBlurred(ns);
                      triggerStatusMessage('blur', !ns);
                      onBlurToggle?.(ns);
                    }} 
                    Icon={isBlurred ? EyeOff : Eye} 
                    isActive={!isBlurred}
                    isAccent={isBlurred}
                  />
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onLeave}
                    className="end-call-button"
                  >
                    <PhoneOff size={18} />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default App;
