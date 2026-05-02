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
  MessageCircle, MessageSquare, X, Send,
  SkipForward, Heart, Shield, Zap, VolumeX,
  Copy, Check, Users, Wifi
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
  onSendMessage = () => {},
  messages = [],
  userOreyId = null,
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [isSkipping, setIsSkipping] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [copiedOreyId, setCopiedOreyId] = useState(false);
  const [showOreyIdModal, setShowOreyIdModal] = useState(false);
  const [localVideoReady, setLocalVideoReady] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  
  const chatEndRef = useRef(null);
  const hideTimerRef = useRef(null);
  const skipTimerRef = useRef(null);
  const localStreamRef = useRef(localStream);
  const partnerStreamRef = useRef(partnerStream);
  
  const [statusMessages, setStatusMessages] = useState({
    audio: false,
    video: false,
    message: false
  });
  const messageTimers = useRef({ audio: null, video: null, message: null });

  const isRemoteConnected = !!partner;
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  // ─── FIX: Properly attach local stream ───
  const attachLocalStream = (stream) => {
    const video = localVideoRef.current;
    if (!video) return;

    // Clear existing stream
    video.srcObject = null;
    video.load(); // Reset element

    // Set new stream
    video.srcObject = stream;

    const handleCanPlay = () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.play()
        .then(() => setLocalVideoReady(true))
        .catch(err => {
          console.log('Local play error:', err);
          setTimeout(() => video.play().catch(() => {}), 500);
        });
    };

    video.addEventListener('canplay', handleCanPlay);

    // Handle case where canplay already fired
    if (video.readyState >= 3) {
      handleCanPlay();
    }
  };

  // ─── FIX: Properly attach remote stream ───
  const attachRemoteStream = (stream) => {
    const video = remoteVideoRef.current;
    if (!video) return;

    // Clear existing stream
    video.srcObject = null;
    video.load(); // Reset element

    // Set new stream
    video.srcObject = stream;

    const handleCanPlay = () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.play()
        .then(() => setRemoteVideoReady(true))
        .catch(err => {
          console.log('Remote play error:', err);
          setTimeout(() => video.play().catch(() => {}), 500);
        });
    };

    video.addEventListener('canplay', handleCanPlay);

    // Handle case where canplay already fired
    if (video.readyState >= 3) {
      handleCanPlay();
    }
  };

  // Update local stream when it changes
  useEffect(() => {
    localStreamRef.current = localStream;
    if (localStream) {
      setLocalVideoReady(false);
      attachLocalStream(localStream);
    } else {
      setLocalVideoReady(false);
    }
  }, [localStream]);

  // Handle videoEnabled toggle
  useEffect(() => {
    if (videoEnabled && localStream && localVideoRef.current) {
      setLocalVideoReady(false);
      attachLocalStream(localStream);
    }
  }, [videoEnabled]);

  // Update partner stream when it changes
  useEffect(() => {
    partnerStreamRef.current = partnerStream;
    if (partnerStream) {
      setRemoteVideoReady(false);
      attachRemoteStream(partnerStream);
    } else {
      setRemoteVideoReady(false);
    }
  }, [partnerStream]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current && showChat) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showChat]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
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
      }, 3000);
    } else {
      setStatusMessages(prev => ({ ...prev, [type]: false }));
    }
  };

  // Auto-hide UI controls
  useEffect(() => {
    const resetTimer = () => {
      if (!showChat) {
        setUiVisible(true);
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
      }
    };
    
    const events = ['mousemove', 'touchstart', 'keydown', 'click'];
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
        case 'c':
          e.preventDefault();
          setShowChat(prev => !prev);
          break;
        case 'Escape':
          if (showChat) setShowChat(false);
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [audioEnabled, videoEnabled, showChat]);

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

  const handleSendMessage = useCallback(() => {
    if (chatMessage.trim() && onSendMessage) {
      onSendMessage(chatMessage.trim());
      setChatMessage('');
      triggerStatusMessage('message', false);
    }
  }, [chatMessage, onSendMessage]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyOreyIdToClipboard = () => {
    if (userOreyId) {
      navigator.clipboard.writeText(userOreyId);
      setCopiedOreyId(true);
      setTimeout(() => setCopiedOreyId(false), 2000);
    }
  };

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
          <button 
            onClick={() => setShowOreyIdModal(true)} 
            className={styles.oreyIdButton}
          >
            <Heart size={12} />
            <span>{userOreyId || 'Get ID'}</span>
          </button>
        </div>

        {/* Connection Quality Indicator */}
        {isRemoteConnected && (
          <div className={styles.qualityIndicator}>
            <Wifi size={12} />
            <span>Connected</span>
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
                      <Users className={styles.searchingIcon} size={28} />
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
                {/* Remote Video Stream - FIX: Use visibility instead of display */}
                <video
                  ref={remoteVideoRef}
                  className={styles.video}
                  autoPlay
                  playsInline
                  poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                  style={{ 
                    visibility: isRemoteConnected && !isPartnerVideoOff ? 'visible' : 'hidden',
                    position: 'absolute',
                    inset: 0
                  }}
                  disablePictureInPicture
                  controlsList="nodownload nofullscreen noremoteplayback"
                  aria-label="Remote video stream"
                />

                {/* Loading spinner for remote video */}
                {isRemoteConnected && !isPartnerVideoOff && !remoteVideoReady && (
                  <div className={styles.videoLoadingOverlay}>
                    <Loader className={styles.spinner} size={24} />
                  </div>
                )}

                {/* Attractive Orey! Text Poster */}
                {(!isRemoteConnected || isPartnerVideoOff) && !searching && (
                  <div className={styles.posterContainer}>
                    <div className={styles.oreyPoster}>
                      <motion.div 
                        className={styles.oreyLogo}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.5 }}
                      >
                        <span className={styles.oreyLetter}>O</span>
                        <span className={styles.oreyLetter}>r</span>
                        <span className={styles.oreyLetter}>e</span>
                        <span className={styles.oreyLetter}>y</span>
                        <span className={styles.oreyExclamation}>!</span>
                      </motion.div>
                      <motion.p 
                        className={styles.oreySubtext}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                      >
                        Connect • Chat • Share
                      </motion.p>
                      {userOreyId && (
                        <motion.button
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.5 }}
                          onClick={() => setShowOreyIdModal(true)}
                          className={styles.showIdButton}
                        >
                          <Heart size={14} />
                          Share your Orey ID
                        </motion.button>
                      )}
                    </div>
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
                    {statusMessages.message && (
                      <StatusPill text="Message Sent" icon={Send} color="green" />
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
          {/* Local Video Stream - FIX: Use visibility instead of display */}
          <video
            ref={localVideoRef}
            className={styles.localVideo}
            autoPlay
            muted
            playsInline
            poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
            style={{ 
              visibility: videoEnabled ? 'visible' : 'hidden',
              position: 'absolute',
              inset: 0
            }}
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            aria-label="Local video stream"
          />
          
          {/* Loading spinner for local video */}
          {videoEnabled && localStream && !localVideoReady && (
            <div className={styles.videoLoadingOverlay}>
              <Loader className={styles.spinner} size={24} />
            </div>
          )}
          
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

        {/* CHAT PANEL - unchanged */}
        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className={styles.chatPanel}
            >
              <div className={styles.chatHeader}>
                <div className={styles.chatHeaderContent}>
                  <MessageCircle size={18} />
                  <span>Chat with partner</span>
                </div>
                <button onClick={() => setShowChat(false)} className={styles.closeChat}>
                  <X size={18} />
                </button>
              </div>

              <div className={styles.chatMessages}>
                {messages.length === 0 ? (
                  <div className={styles.emptyChat}>
                    <MessageSquare size={32} />
                    <p>No messages yet</p>
                    <span>Start a conversation!</span>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div 
                      key={idx} 
                      className={`${styles.chatMessage} ${msg.isOwn ? styles.ownMessage : styles.otherMessage}`}
                    >
                      <div className={styles.messageBubble}>
                        <p>{msg.text}</p>
                        <span className={styles.messageTime}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <div className={styles.chatInput}>
                <textarea
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className={styles.chatTextarea}
                  rows={1}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={!chatMessage.trim()}
                  className={styles.sendButton}
                >
                  <Send size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                    onClick={() => setShowChat(prev => !prev)}
                    Icon={MessageCircle} 
                    isActive={showChat}
                    isAccent={showChat}
                    label="Chat"
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

      {/* OREY ID MODAL - unchanged */}
      <AnimatePresence>
        {showOreyIdModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.modalOverlay}
            onClick={() => setShowOreyIdModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={styles.modal}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.modalIcon}>
                <Heart size={28} />
              </div>
              <h2 className={styles.modalTitle}>Your Orey ID</h2>
              <p className={styles.modalText}>
                Share this ID with friends to connect directly. They can call you using this unique code.
              </p>
              
              <div className={styles.oreyIdDisplay}>
                <code className={styles.oreyIdCode}>{userOreyId || 'Not registered'}</code>
                {userOreyId && (
                  <button onClick={copyOreyIdToClipboard} className={styles.copyIdButton}>
                    {copiedOreyId ? <Check size={16} /> : <Copy size={16} />}
                    {copiedOreyId ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>

              <div className={styles.modalActions}>
                <button onClick={() => setShowOreyIdModal(false)} className={styles.modalConfirmBtn}>
                  Got it
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
    initial={{ opacity: 0, y: 10, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9, y: 10 }}
    className={`${styles.statusPill} ${styles[color]}`}
  >
    <Icon size={14} />
    <span>{text}</span>
  </motion.div>
);

// Control Button Component
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
