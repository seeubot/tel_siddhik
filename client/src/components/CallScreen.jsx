import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, SkipForward,
  Heart, Copy, Check,
  Users, Wifi
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
  searching = false,
  autoSearchCountdown = null,
  onToggleAudio = () => {},
  onToggleVideo = () => {},
  onSkip = () => {},
  onLeave = () => {},
  onCancelAutoSearch = () => {},
  currentUserName = 'You',
  userOreyId = null,
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [copiedOreyId, setCopiedOreyId] = useState(false);
  const [showOreyIdModal, setShowOreyIdModal] = useState(false);
  const [localVideoReady, setLocalVideoReady] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  
  const hideTimerRef = useRef(null);
  const localStreamRef = useRef(localStream);
  const remoteStreamRef = useRef(null);

  // Swipe gesture values
  const dragX = useMotionValue(0);
  const cardRotation = useTransform(dragX, [-300, 0, 300], [-15, 0, 15]);
  const cardOpacity = useTransform(dragX, [-300, -150, 0], [0.6, 0.9, 1]);
  const nextHintOpacity = useTransform(dragX, [-200, -50, 0], [1, 0, 0]);
  const nextHintScale = useTransform(dragX, [-200, 0], [1, 0.8]);
  
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState(null);
  const skipThreshold = typeof window !== 'undefined' ? window.innerWidth * 0.3 : 300;

  const isRemoteConnected = !!partner;
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  const transparentPoster = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  // Update local stream ref
  useEffect(() => {
    localStreamRef.current = localStream;
    
    // Reset video ready state when stream changes
    if (localStream) {
      setLocalVideoReady(false);
      attachLocalStream(localStream);
    } else {
      setLocalVideoReady(false);
    }
  }, [localStream]);

  // Handle remote video stream
  useEffect(() => {
    if (partner?.stream && remoteVideoRef.current) {
      // Only update if stream changed
      if (remoteStreamRef.current !== partner.stream) {
        remoteStreamRef.current = partner.stream;
        attachRemoteStream(partner.stream);
      }
    } else if (!partner?.stream) {
      remoteStreamRef.current = null;
      setRemoteVideoReady(false);
    }
  }, [partner?.stream, remoteVideoRef]);

  const attachLocalStream = (stream) => {
    if (!localVideoRef.current) return;
    
    const video = localVideoRef.current;
    
    // Remove old stream
    if (video.srcObject) {
      video.srcObject = null;
    }
    
    // Set new stream
    video.srcObject = stream;
    
    // Handle video ready
    const handleCanPlay = () => {
      video.play()
        .then(() => {
          setLocalVideoReady(true);
        })
        .catch(err => {
          console.log('Local video play error:', err);
          // Retry once
          setTimeout(() => {
            video.play().catch(e => console.log('Retry failed:', e));
          }, 1000);
        });
    };
    
    video.oncanplay = handleCanPlay;
    
    // Also try immediately
    video.play().catch(() => {
      // Silent fail, will retry on canplay
    });
  };

  const attachRemoteStream = (stream) => {
    if (!remoteVideoRef.current) return;
    
    const video = remoteVideoRef.current;
    
    // Remove old stream
    if (video.srcObject) {
      video.srcObject = null;
    }
    
    // Set new stream
    video.srcObject = stream;
    
    // Handle video ready
    const handleCanPlay = () => {
      video.play()
        .then(() => {
          setRemoteVideoReady(true);
        })
        .catch(err => {
          console.log('Remote video play error:', err);
          setTimeout(() => {
            video.play().catch(e => console.log('Retry failed:', e));
          }, 1000);
        });
    };
    
    video.oncanplay = handleCanPlay;
    
    // Try immediately
    video.play().catch(() => {
      // Silent fail
    });
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (localVideoRef.current) {
        localVideoRef.current.oncanplay = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.oncanplay = null;
      }
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Auto-hide UI controls
  useEffect(() => {
    const resetTimer = () => {
      setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    };
    
    const events = ['mousemove', 'touchstart', 'click'];
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
      
      switch(e.key.toLowerCase()) {
        case 'm':
          e.preventDefault();
          onToggleAudio();
          break;
        case 'v':
          e.preventDefault();
          onToggleVideo();
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [audioEnabled, videoEnabled]);

  const handleDragEnd = (event, info) => {
    setIsDragging(false);
    setSwipeDirection(null);
    
    if (Math.abs(info.offset.x) > skipThreshold) {
      const direction = info.offset.x > 0 ? 'right' : 'left';
      
      const flyX = direction === 'right' ? 800 : -800;
      dragX.set(flyX);
      
      setTimeout(() => {
        onSkip();
        dragX.set(0);
      }, 200);
    } else {
      dragX.set(0);
    }
  };

  const handleDrag = (event, info) => {
    setIsDragging(true);
    if (info.offset.x < -20) setSwipeDirection('left');
    else if (info.offset.x > 20) setSwipeDirection('right');
    else setSwipeDirection(null);
  };

  const copyOreyIdToClipboard = () => {
    if (userOreyId) {
      navigator.clipboard.writeText(userOreyId);
      setCopiedOreyId(true);
      setTimeout(() => setCopiedOreyId(false), 2000);
    }
  };

  // Simple brand overlay
  const BrandOverlay = () => (
    <div className={styles.brandOverlay}>
      <div className={styles.brandTextContainer}>
        <span className={styles.brandTextLarge}>Orey!</span>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      
      {/* ── 60% REMOTE VIEW ── */}
      <div className={styles.remoteView}>
        
        {/* Top Bar */}
        <AnimatePresence>
          {uiVisible && (
            <motion.div
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -60, opacity: 0 }}
              className={styles.topBar}
            >
              <div className={styles.topBarLeft}>
                <div className={styles.brandBadge}>
                  <span className={styles.brandDot} />
                  <span className={styles.brandName}>Orey!</span>
                </div>
                {userOreyId && (
                  <button onClick={() => setShowOreyIdModal(true)} className={styles.idBadge}>
                    <Heart size={11} />
                    <span>{userOreyId}</span>
                  </button>
                )}
              </div>
              <div className={styles.topBarRight}>
                {isRemoteConnected && (
                  <div className={styles.connectionBadge}>
                    <Wifi size={11} />
                    <span>Live</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Video / Brand Overlay / Searching */}
        <div className={styles.videoContainer}>
          {searching || autoSearchCountdown !== null ? (
            <div className={styles.searchingOverlay}>
              {autoSearchCountdown !== null ? (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={styles.countdownContent}
                >
                  <div className={styles.countdownRing}>
                    <span className={styles.countdownNumber}>{autoSearchCountdown}</span>
                  </div>
                  <p className={styles.countdownLabel}>Connecting...</p>
                  <button onClick={onCancelAutoSearch} className={styles.cancelBtn}>
                    Cancel
                  </button>
                </motion.div>
              ) : (
                <div className={styles.searchingContent}>
                  <div className={styles.searchingAnimation}>
                    <div className={styles.rippleContainer}>
                      <div className={styles.ripple} />
                      <div className={styles.ripple} style={{ animationDelay: '0.3s' }} />
                      <div className={styles.ripple} style={{ animationDelay: '0.6s' }} />
                    </div>
                    <div className={styles.searchingIconWrapper}>
                      <Users size={20} />
                    </div>
                  </div>
                  <h3 className={styles.searchingTitle}>Finding your match</h3>
                  <p className={styles.searchingSubtitle}>Hold tight, connecting you with someone amazing</p>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.remoteVideoWrapper}>
              {isRemoteConnected && !isPartnerVideoOff ? (
                <motion.div
                  className={styles.swipeCard}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.9}
                  style={{
                    x: dragX,
                    rotate: cardRotation,
                    opacity: cardOpacity,
                  }}
                  onDrag={handleDrag}
                  onDragEnd={handleDragEnd}
                  whileTap={{ cursor: 'grabbing' }}
                >
                  <video
                    ref={remoteVideoRef}
                    className={styles.video}
                    autoPlay
                    playsInline
                    muted={false}
                    poster={transparentPoster}
                    disablePictureInPicture
                    controlsList="nodownload nofullscreen noremoteplayback"
                    x-webkit-airplay="deny"
                  />
                  
                  {!remoteVideoReady && (
                    <div className={styles.videoLoadingOverlay}>
                      <div className={styles.videoLoadingSpinner} />
                    </div>
                  )}
                  
                  {/* Swipe direction indicator */}
                  <AnimatePresence>
                    {isDragging && swipeDirection && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`${styles.swipeIndicator} ${
                          swipeDirection === 'left' ? styles.swipeLeft : styles.swipeRight
                        }`}
                      >
                        <SkipForward size={24} />
                        <span>Skip</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {/* Next hint overlay */}
                  <motion.div
                    className={styles.nextHint}
                    style={{
                      opacity: nextHintOpacity,
                      scale: nextHintScale,
                    }}
                  >
                    <SkipForward size={16} />
                    <span>Next</span>
                  </motion.div>
                </motion.div>
              ) : (
                <BrandOverlay />
              )}
            </div>
          )}

          {isRemoteConnected && isPartnerMuted && (
            <div className={styles.peerStatusBadge}>
              <MicOff size={12} />
              <span>Partner muted</span>
            </div>
          )}
          
          {isRemoteConnected && isPartnerVideoOff && (
            <div className={styles.peerStatusBadge}>
              <VideoOff size={12} />
              <span>Camera off</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 40% BOTTOM SECTION ── */}
      <div className={styles.bottomSection}>
        <div className={styles.localVideoWrapper}>
          <video
            ref={localVideoRef}
            className={styles.localVideo}
            autoPlay
            muted
            playsInline
            poster={transparentPoster}
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            x-webkit-airplay="deny"
            style={{ display: videoEnabled && localStream ? 'block' : 'none' }}
          />
          
          {(!videoEnabled || !localStream) && (
            <BrandOverlay />
          )}
          
          {videoEnabled && localStream && !localVideoReady && (
            <div className={styles.videoLoadingOverlay}>
              <div className={styles.videoLoadingSpinner} />
            </div>
          )}
        </div>
        
        {videoEnabled && localStream && !audioEnabled && (
          <div className={styles.localMicOff}>
            <MicOff size={12} />
            <span>Muted</span>
          </div>
        )}
        
        {videoEnabled && localStream && (
          <div className={styles.localLabel}>You</div>
        )}

        {/* ── iOS Style Control Bar ── */}
        <AnimatePresence>
          {uiVisible && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className={styles.controlBarWrapper}
            >
              <div className={styles.controlBar}>
                
                {/* Mic Button */}
                <motion.button
                  onClick={onToggleAudio}
                  className={`${styles.controlBtn} ${!audioEnabled ? styles.controlBtnOff : styles.controlBtnOn}`}
                  aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
                  whileTap={{ scale: 0.9 }}
                >
                  {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                </motion.button>

                {/* Video Button */}
                <motion.button
                  onClick={onToggleVideo}
                  className={`${styles.controlBtn} ${!videoEnabled ? styles.controlBtnOff : styles.controlBtnOn}`}
                  aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                  whileTap={{ scale: 0.9 }}
                >
                  {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                </motion.button>

                {/* Skip Button */}
                <motion.button
                  onClick={onSkip}
                  className={`${styles.controlBtn} ${styles.controlBtnSkip}`}
                  aria-label="Skip"
                  whileTap={{ scale: 0.9 }}
                >
                  <SkipForward size={20} />
                </motion.button>

                {/* End Call Button */}
                <motion.button
                  onClick={onLeave}
                  className={styles.endBtn}
                  aria-label="End call"
                  whileTap={{ scale: 0.85 }}
                >
                  <PhoneOff size={22} />
                </motion.button>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── OREY ID MODAL ── */}
      <AnimatePresence>
        {showOreyIdModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.modalBackdrop}
            onClick={() => setShowOreyIdModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className={styles.modal}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.modalIconWrapper}>
                <Heart size={24} />
              </div>
              <h3>Your Orey ID</h3>
              <p>Share this ID with friends to connect instantly</p>
              <div className={styles.modalIdBox}>
                <code>{userOreyId || 'Not registered'}</code>
                {userOreyId && (
                  <button onClick={copyOreyIdToClipboard} className={styles.modalCopyBtn}>
                    {copiedOreyId ? <Check size={16} /> : <Copy size={16} />}
                    <span>{copiedOreyId ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </div>
              <button onClick={() => setShowOreyIdModal(false)} className={styles.modalCloseBtn}>
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CallScreen;
