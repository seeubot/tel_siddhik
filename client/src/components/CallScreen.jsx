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
  SkipForward, Wifi, WifiOff,
  AlertTriangle
} from 'lucide-react';
import { io } from 'socket.io-client';
import styles from './CallScreen.module.css';

// Configuration
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3000';
const UI_HIDE_DELAY = 5000;
const STATUS_MESSAGE_DURATION = 5000;
const DRAG_THRESHOLD = 120;
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

const CallScreen = () => {
  // Connection State
  const [searching, setSearching] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState('excellent');
  
  // UI State
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [callState, setCallState] = useState('idle'); // idle, searching, ringing, connected, ended
  
  // Partner Info
  const [partnerName, setPartnerName] = useState('');
  const [partnerOreyId, setPartnerOreyId] = useState('');
  const [currentRoomId, setCurrentRoomId] = useState(null);
  
  // Alerts
  const [banInfo, setBanInfo] = useState(null);
  const [warning, setWarning] = useState(null);
  
  // Status Messages
  const [statusMessages, setStatusMessages] = useState({
    audio: false,
    video: false,
    blur: false
  });

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const hideTimerRef = useRef(null);
  const messageTimers = useRef({ audio: null, video: null, blur: null });
  const deviceIdRef = useRef(null);

  // Initialize Socket Connection
  useEffect(() => {
    // Get or generate device ID
    deviceIdRef.current = localStorage.getItem('orey_device_id') || 
      `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('orey_device_id', deviceIdRef.current);

    // Connect to backend
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 Connected to Orey server');
      
      // Register device with backend
      socket.emit('register-device', { 
        deviceId: deviceIdRef.current,
        platform: 'web'
      });
    });

    socket.on('device-registered', ({ deviceId, safetySettings }) => {
      console.log('📱 Device registered:', deviceId);
      // Auto-join random matching
      joinRandomMatch();
    });

    socket.on('device-banned', (info) => {
      console.log('🚫 Device banned:', info);
      setBanInfo(info);
      cleanupConnection();
    });

    socket.on('device-error', ({ error }) => {
      console.error('Device error:', error);
    });

    socket.on('warning', ({ reason, message }) => {
      setWarning({ reason, message });
      setTimeout(() => setWarning(null), 5000);
    });

    // Matching Events
    socket.on('waiting-for-match', () => {
      console.log('⏳ Waiting for match...');
      setCallState('searching');
      setSearching(true);
    });

    socket.on('room-joined', async ({ roomId, peers, videoQuality, iceServers }) => {
      console.log('🎥 Room joined:', roomId, 'Peers:', peers);
      setCurrentRoomId(roomId);
      setCallState('connecting');
      
      if (peers && peers.length > 0) {
        const partner = peers[0];
        setPartnerName(partner.userName || 'Anonymous');
        setPartnerOreyId(partner.oreyId || 'Unknown');
        
        // Initialize WebRTC connection
        await initializeWebRTC(partner.socketId, roomId, iceServers || ICE_SERVERS);
      }
    });

    socket.on('incoming-call', ({ fromName, fromOreyId, autoMatched }) => {
      console.log('📞 Incoming call from:', fromName);
      setCallState('ringing');
      setPartnerName(fromName);
      setPartnerOreyId(fromOreyId);
      
      // Auto-accept for random matches
      if (autoMatched) {
        // Connection handled by room-joined event
      }
    });

    // WebRTC Signaling
    socket.on('offer', async ({ offer, fromId, fromName }) => {
      console.log('📨 Received offer from:', fromId);
      await handleOffer(offer, fromId);
    });

    socket.on('answer', async ({ answer, fromId }) => {
      console.log('✅ Received answer from:', fromId);
      await handleAnswer(answer);
    });

    socket.on('ice-candidate', async ({ candidate, fromId }) => {
      console.log('🧊 Received ICE candidate');
      await handleIceCandidate(candidate);
    });

    // Partner Events
    socket.on('partner-left', ({ socketId, userName, reason }) => {
      console.log('👋 Partner left:', reason);
      handlePartnerDisconnect(reason);
    });

    socket.on('peer-media-state', ({ socketId, audioEnabled, videoEnabled }) => {
      console.log('🎭 Peer media state changed:', { audioEnabled, videoEnabled });
      // Update partner's media state if needed
    });

    // Skip Events
    socket.on('skip-confirmed', () => {
      console.log('⏭️ Skip confirmed, finding new match...');
      cleanupWebRTC();
      setCallState('searching');
      setSearching(true);
      setIsSkipping(false);
    });

    // Quality Updates
    socket.on('video-quality-config', ({ quality }) => {
      console.log('📊 Video quality config:', quality);
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
      setCallState('ended');
      cleanupConnection();
    });

    socket.on('reconnect', () => {
      console.log('🔄 Reconnected to server');
      socket.emit('register-device', { 
        deviceId: deviceIdRef.current,
        platform: 'web'
      });
    });

    return () => {
      cleanupConnection();
      socket.disconnect();
    };
  }, []);

  // Join random matching queue
  const joinRandomMatch = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join-random');
    }
  };

  // Initialize WebRTC connection
  const initializeWebRTC = async (partnerSocketId, roomId, iceServers) => {
    try {
      setConnecting(true);
      
      // Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      });
      
      localStreamRef.current = stream;
      
      // Display local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const pc = new RTCPeerConnection(iceServers || ICE_SERVERS);
      peerConnectionRef.current = pc;

      // Add local tracks to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log('🎬 Received remote track');
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setSearching(false);
          setConnecting(false);
          setConnected(true);
          setCallState('connected');
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit('ice-candidate', {
            targetId: partnerSocketId,
            candidate: event.candidate
          });
        }
      };

      // Monitor connection state
      pc.onconnectionstatechange = () => {
        console.log('🔗 Connection state:', pc.connectionState);
        switch (pc.connectionState) {
          case 'connected':
            setConnectionQuality('excellent');
            break;
          case 'connecting':
            setConnectionQuality('poor');
            break;
          case 'disconnected':
          case 'failed':
            handlePartnerDisconnect('connection_lost');
            break;
        }
      };

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socketRef.current?.emit('offer', {
        targetId: partnerSocketId,
        offer: offer
      });

    } catch (error) {
      console.error('Error initializing WebRTC:', error);
      setConnecting(false);
      setCallState('ended');
    }
  };

  // Handle incoming offer
  const handleOffer = async (offer, fromId) => {
    try {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socketRef.current?.emit('answer', {
        targetId: fromId,
        answer: answer
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  // Handle incoming answer
  const handleAnswer = async (answer) => {
    try {
      const pc = peerConnectionRef.current;
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  // Handle ICE candidate
  const handleIceCandidate = async (candidate) => {
    try {
      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  // Handle partner disconnection
  const handlePartnerDisconnect = (reason) => {
    setCallState('ended');
    setConnected(false);
    cleanupWebRTC();
    
    // Auto rejoin queue after 3 seconds
    setTimeout(() => {
      joinRandomMatch();
    }, 3000);
  };

  // Cleanup WebRTC
  const cleanupWebRTC = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  // Full cleanup
  const cleanupConnection = () => {
    cleanupWebRTC();
    setConnected(false);
    setConnecting(false);
    setCallState('idle');
  };

  // Skip to next match
  const handleSkip = useCallback(() => {
    if (isSkipping) return;
    
    setIsSkipping(true);
    
    if (currentRoomId && socketRef.current) {
      socketRef.current.emit('skip', { roomId: currentRoomId });
    } else {
      // Manual skip if no room
      cleanupWebRTC();
      setCallState('searching');
      setSearching(true);
      joinRandomMatch();
      setIsSkipping(false);
    }
  }, [isSkipping, currentRoomId]);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    setAudioEnabled(prev => {
      const newState = !prev;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => {
          track.enabled = newState;
        });
      }
      
      // Notify partner
      if (currentRoomId && socketRef.current) {
        socketRef.current.emit('media-state', {
          roomId: currentRoomId,
          audioEnabled: newState,
          videoEnabled: videoEnabled
        });
      }
      
      triggerStatusMessage('audio', !newState);
      return newState;
    });
  }, [currentRoomId, videoEnabled]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    setVideoEnabled(prev => {
      const newState = !prev;
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => {
          track.enabled = newState;
        });
      }
      
      // Notify partner
      if (currentRoomId && socketRef.current) {
        socketRef.current.emit('media-state', {
          roomId: currentRoomId,
          audioEnabled: audioEnabled,
          videoEnabled: newState
        });
      }
      
      triggerStatusMessage('video', !newState);
      return newState;
    });
  }, [currentRoomId, audioEnabled]);

  // Toggle blur/privacy
  const toggleBlur = useCallback(() => {
    setIsBlurred(prev => {
      const newState = !prev;
      triggerStatusMessage('blur', newState);
      return newState;
    });
  }, []);

  // End call
  const endCall = useCallback(() => {
    if (currentRoomId && socketRef.current) {
      socketRef.current.emit('leave-chat', { roomId: currentRoomId });
    }
    cleanupConnection();
    setCallState('ended');
  }, [currentRoomId]);

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
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Motion values for drag
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-10, 10]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);
  const cardControls = useAnimation();

  const handleDragEnd = useCallback((event, info) => {
    if (Math.abs(info.offset.x) > DRAG_THRESHOLD) {
      handleSkip();
    } else {
      cardControls.start({ x: 0, opacity: 1, rotate: 0 });
    }
  }, [handleSkip, cardControls]);

  // Report user
  const reportUser = useCallback((reason) => {
    if (!connected || !socketRef.current) return;
    
    socketRef.current.emit('report-user', {
      reportedDeviceId: partnerOreyId, // In real app, you'd have the actual device ID
      reason: reason,
      description: 'Reported during call'
    });
  }, [connected, partnerOreyId]);

  // Render ban screen
  if (banInfo) {
    return (
      <div className={styles.container}>
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <AlertTriangle size={64} className="text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Device Banned</h2>
          <p className="text-gray-400 mb-4">{banInfo.reason}</p>
          {banInfo.expiresAt && (
            <p className="text-sm text-gray-500">
              Ban expires: {new Date(banInfo.expiresAt).toLocaleString()}
            </p>
          )}
          {!banInfo.expiresAt && (
            <p className="text-sm text-red-400 font-semibold">This is a permanent ban</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Warning banner */}
      <AnimatePresence>
        {warning && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute top-0 left-0 right-0 bg-yellow-600 text-white p-3 text-center z-50"
          >
            <AlertTriangle size={16} className="inline mr-2" />
            {warning.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Partner Viewport */}
      <div className={styles.partnerViewport}>
        <div className={styles.branding}>
          <Zap size={16} color="#6366f1" fill="#6366f1" />
          <span className={styles.brandingText}>Orey!</span>
        </div>

        {/* Partner Info */}
        {callState === 'connected' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/50 backdrop-blur-md rounded-full px-4 py-2 z-40"
          >
            <span className="text-sm text-white/80">
              {partnerName}
              {partnerOreyId && partnerOreyId !== 'Unknown' && (
                <span className="text-xs text-white/50 ml-2">({partnerOreyId})</span>
              )}
            </span>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={callState}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            style={{ x, rotate, opacity }}
            animate={cardControls}
            onDragEnd={handleDragEnd}
            className={styles.videoWrapper}
          >
            {callState === 'searching' && (
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
                  className="mt-8 text-indigo-400/80 text-xs font-black uppercase tracking-[0.8em] animate-pulse"
                >
                  Searching for someone
                </motion.p>
                <p className="mt-4 text-gray-500 text-xs">
                  {io.engine?.clientsCount || 0} people online
                </p>
              </div>
            )}

            {callState === 'connecting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-20">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <Loader size={48} className="text-indigo-500" />
                </motion.div>
                <p className="mt-4 text-white/60">Connecting to {partnerName}...</p>
              </div>
            )}

            {(callState === 'connected' || callState === 'ended') && (
              <>
                <video 
                  ref={remoteVideoRef} 
                  className={styles.remoteVideo} 
                  autoPlay 
                  playsInline 
                />
                
                {/* Status Pills */}
                <div className={styles.overlay}>
                  <AnimatePresence>
                    {statusMessages.audio && (
                      <StatusPill text="You Muted" icon={MicOff} color="rose" />
                    )}
                    {statusMessages.video && (
                      <StatusPill text="Camera Off" icon={VideoOff} color="rose" />
                    )}
                    {statusMessages.blur && (
                      <StatusPill text="Privacy Mode" icon={ShieldAlert} color="indigo" />
                    )}
                  </AnimatePresence>
                </div>
                
                {/* Connection Quality */}
                {callState === 'connected' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute top-20 right-4 flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full px-3 py-1.5 z-40"
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
                )}
                
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
            className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-950/20 backdrop-blur-sm z-10"
          >
            <EyeOff size={40} className="text-indigo-400/30" />
            <span className="mt-2 text-xs text-indigo-400/40 font-medium uppercase tracking-wider">
              Privacy Mode
            </span>
          </motion.div>
        )}

        {/* Call ended state */}
        <AnimatePresence>
          {callState === 'ended' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20"
            >
              <h2 className="text-2xl font-bold text-white mb-4">Call Ended</h2>
              <p className="text-gray-400 mb-6">Finding next match automatically...</p>
              <button
                onClick={joinRandomMatch}
                className="px-6 py-3 bg-indigo-600 text-white rounded-full font-semibold hover:bg-indigo-700 transition"
              >
                Find New Match
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Control Dock */}
        <AnimatePresence>
          {uiVisible && callState !== 'ended' && (
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
                    isDanger={!audioEnabled}
                    aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
                  />
                  <FlexButton 
                    onClick={toggleVideo} 
                    Icon={videoEnabled ? Video : VideoOff} 
                    isDanger={!videoEnabled}
                    aria-label={videoEnabled ? "Turn off camera" : "Turn on camera"}
                  />
                </div>

                <button 
                  onClick={callState === 'connected' ? handleSkip : joinRandomMatch} 
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

                <div className={styles.featureGroup}>
                  <FlexButton 
                    onClick={toggleBlur} 
                    Icon={isBlurred ? EyeOff : Eye} 
                    isAccent={isBlurred}
                    aria-label={isBlurred ? "Disable privacy mode" : "Enable privacy mode"}
                  />
                  <button 
                    onClick={endCall}
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
    className={`flex items-center gap-3 px-6 py-3 rounded-2xl backdrop-blur-2xl border border-white/5 shadow-2xl ${
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
