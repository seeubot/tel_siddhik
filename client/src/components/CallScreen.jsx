import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, Loader, MessageCircle,
  Send, SkipForward, Heart,
  Copy, Check, Shield, Users, Wifi, MoreHorizontal,
  ChevronRight, Info, UserPlus
} from 'lucide-react';
import styles from './CallScreen.module.css';

const CallScreen = ({
  partner = null,
  localVideoRef,
  remoteVideoRef,
  audioEnabled = true,
  videoEnabled = true,
  partnerMedia = { video: true, audio: true },
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
  const [chatMessage, setChatMessage] = useState('');
  const [copiedOreyId, setCopiedOreyId] = useState(false);
  const [showOreyIdModal, setShowOreyIdModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const chatEndRef = useRef(null);
  const hideTimerRef = useRef(null);
  const chatInputRef = useRef(null);
  const prevMessagesLength = useRef(0);

  const isRemoteConnected = !!partner;
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  // Track unread messages when chat is closed
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

  // Auto-scroll chat
  useEffect(() => {
    if (chatEndRef.current && showChat) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showChat, peerTyping]);

  // Focus chat input when opened
  useEffect(() => {
    if (showChat && chatInputRef.current) {
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  }, [showChat]);

  // Handle video stream sources
  useEffect(() => {
    if (remoteVideoRef.current && partner?.stream) {
      remoteVideoRef.current.srcObject = partner.stream;
    }
  }, [partner?.stream, remoteVideoRef]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localVideoRef.current.srcObject;
    }
  }, []);

  // Auto-hide UI controls
  useEffect(() => {
    const resetTimer = () => {
      if (!showChat) {
        setUiVisible(true);
        clearTimeout(hideTimerRef.current);
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

  const handleSendMessage = useCallback(() => {
    const trimmed = chatMessage.trim();
    if (trimmed && onSendMessage) {
      onSendMessage(trimmed);
      setChatMessage('');
    }
  }, [chatMessage, onSendMessage]);

  const handleInputChange = (e) => {
    setChatMessage(e.target.value);
    if (onTyping) onTyping();
  };

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

  const formatTime = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className={styles.container}>
      
      {/* ── REMOTE VIEW (Full Screen) ── */}
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
                      <Users size={24} />
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
                  <span>Mic off</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── LOCAL VIEW (Picture-in-Picture) ── */}
      <AnimatePresence>
        {!showChat && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className={styles.pipContainer}
            drag
            dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
            dragElastic={0.1}
            dragMomentum={false}
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
                <VideoOff size={20} />
              </div>
            )}
            <div className={styles.pipLabel}>
              <span>You</span>
              {!audioEnabled && <MicOff size={10} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CHAT PANEL ── */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className={styles.chatPanel}
          >
            <div className={styles.chatPanelInner}>
              {/* Chat Header */}
              <div className={styles.chatHeader}>
                <div className={styles.chatHeaderLeft}>
                  <MessageCircle size={18} />
                  <div>
                    <h4>Chat</h4>
                    <span>{partner?.userName || 'Partner'}</span>
                  </div>
                </div>
                <button onClick={() => setShowChat(false)} className={styles.chatCloseBtn}>
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Messages */}
              <div className={styles.chatMessages}>
                {messages.length === 0 ? (
                  <div className={styles.chatEmpty}>
                    <div className={styles.chatEmptyIcon}>
                      <MessageCircle size={28} />
                    </div>
                    <h4>No messages yet</h4>
                    <p>Say hello to break the ice!</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const showAvatar = idx === 0 || messages[idx - 1]?.isOwn !== msg.isOwn;
                    return (
                      <div
                        key={msg.id || idx}
                        className={`${styles.messageRow} ${msg.isOwn ? styles.messageRowOwn : styles.messageRowOther}`}
                      >
                        {!msg.isOwn && showAvatar && (
                          <div className={styles.messageAvatar}>
                            {(partner?.userName || 'P')[0].toUpperCase()}
                          </div>
                        )}
                        <div className={`${styles.messageBubble} ${msg.isOwn ? styles.bubbleOwn : styles.bubbleOther}`}>
                          {!msg.isOwn && showAvatar && (
                            <span className={styles.bubbleName}>{msg.senderName || partner?.userName}</span>
                          )}
                          <p>{msg.text || msg.message}</p>
                          <span className={styles.bubbleTime}>{formatTime(msg.timestamp)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
                {peerTyping && (
                  <div className={styles.typingIndicator}>
                    <div className={styles.typingBubble}>
                      <span className={styles.typingDot} />
                      <span className={styles.typingDot} style={{ animationDelay: '0.2s' }} />
                      <span className={styles.typingDot} style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className={styles.chatInputContainer}>
                <div className={styles.chatInputWrapper}>
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatMessage}
                    onChange={handleInputChange}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    className={styles.chatInput}
                    maxLength={500}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatMessage.trim()}
                    className={styles.chatSendBtn}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CONTROL BAR ── */}
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
              {/* Mic */}
              <button
                onClick={onToggleAudio}
                className={`${styles.controlBtn} ${!audioEnabled ? styles.controlBtnOff : ''}`}
                aria-label={audioEnabled ? 'Mute' : 'Unmute'}
              >
                {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>

              {/* Video */}
              <button
                onClick={onToggleVideo}
                className={`${styles.controlBtn} ${!videoEnabled ? styles.controlBtnOff : ''}`}
                aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </button>

              {/* Chat */}
              <button
                onClick={() => setShowChat(prev => !prev)}
                className={`${styles.controlBtn} ${showChat ? styles.controlBtnActive : ''}`}
                aria-label="Chat"
              >
                <MessageCircle size={20} />
                {unreadCount > 0 && (
                  <span className={styles.chatBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>

              {/* Skip */}
              <button
                onClick={onSkip}
                className={styles.controlBtn}
                aria-label="Skip"
              >
                <SkipForward size={20} />
              </button>

              {/* End */}
              <button
                onClick={onLeave}
                className={styles.endBtn}
                aria-label="End call"
              >
                <PhoneOff size={22} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
