import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, MessageCircle,
  SkipForward, Heart, Copy, Check,
  Users, Wifi, X
} from 'lucide-react';
import ChatPanel from './ChatPanel';
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
  onSendMessage = () => {},
  messages = [],
  peerTyping = false,
  onTyping = () => {},
  currentUserName = 'You',
  userOreyId = null,
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [copiedOreyId, setCopiedOreyId] = useState(false);
  const [showOreyIdModal, setShowOreyIdModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const hideTimerRef = useRef(null);
  const prevMessagesLength = useRef(0);
  const localStreamRef = useRef(localStream);

  const isRemoteConnected = !!partner;
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  // Track unread messages
  useEffect(() => {
    if (!showChat && messages.length > prevMessagesLength.current) {
      const newMessages = messages.length - prevMessagesLength.current;
      setUnreadCount(prev => prev + newMessages);
    }
    if (showChat) {
      setUnreadCount(0);
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, showChat]);

  // Update local stream ref
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Handle video stream sources
  useEffect(() => {
    if (remoteVideoRef.current && partner?.stream) {
      remoteVideoRef.current.srcObject = partner.stream;
    }
  }, [partner?.stream, remoteVideoRef]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, localVideoRef]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') track.stop();
        });
      }
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Auto-hide UI controls (only when chat is closed)
  useEffect(() => {
    const resetTimer = () => {
      setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      if (!showChat) {
        hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
      }
    };
    
    const events = ['mousemove', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();
    
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearTimeout(hideTimerRef.current);
    };
  }, [showChat]);

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
        case 'c':
          e.preventDefault();
          setShowChat(prev => !prev);
          break;
        case 'escape':
          if (showChat) setShowChat(false);
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showChat, audioEnabled, videoEnabled]);

  const copyOreyIdToClipboard = () => {
    if (userOreyId) {
      navigator.clipboard.writeText(userOreyId);
      setCopiedOreyId(true);
      setTimeout(() => setCopiedOreyId(false), 2000);
    }
  };

  return (
    <div className={styles.container}>
      
      {/* ── 60% REMOTE VIEW ── */}
      <div className={`${styles.remoteView} ${showChat ? styles.remoteViewChat : ''}`}>
        
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
                {showChat && (
                  <button onClick={() => setShowChat(false)} className={styles.closeChatTopBtn}>
                    <X size={16} />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Video / Poster / Searching */}
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
            <>
              <video
                ref={remoteVideoRef}
                className={styles.video}
                autoPlay
                playsInline
                style={{ display: isRemoteConnected && !isPartnerVideoOff ? 'block' : 'none' }}
              />

              {(!isRemoteConnected || isPartnerVideoOff) && (
                <div className={styles.posterOverlay}>
                  <div className={styles.posterContent}>
                    <div className={styles.posterLogo}>
                      <span className={styles.logoLetter}>O</span>
                      <span className={styles.logoLetter}>r</span>
                      <span className={styles.logoLetter}>e</span>
                      <span className={styles.logoLetter}>y</span>
                      <span className={styles.logoExclaim}>!</span>
                    </div>
                    <p className={styles.posterTagline}>Video Chat Platform</p>
                    <div className={styles.posterFeatures}>
                      <span>🔒 Secure</span>
                      <span>⚡ Fast</span>
                      <span>🌍 Global</span>
                    </div>
                  </div>
                </div>
              )}

              {isRemoteConnected && isPartnerMuted && (
                <div className={styles.peerStatusBadge}>
                  <MicOff size={12} />
                  <span>Partner muted</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Local PiP - hide when chat is open */}
        <AnimatePresence>
          {!showChat && !searching && isRemoteConnected && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className={styles.pipContainer}
            >
              <video
                ref={localVideoRef}
                className={styles.pipVideo}
                autoPlay
                muted
                playsInline
              />
              {!videoEnabled && (
                <div className={styles.pipCameraOff}>
                  <VideoOff size={16} />
                </div>
              )}
              <div className={styles.pipLabel}>
                <span>You</span>
                {!audioEnabled && <MicOff size={9} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 40% BOTTOM SECTION ── */}
      <div className={`${styles.bottomSection} ${showChat ? styles.bottomSectionChat : ''}`}>
        {showChat ? (
          <ChatPanel
            messages={messages}
            peerTyping={peerTyping}
            onSendMessage={onSendMessage}
            onTyping={onTyping}
            onClose={() => setShowChat(false)}
            partnerName={partner?.userName || 'Partner'}
          />
        ) : (
          <>
            {/* Local Video in 40% */}
            <video
              ref={localVideoRef}
              className={styles.localVideo}
              autoPlay
              muted
              playsInline
            />
            {!videoEnabled && (
              <div className={styles.localCameraOff}>
                <div className={styles.cameraOffIcon}>
                  <VideoOff size={28} />
                </div>
                <span>Camera is off</span>
              </div>
            )}
            {!audioEnabled && (
              <div className={styles.localMicOff}>
                <MicOff size={12} />
                <span>Muted</span>
              </div>
            )}
            <div className={styles.localLabel}>You</div>
          </>
        )}

        {/* ── Control Bar (hidden when chat open) ── */}
        <AnimatePresence>
          {uiVisible && !showChat && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className={styles.controlBarWrapper}
            >
              <div className={styles.controlBar}>
                <button
                  onClick={onToggleAudio}
                  className={`${styles.controlBtn} ${!audioEnabled ? styles.controlBtnOff : ''}`}
                  aria-label={audioEnabled ? 'Mute' : 'Unmute'}
                >
                  {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                </button>

                <button
                  onClick={onToggleVideo}
                  className={`${styles.controlBtn} ${!videoEnabled ? styles.controlBtnOff : ''}`}
                  aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                >
                  {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
                </button>

                <button
                  onClick={() => setShowChat(true)}
                  className={styles.controlBtn}
                  aria-label="Chat"
                >
                  <MessageCircle size={18} />
                  {unreadCount > 0 && (
                    <span className={styles.chatBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                  )}
                </button>

                <button onClick={onSkip} className={styles.controlBtn} aria-label="Skip">
                  <SkipForward size={18} />
                </button>

                <button onClick={onLeave} className={styles.endBtn} aria-label="End call">
                  <PhoneOff size={20} />
                </button>
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
