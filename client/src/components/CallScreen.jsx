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
  PhoneOff, Loader, Sparkles,
  Eye, EyeOff, SkipForward,
  Heart, Shield, Zap, VolumeX
} from 'lucide-react';
import styles from './CallScreen.module.css';

const CallScreen = ({
  partner = null,
  localVideoRef,
  remoteVideoRef,
  audioEnabled = true,
  videoEnabled = true,
  partnerMedia = { video: true, audio: true },
  localStream = null,
  partnerStream = null,
  searching = false,
  autoSearchCountdown = null,
  onToggleAudio = () => {},
  onToggleVideo = () => {},
  onSkip = () => {},
  onLeave = () => {},
  onCancelAutoSearch = () => {},
  onFindRandomPeer = () => {},
  onBlurToggle = () => {},
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [showBlurConfirm, setShowBlurConfirm] = useState(false);
  const hideTimerRef = useRef(null);
  const skipTimerRef = useRef(null);
  const localStreamRef = useRef(localStream);
  const partnerStreamRef = useRef(partnerStream);
  
  // Status messages for partner feedback (5s duration)
  const [statusMessages, setStatusMessages] = useState({
    audio: false,
    video: false,
    blur: false
  });
  const messageTimers = useRef({ audio: null, video: null, blur: null });

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
    if (remoteVideoRef.current && partnerStream) {
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
    if (localVideoRef.current && localStream) {
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
      // Clear message timers
      Object.values(messageTimers.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  // Status message timeout logic
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

  // Auto-hide UI controls
  useEffect(() => {
    const resetTimer = () => {
      setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
    };
    
    const events = ['mousemove', 'touchstart', 'keydown', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();
    
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.target.matches('input, textarea, [contenteditable]')) return;
      
      switch(e.key) {
        case 'm':
          e.preventDefault();
          handleToggleAudio();
          break;
        case 'v':
          e.preventDefault();
          handleToggleVideo();
          break;
        case 'n':
          e.preventDefault();
          handleSkip();
          break;
        case 'b':
          e.preventDefault();
          handleBlurClick();
          break;
        case 'Escape':
          if (showBlurConfirm) setShowBlurConfirm(false);
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [audioEnabled, videoEnabled, isBlurred, showBlurConfirm]);

  // --- MOTION VALUES ---
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-10, 10]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);
  const cardControls = useAnimation();

  const handleToggleAudio = useCallback(() => {
    const newState = !audioEnabled;
    onToggleAudio();
    triggerStatusMessage('audio', newState);
  }, [audioEnabled, onToggleAudio]);

  const handleToggleVideo = useCallback(() => {
    const newState = !videoEnabled;
    onToggleVideo();
    triggerStatusMessage('video', newState);
  }, [videoEnabled, onToggleVideo]);

  const handleSkip = useCallback(() => {
    if (isSkipping) return;
    setIsSkipping(true);
    onFindRandomPeer?.();
    
    if (skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
    }
    
    skipTimerRef.current = setTimeout(() => {
      setIsSkipping(false);
      onSkip?.();
    }, 2000);
  }, [isSkipping, onFindRandomPeer, onSkip]);

  const handleBlurClick = useCallback(() => {
    setShowBlurConfirm(true);
  }, []);

  const handleConfirmBlur = useCallback(async () => {
    const newBlurState = !isBlurred;
    setIsBlurred(newBlurState);
    setShowBlurConfirm(false);
    triggerStatusMessage('blur', !newBlurState);
    
    if (onBlurToggle) {
      await onBlurToggle(newBlurState);
    }
  }, [isBlurred, onBlurToggle]);

  const handleCancelBlur = useCallback(() => {
    setShowBlurConfirm(false);
  }, []);

  const handleDragEnd = (event, info) => {
    if (Math.abs(info.offset.x) > 120) {
      handleSkip();
    } else {
      cardControls.start({ x: 0, opacity: 1, rotate: 0 });
    }
  };

  return (
    <div className={styles.container}>
      
      {/* TOP: PARTNER VIEWPORT */}
      <div className={styles.remoteView}>
        
        {/* BRANDING: TOP LEFT */}
        <div className={styles.branding}>
          <Zap size={16} className={styles.brandIcon} />
          <span className={styles.brandText}>Orey!</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            style={{ x, rotate, opacity }}
            animate={cardControls}
            onDragEnd={handleDragEnd}
            className={styles.dragContainer}
          >
            {searching || autoSearchCountdown !== null ? (
              <div className={styles.searchingOverlay}>
                {autoSearchCountdown !== null ? (
                  <div className={styles.countdownContent}>
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={styles.countdownNumber}
                    >
                      {autoSearchCountdown}
                    </motion.div>
                    <div className={styles.secureBadge}>
                      <Shield size={16} className={styles.shieldIcon} />
                      <span>Secure connection ready</span>
                    </div>
                    <button onClick={onCancelAutoSearch} className={styles.cancelBtn}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className={styles.searchingContent}>
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={styles.searchingAnimation}
                    >
                      <div className={styles.spinnerRing} />
                      <Heart className={styles.spinnerHeart} size={24} />
                    </motion.div>
                    <p className={styles.searchingLabel}>Searching</p>
                    <p className={styles.searchingSublabel}>
                      Someone great is just around the corner…
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Remote Video Stream */}
                <video
                  ref={remoteVideoRef}
                  className={styles.video}
                  autoPlay
                  playsInline
                  style={{ display: isRemoteConnected && !isPartnerVideoOff ? 'block' : 'none' }}
                  aria-label="Remote video stream"
                />

                {/* Partner camera off */}
                {isRemoteConnected && isPartnerVideoOff && (
                  <div className={styles.partnerCameraOff}>
                    <div className={styles.cameraOffIcon}>
                      <VideoOff size={48} />
                    </div>
                    <h2 className={styles.cameraOffTitle}>Camera Off</h2>
                    <p className={styles.cameraOffText}>Your match turned their camera off</p>
                    <div className={styles.cameraOffStatus}>
                      <div className={styles.pulseDot} />
                      <span>Audio still connected</span>
                    </div>
                  </div>
                )}

                {/* Partner muted chip */}
                {isRemoteConnected && isPartnerMuted && (
                  <div className={styles.statusChipLeft}>
                    <VolumeX size={13} />
                    <span>Their mic is off</span>
                  </div>
                )}

                {/* STATUS MESSAGE OVERLAY FOR SELF ACTIONS */}
                <div className={styles.statusOverlay}>
                  <AnimatePresence>
                    {statusMessages.audio && (
                      <StatusPill text="You Muted" icon={MicOff} color="rose" />
                    )}
                    {statusMessages.video && (
                      <StatusPill text="Camera Off" icon={VideoOff} color="rose" />
                    )}
                    {statusMessages.blur && (
                      <StatusPill text="Privacy Mode" icon={Shield} color="indigo" />
                    )}
                  </AnimatePresence>
                </div>

                {/* Gradient overlay */}
                <div className={styles.gradientOverlay} />
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Waiting state - no partner connected */}
        {!isRemoteConnected && !searching && autoSearchCountdown === null && (
          <div className={styles.waitingState}>
            <div className={styles.waitingContent}>
              <Sparkles size={16} className={styles.waitingIcon} />
              <p className={styles.waitingText}>Ready to meet someone new?</p>
              <div className={styles.loadingDots}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM: LOCAL VIEWPORT */}
      <div className={styles.localView}>
        <div className={styles.localVideoContainer}>
          {/* Local Video Stream */}
          <video
            ref={localVideoRef}
            className={`${styles.localVideo} ${!videoEnabled ? styles.localVideoHidden : styles.localVideoVisible} ${isBlurred ? styles.localVideoBlurred : ''}`}
            autoPlay
            muted
            playsInline
            aria-label="Local video stream"
          />
          
          {/* Blur Mode UI Feedback */}
          <AnimatePresence>
            {isBlurred && videoEnabled && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={styles.blurOverlay}
              >
                <EyeOff size={40} className={styles.blurIcon} />
                <span className={styles.blurText}>Privacy Mode</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* You muted chip */}
          {!audioEnabled && (
            <div className={styles.statusChipRight}>
              <MicOff size={13} />
              <span>Your mic is off</span>
            </div>
          )}
        </div>

        {/* DEFAULT BRANDING (Visible until connection) */}
        <AnimatePresence>
          {!isRemoteConnected && !searching && autoSearchCountdown === null && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 0.08, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className={styles.placeholderBranding}
            >
              <h1 className={styles.placeholderLogo}>O!</h1>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- CONTROL BAR --- */}
        <AnimatePresence>
          {uiVisible && (
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className={styles.controlBarContainer}
            >
              <div className={styles.controlBar}>
                
                {/* Left Hardware Controls */}
                <div className={styles.controlGroup}>
                  <FlexButton 
                    onClick={handleToggleAudio}
                    Icon={audioEnabled ? Mic : MicOff} 
                    isActive={audioEnabled}
                    isDanger={!audioEnabled}
                  />
                  <FlexButton 
                    onClick={handleToggleVideo}
                    Icon={videoEnabled ? Video : VideoOff} 
                    isActive={videoEnabled}
                    isDanger={!videoEnabled}
                  />
                </div>

                {/* Center Match Action */}
                <button
                  onClick={handleSkip}
                  disabled={isSkipping}
                  className={styles.nextButton}
                >
                  {isSkipping ? (
                    <Loader className={styles.spinner} size={16} />
                  ) : (
                    <SkipForward size={16} />
                  )}
                  <span className={styles.nextButtonLabel}>Next</span>
                </button>

                {/* Right Feature Controls */}
                <div className={styles.controlGroup}>
                  <FlexButton 
                    onClick={handleBlurClick}
                    Icon={isBlurred ? EyeOff : Eye} 
                    isActive={!isBlurred}
                    isAccent={isBlurred}
                  />
                  <button 
                    onClick={onLeave}
                    className={styles.endButton}
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

      {/* BLUR CONFIRMATION MODAL */}
      <AnimatePresence>
        {showBlurConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.modalOverlay}
            onClick={e => e.stopPropagation()}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={styles.modal}
            >
              <div className={styles.modalIcon}>
                {isBlurred ? <Eye size={32} /> : <EyeOff size={32} />}
              </div>
              <h2 className={styles.modalTitle}>
                {isBlurred ? 'Remove Blur?' : 'Blur Video?'}
              </h2>
              <p className={styles.modalText}>
                {isBlurred 
                  ? 'Your video will become clear and visible to the other person.'
                  : 'Your video will be blurred for privacy. You can undo this anytime.'}
              </p>
              <div className={styles.modalActions}>
                <button onClick={handleCancelBlur} className={styles.modalCancelBtn}>
                  Cancel
                </button>
                <button onClick={handleConfirmBlur} className={styles.modalConfirmBtn}>
                  {isBlurred ? 'Show Video' : 'Blur Video'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Status Pill Component
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

// Flex Button Component
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

export default CallScreen;
