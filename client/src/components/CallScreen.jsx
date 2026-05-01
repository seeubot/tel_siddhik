import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, Loader,
  Shield, VolumeX, Heart, Sparkles,
  Eye, EyeOff, SkipForward
} from 'lucide-react';
import { io } from 'socket.io-client';
import styles from './CallScreen.module.css';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3000';
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

const CallScreen = ({
  onLeave = () => {},
}) => {
  // UI State
  const [uiVisible, setUiVisible] = useState(true);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [showBlurConfirm, setShowBlurConfirm] = useState(false);
  
  // Connection State
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [searching, setSearching] = useState(true);
  const [autoSearchCountdown, setAutoSearchCountdown] = useState(null);
  const [partner, setPartner] = useState(null);
  const [partnerMedia, setPartnerMedia] = useState({ video: true, audio: true });
  const [connectionState, setConnectionState] = useState('disconnected'); // disconnected, connecting, connected
  const [banInfo, setBanInfo] = useState(null);
  
  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const hideTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const currentRoomRef = useRef(null);

  // Initialize Socket.IO
  useEffect(() => {
    const deviceId = localStorage.getItem('orey_device_id') || 
      `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('orey_device_id', deviceId);

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 Connected');
      socket.emit('register-device', { deviceId, platform: 'web' });
    });

    socket.on('device-registered', () => {
      console.log('📱 Device registered');
      // Auto-join random matching
      socket.emit('join-random');
    });

    socket.on('device-banned', (info) => {
      setBanInfo(info);
      cleanupConnection();
    });

    socket.on('waiting-for-match', () => {
      console.log('⏳ Waiting for match');
      setSearching(true);
    });

    socket.on('room-joined', async ({ roomId, peers, videoQuality, iceServers }) => {
      console.log('🎥 Room joined:', roomId);
      currentRoomRef.current = roomId;
      
      if (peers?.length > 0) {
        const partner = peers[0];
        setPartner({ 
          socketId: partner.socketId, 
          name: partner.userName || 'Anonymous',
          oreyId: partner.oreyId 
        });
        
        await initializeWebRTC(partner.socketId, iceServers || ICE_SERVERS);
      }
    });

    socket.on('incoming-call', ({ fromName, fromOreyId }) => {
      setPartner({ name: fromName, oreyId: fromOreyId });
    });

    // WebRTC Signaling
    socket.on('offer', async ({ offer, fromId, fromName }) => {
      await handleOffer(offer, fromId);
    });

    socket.on('answer', async ({ answer, fromId }) => {
      await handleAnswer(answer);
    });

    socket.on('ice-candidate', async ({ candidate, fromId }) => {
      await handleIceCandidate(candidate);
    });

    // Partner events
    socket.on('partner-left', ({ reason }) => {
      console.log('👋 Partner left:', reason);
      handlePartnerDisconnect();
    });

    socket.on('peer-media-state', ({ audioEnabled, videoEnabled }) => {
      setPartnerMedia({ audio: audioEnabled, video: videoEnabled });
    });

    // Skip/Next
    socket.on('skip-confirmed', () => {
      setIsSkipping(false);
      // Socket will auto rejoin queue
    });

    socket.on('auto-search-scheduled', ({ delay }) => {
      startCountdown(Math.ceil(delay / 1000));
    });

    socket.on('auto-search-cancelled', () => {
      setAutoSearchCountdown(null);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    });

    socket.on('disconnect', () => {
      cleanupConnection();
      setSearching(false);
    });

    return () => {
      cleanupConnection();
      socket.disconnect();
    };
  }, []);

  // Initialize WebRTC
  const initializeWebRTC = async (partnerSocketId, iceServers) => {
    try {
      setConnectionState('connecting');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true
      });
      
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection(iceServers || ICE_SERVERS);
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setSearching(false);
          setConnectionState('connected');
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit('ice-candidate', {
            targetId: partnerSocketId,
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          handlePartnerDisconnect();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socketRef.current?.emit('offer', {
        targetId: partnerSocketId,
        offer
      });

    } catch (error) {
      console.error('WebRTC error:', error);
      setConnectionState('disconnected');
    }
  };

  const handleOffer = async (offer, fromId) => {
    try {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socketRef.current?.emit('answer', { targetId: fromId, answer });
    } catch (error) {
      console.error('Offer handling error:', error);
    }
  };

  const handleAnswer = async (answer) => {
    try {
      const pc = peerConnectionRef.current;
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (error) {
      console.error('Answer handling error:', error);
    }
  };

  const handleIceCandidate = async (candidate) => {
    try {
      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('ICE candidate error:', error);
    }
  };

  // Countdown for auto-search
  const startCountdown = (seconds) => {
    setAutoSearchCountdown(seconds);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    
    countdownTimerRef.current = setInterval(() => {
      setAutoSearchCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Cleanup
  const cleanupConnection = () => {
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
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }
    setConnectionState('disconnected');
    setPartner(null);
  };

  const handlePartnerDisconnect = () => {
    cleanupConnection();
    setSearching(true);
    // Auto rejoin after delay
    setTimeout(() => {
      socketRef.current?.emit('join-random');
    }, 2000);
  };

  // Actions
  const handleToggleAudio = useCallback(() => {
    setAudioEnabled(prev => {
      const newState = !prev;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => track.enabled = newState);
      }
      if (currentRoomRef.current) {
        socketRef.current?.emit('media-state', {
          roomId: currentRoomRef.current,
          audioEnabled: newState,
          videoEnabled
        });
      }
      return newState;
    });
  }, [videoEnabled]);

  const handleToggleVideo = useCallback(() => {
    setVideoEnabled(prev => {
      const newState = !prev;
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => track.enabled = newState);
      }
      if (currentRoomRef.current) {
        socketRef.current?.emit('media-state', {
          roomId: currentRoomRef.current,
          audioEnabled,
          videoEnabled: newState
        });
      }
      return newState;
    });
  }, [audioEnabled]);

  const handleSkip = useCallback(() => {
    if (isSkipping) return;
    setIsSkipping(true);
    
    if (currentRoomRef.current) {
      socketRef.current?.emit('skip', { roomId: currentRoomRef.current });
    } else {
      socketRef.current?.emit('join-random');
      setIsSkipping(false);
    }
  }, [isSkipping]);

  const handleFindRandomPeer = useCallback(() => {
    socketRef.current?.emit('join-random');
  }, []);

  const handleLeave = useCallback(() => {
    if (currentRoomRef.current) {
      socketRef.current?.emit('leave-chat', { roomId: currentRoomRef.current });
    }
    cleanupConnection();
    onLeave();
  }, [onLeave]);

  const handleCancelAutoSearch = useCallback(() => {
    socketRef.current?.emit('cancel-auto-search');
    setAutoSearchCountdown(null);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
  }, []);

  const handleBlurToggle = useCallback(async (blurState) => {
    setIsBlurred(blurState);
  }, []);

  // UI auto-hide
  useEffect(() => {
    if (!uiVisible) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    return () => clearTimeout(hideTimerRef.current);
  }, [uiVisible]);

  useEffect(() => {
    const resetTimer = () => {
      if (!uiVisible) setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    };

    const events = ['mousemove', 'touchstart', 'touchmove', 'scroll', 'keydown'];
    events.forEach(event => window.addEventListener(event, resetTimer));

    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      clearTimeout(hideTimerRef.current);
    };
  }, [uiVisible]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.target.matches('input, textarea, [contenteditable]')) return;
      
      switch(e.key) {
        case 'm': handleToggleAudio(); break;
        case 'v': handleToggleVideo(); break;
        case 'n': handleSkip(); break;
        case 'b': setShowBlurConfirm(true); break;
        case 'Escape': setShowBlurConfirm(false); break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleToggleAudio, handleToggleVideo, handleSkip]);

  // Ban screen
  if (banInfo) {
    return (
      <div className={styles.container}>
        <div className={styles.partnerCameraOff}>
          <Shield size={64} className={styles.cameraOffIconLarge} />
          <h2 className={styles.partnerCameraOffTitle}>Device Banned</h2>
          <p className={styles.partnerCameraOffText}>{banInfo.reason}</p>
          {banInfo.expiresAt && (
            <p className={styles.cameraOffSubtext}>
              Expires: {new Date(banInfo.expiresAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    );
  }

  const isRemoteConnected = !!partner && connectionState === 'connected';
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  return (
    <div className={styles.container} role="main" aria-label="Video call screen">
      {/* Background Effects */}
      <div className={styles.gradientOrb1} aria-hidden="true" />
      <div className={styles.gradientOrb2} aria-hidden="true" />
      <div className={styles.noiseLayer} aria-hidden="true" />
      
      {/* Floating elements */}
      <div className={styles.floatingElements}>
        <Heart className={styles.floatHeart1} size={16} aria-hidden="true" />
        <Heart className={styles.floatHeart2} size={12} aria-hidden="true" />
        <Sparkles className={styles.floatSparkle1} size={14} aria-hidden="true" />
        <Sparkles className={styles.floatSparkle2} size={18} aria-hidden="true" />
      </div>

      {/* REMOTE VIDEO */}
      <div className={styles.remoteView}>
        <video
          ref={remoteVideoRef}
          className={`${styles.videoBase} ${searching ? styles.searchingBlur : ''} ${isBlurred ? styles.videoBlur : ''}`}
          autoPlay
          playsInline
          style={{ display: isRemoteConnected && !isPartnerVideoOff ? 'block' : 'none' }}
          aria-label="Remote video stream"
        />

        {isBlurred && isRemoteConnected && !isPartnerVideoOff && (
          <div className={styles.blurIndicator} role="status">
            <EyeOff size={14} />
            <span>Video blurred</span>
          </div>
        )}

        {isRemoteConnected && isPartnerVideoOff && (
          <div className={styles.partnerCameraOff}>
            <VideoOff size={40} className={styles.cameraOffIconLarge} />
            <h3 className={styles.partnerCameraOffTitle}>Camera off</h3>
            <p className={styles.partnerCameraOffText}>
              {partner?.name || 'Your match'} turned their camera off
            </p>
            <div className={styles.cameraOffStatus}>
              <span className={styles.statusDot} />
              Audio still connected
            </div>
          </div>
        )}

        {isRemoteConnected && isPartnerMuted && (
          <div className={`${styles.statusChip} ${styles.chipLeft}`} role="status">
            <VolumeX size={13} />
            <span>Their mic is off</span>
          </div>
        )}

        {!isRemoteConnected && !searching && (
          <div className={styles.placeholder}>
            <div className={styles.logoWrapper}>
              <div className={styles.logoGlow} />
              <div className={styles.brandText}>Orey!</div>
            </div>
            <div className={styles.waitingText}>
              <Sparkles size={16} className={styles.sparkleIcon} />
              Ready to meet someone new?
            </div>
            <div className={styles.loadingDots}>
              <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
            </div>
          </div>
        )}
      </div>

      {/* LOCAL VIDEO */}
      <div className={styles.localView}>
        <video
          ref={localVideoRef}
          className={`${styles.videoBase} ${styles.mirrored}`}
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
          aria-label="Local video stream"
        />

        {!audioEnabled && (
          <div className={`${styles.statusChip} ${styles.chipRight}`} role="status">
            <MicOff size={13} />
            <span>Your mic is off</span>
          </div>
        )}

        {!videoEnabled && (
          <div className={styles.localCameraOff}>
            <VideoOff size={28} className={styles.cameraOffIconSmall} />
            <span className={styles.cameraOffText}>Camera off</span>
            <p className={styles.cameraOffSubtext}>Turn on to share your vibe</p>
          </div>
        )}
      </div>

      {/* CONTROL BAR */}
      <div
        className={`${styles.controlBar} ${!uiVisible ? styles.controlBarHidden : ''}`}
        onClick={e => e.stopPropagation()}
        role="toolbar"
        aria-label="Call controls"
      >
        <div className={styles.cluster}>
          <button
            onClick={handleToggleAudio}
            className={`${styles.iconBtn} ${!audioEnabled ? styles.iconBtnDanger : ''}`}
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={!audioEnabled}
          >
            <span className={styles.iconWrap}>
              {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </span>
            <span className={styles.btnLabel}>{audioEnabled ? 'Mute' : 'Unmute'}</span>
          </button>

          <button
            onClick={handleToggleVideo}
            className={`${styles.iconBtn} ${!videoEnabled ? styles.iconBtnDanger : ''}`}
            aria-label={videoEnabled ? 'Stop video' : 'Start video'}
            aria-pressed={!videoEnabled}
          >
            <span className={styles.iconWrap}>
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </span>
            <span className={styles.btnLabel}>{videoEnabled ? 'Camera' : 'No cam'}</span>
          </button>
        </div>

        <button
          onClick={handleSkip}
          disabled={isSkipping}
          className={styles.nextPill}
          aria-label={isSkipping ? 'Finding next match' : 'Skip to next match'}
        >
          {isSkipping ? (
            <>
              <Loader size={17} className={styles.spinner} />
              <span>Finding…</span>
            </>
          ) : (
            <>
              <SkipForward size={17} />
              <span>Next</span>
            </>
          )}
        </button>

        <div className={styles.cluster}>
          <button
            onClick={() => setShowBlurConfirm(true)}
            className={`${styles.iconBtn} ${isBlurred ? styles.iconBtnActive : ''}`}
            aria-label={isBlurred ? 'Remove video blur' : 'Blur video'}
            aria-pressed={isBlurred}
          >
            <span className={styles.iconWrap}>
              {isBlurred ? <Eye size={18} /> : <EyeOff size={18} />}
            </span>
            <span className={styles.btnLabel}>{isBlurred ? 'Unblur' : 'Blur'}</span>
          </button>

          <button
            onClick={handleLeave}
            className={styles.endBtn}
            aria-label="End call"
          >
            <span className={styles.iconWrap}>
              <PhoneOff size={18} />
            </span>
            <span className={styles.btnLabel}>End</span>
          </button>
        </div>
      </div>

      {/* BLUR CONFIRMATION MODAL */}
      {showBlurConfirm && (
        <div 
          className={styles.modalOverlay} 
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.modal}>
            <div className={styles.modalIcon}>
              {isBlurred ? <Eye size={28} /> : <EyeOff size={28} />}
            </div>
            <h2 className={styles.modalTitle}>
              {isBlurred ? 'Remove video blur?' : 'Blur your video?'}
            </h2>
            <p className={styles.modalText}>
              {isBlurred 
                ? 'The other person will be able to see you clearly again.'
                : 'The other person will see a blurred version of your video.'}
            </p>
            <div className={styles.modalActions}>
              <button 
                onClick={() => setShowBlurConfirm(false)} 
                className={styles.modalCancelBtn}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleBlurToggle(!isBlurred);
                  setShowBlurConfirm(false);
                }}
                className={styles.modalConfirmBtn}
              >
                {isBlurred ? 'Remove Blur' : 'Apply Blur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay} role="alert" aria-live="polite">
          <div className={styles.overlayGradient} />
          {autoSearchCountdown !== null ? (
            <div className={styles.countdownOverlay}>
              <div className={styles.countdownText}>{autoSearchCountdown}</div>
              <div className={styles.encryptionBadge}>
                <Shield size={15} className={styles.shieldIcon} />
                <span className={styles.encryptionText}>Secure connection ready</span>
              </div>
              <button onClick={handleCancelAutoSearch} className={styles.terminateBtn}>
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.searchingOverlay}>
              <div className={styles.orbitingHearts}>
                <div className={styles.orbitRing}>
                  <Heart size={16} className={styles.orbitHeart1} fill="currentColor" />
                  <Heart size={12} className={styles.orbitHeart2} fill="currentColor" />
                  <Heart size={14} className={styles.orbitHeart3} fill="currentColor" />
                </div>
                <div className={styles.spinnerCenter}>
                  <Loader size={30} className={styles.spinnerIcon} />
                </div>
              </div>
              <div className={styles.searchingTextContainer}>
                <div className={styles.synchronizingText}>Looking for your match</div>
                <p className={styles.searchingSubtext}>
                  Someone great is just around the corner…
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallScreen;
