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
  Heart, Shield, Zap, VolumeX,
  Users, Wifi, Music
} from 'lucide-react';
import styles from './CallScreen.module.css';

// Default poster images (base64 or URLs)
const DEFAULT_POSTER = {
  waiting: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%236366f1;stop-opacity:0.2'/%3E%3Cstop offset='100%25' style='stop-color:%23a855f7;stop-opacity:0.05'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='300' fill='%2318181b'/%3E%3Crect width='400' height='300' fill='url(%23grad)'/%3E%3Ccircle cx='200' cy='150' r='40' fill='none' stroke='%236366f1' stroke-width='1' stroke-dasharray='4 4' /%3E%3Cpath d='M170 140 L230 140 M200 110 L200 170' stroke='%236366f1' stroke-width='1'/%3E%3C/svg%3E",
  connecting: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%236366f1;stop-opacity:0.3'/%3E%3Cstop offset='100%25' style='stop-color:%23a855f7;stop-opacity:0.1'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='300' fill='%2318181b'/%3E%3Crect width='400' height='300' fill='url(%23grad)'/%3E%3Ccircle cx='200' cy='150' r='30' fill='%236366f1' opacity='0.3' /%3E%3Ccircle cx='200' cy='150' r='20' fill='none' stroke='%236366f1' stroke-width='2' /%3E%3C/svg%3E",
  cameraOff: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%236366f1;stop-opacity:0.1'/%3E%3Cstop offset='100%25' style='stop-color:%23a855f7;stop-opacity:0.03'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='300' fill='%23101015'/%3E%3Crect width='400' height='300' fill='url(%23grad)'/%3E%3C/svg%3E"
};

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
  const [remotePoster, setRemotePoster] = useState(DEFAULT_POSTER.waiting);
  const hideTimerRef = useRef(null);
  const skipTimerRef = useRef(null);
  const localStreamRef = useRef(localStream);
  const partnerStreamRef = useRef(partnerStream);
  
  const [statusMessages, setStatusMessages] = useState({
    audio: false,
    video: false,
    blur: false
  });
  const messageTimers = useRef({ audio: null, video: null, blur: null });

  // Update poster based on connection state
  useEffect(() => {
    if (searching) {
      setRemotePoster(DEFAULT_POSTER.connecting);
    } else if (!partner) {
      setRemotePoster(DEFAULT_POSTER.waiting);
    } else if (partner && !partnerMedia?.video) {
      setRemotePoster(DEFAULT_POSTER.cameraOff);
    }
  }, [searching, partner, partnerMedia?.video]);

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

  // Handle video stream sources with poster
  useEffect(() => {
    if (remoteVideoRef.current) {
      const videoElement = remoteVideoRef.current;
      
      if (partnerStream && !isPartnerVideoOff) {
        videoElement.srcObject = partnerStream;
        videoElement.poster = '';
      } else {
        videoElement.srcObject = null;
        videoElement.poster = remotePoster;
      }
      
      return () => {
        if (videoElement.srcObject === partnerStream) {
          videoElement.srcObject = null;
        }
      };
    }
  }, [partnerStream, remoteVideoRef, isPartnerVideoOff, remotePoster]);

  useEffect(() => {
    if (localVideoRef.current) {
      const videoElement = localVideoRef.current;
      
      if (localStream && videoEnabled) {
        videoElement.srcObject = localStream;
        videoElement.poster = '';
      } else {
        videoElement.srcObject = null;
        videoElement.poster = DEFAULT_POSTER.waiting;
      }
      
      return () => {
        if (videoElement.srcObject === localStream) {
          videoElement.srcObject = null;
        }
      };
    }
  }, [localStream, localVideoRef, videoEnabled]);

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
          <div className={styles.brandIconWrapper}>
            <Zap size={14} className={styles.brandIcon} />
          </div>
          <span className={styles.brandText}>Orey</span>
          <div className={styles.brandBadge}>beta</div>
        </div>

        {/* Connection Quality Indicator */}
        {isRemoteConnected && (
          <div className={styles.qualityIndicator}>
            <Wifi size={12} />
            <span>Excellent</span>
          </div>
        )}

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
                      <Shield size={14} className={styles.shieldIcon} />
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
                      <div className={styles.waveRing}>
                        <div className={styles.wave} />
                        <div className={styles.wave} style={{ animationDelay: '0.2s' }} />
                        <div className={styles.wave} style={{ animationDelay: '0.4s' }} />
                      </div>
                      <Music className={styles.searchingIcon} size={28} />
                    </motion.div>
                    <p className={styles.searchingLabel}>Finding your match</p>
                    <p className={styles.searchingSublabel}>
                      Someone awesome is on the way...
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Remote Video Stream with Poster */}
                <video
                  ref={remoteVideoRef}
                  className={styles.video}
                  autoPlay
                  playsInline
                  poster={remotePoster}
                  style={{ display: isRemoteConnected && !isPartnerVideoOff ? 'block' : 'none' }}
                  aria-label="Remote video stream"
                />

                {/* Poster visible when no video */}
                {(!isRemoteConnected || isPartnerVideoOff) && (
                  <div className={styles.posterContainer}>
                    {!isRemoteConnected && !searching && (
                      <div className={styles.waitingPoster}>
                        <div className={styles.posterGlow}>
                          <Users size={48} className={styles.posterIcon} />
                        </div>
                        <h3>Ready to connect?</h3>
                        <p>Find someone to talk to</p>
                      </div>
                    )}
                    {isPartnerVideoOff && isRemoteConnected && (
                      <div className={styles.posterContainer}>
                        <div className={styles.posterGlow}>
                          <VideoOff size={48} className={styles.posterIcon} />
                        </div>
                        <h3>Camera is off</h3>
                        <p>Their camera is disabled</p>
                        {!isPartnerMuted && (
                          <div className={styles.audioOnlyBadge}>
                            <Mic size={12} />
                            <span>Audio only</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Partner muted chip */}
                {isRemoteConnected && isPartnerMuted && (
                  <div className={styles.statusChipLeft}>
                    <VolumeX size={12} />
                    <span>Mic off</span>
                  </div>
                )}

                {/* STATUS MESSAGE OVERLAY */}
                <div className={styles.statusOverlay}>
                  <AnimatePresence>
                    {statusMessages.audio && (
                      <StatusPill text="Mic Muted" icon={MicOff} color="rose" />
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
      </div>

      {/* BOTTOM: LOCAL VIEWPORT */}
      <div className={styles.localView}>
        <div className={styles.localVideoContainer}>
          {/* Local Video Stream with Poster */}
          <video
            ref={localVideoRef}
            className={`${styles.localVideo} ${!videoEnabled ? styles.localVideoHidden : styles.localVideoVisible} ${isBlurred ? styles.localVideoBlurred : ''}`}
            autoPlay
            muted
            playsInline
            poster={DEFAULT_POSTER.waiting}
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
                <EyeOff size={32} className={styles.blurIcon} />
                <span className={styles.blurText}>Privacy Mode</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* You muted chip */}
          {!audioEnabled && (
            <div className={styles.statusChipRight}>
              <MicOff size={12} />
              <span>Mic off</span>
            </div>
          )}

          {/* Self view label */}
          <div className={styles.selfViewLabel}>
            <span>You</span>
          </div>
        </div>

        {/* --- CONTROL BAR --- */}
        <AnimatePresence>
          {uiVisible && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={styles.controlBarContainer}
            >
              <div className={styles.controlBar}>
                
                {/* Left Controls */}
                <div className={styles.controlGroup}>
                  <ControlButton 
                    onClick={handleToggleAudio}
                    Icon={audioEnabled ? Mic : MicOff} 
                    isActive={audioEnabled}
                    label={audioEnabled ? "Mute" : "Unmute"}
                  />
                  <ControlButton 
                    onClick={handleToggleVideo}
                    Icon={videoEnabled ? Video : VideoOff} 
                    isActive={videoEnabled}
                    label={videoEnabled ? "Turn off camera" : "Turn on camera"}
                  />
                </div>

                {/* Center Action */}
                <button
                  onClick={handleSkip}
                  disabled={isSkipping}
                  className={styles.nextButton}
                >
                  {isSkipping ? (
                    <Loader className={styles.spinner} size={18} />
                  ) : (
                    <>
                      <SkipForward size={18} />
                      <span className={styles.nextButtonLabel}>Skip</span>
                    </>
                  )}
                </button>

                {/* Right Controls */}
                <div className={styles.controlGroup}>
                  <ControlButton 
                    onClick={handleBlurClick}
                    Icon={isBlurred ? EyeOff : Eye} 
                    isActive={!isBlurred}
                    isAccent={isBlurred}
                    label={isBlurred ? "Remove blur" : "Blur video"}
                  />
                  <button 
                    onClick={onLeave}
                    className={styles.endButton}
                    aria-label="End call"
                  >
                    <PhoneOff size={20} />
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
                {isBlurred ? <Eye size={28} /> : <EyeOff size={28} />}
              </div>
              <h2 className={styles.modalTitle}>
                {isBlurred ? 'Show your face?' : 'Hide your face?'}
              </h2>
              <p className={styles.modalText}>
                {isBlurred 
                  ? 'Your video will become visible to your match. They will be able to see you clearly.'
                  : 'Your video will be blurred for privacy. Your match will see a blurred version of you.'}
              </p>
              <div className={styles.modalActions}>
                <button onClick={handleCancelBlur} className={styles.modalCancelBtn}>
                  Cancel
                </button>
                <button onClick={handleConfirmBlur} className={styles.modalConfirmBtn}>
                  {isBlurred ? 'Show video' : 'Blur video'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Enhanced Status Pill Component
const StatusPill = ({ text, icon: Icon, color }) => (
  <motion.div
    initial={{ opacity: 0, y: 10, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9, y: 10 }}
    className={`${styles.statusPill} ${styles[color]}`}
  >
    <Icon size={14} />
    <span>{text}</span>
  </motion.div>
);

// Modern Control Button Component
const ControlButton = ({ onClick, Icon, isActive, isAccent, label }) => (
  <motion.button
    whileTap={{ scale: 0.95 }}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`${styles.controlButton} ${!isActive ? styles.inactive : ''} ${isAccent ? styles.accent : ''}`}
    aria-label={label}
    title={label}
  >
    <Icon size={18} />
  </motion.button>
);

export default CallScreen;
