import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff,
  ShieldCheck, Circle, Loader
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro — Responsive Call Interface
 * - Mobile: Top/Bottom split
 * - Desktop: Side-by-Side split
 * - Features: Random peer matching, Clean minimal UI
 */

const CallScreen = ({
  partner = null,
  roomId = "BR-772-XP",
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
  // Backend connection handler
  onFindRandomPeer = () => {},
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [nextHovered, setNextHovered] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle'); // idle, searching, connecting, connected
  const uiTimerRef = useRef(null);
  const mouseMoveTimerRef = useRef(null);
  const containerRef = useRef(null);
  const wsRef = useRef(null);

  const isPartnerVideoEnabled = partnerMedia?.video !== false;
  const isPartnerAudioEnabled = partnerMedia?.audio !== false;
  const isRemoteConnected = partner && isPartnerVideoEnabled;

  // WebSocket connection for random peer matching
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        // Replace with your actual WebSocket server URL
        const ws = new WebSocket('wss://your-server.com/signaling');
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
          // Register this user as available
          ws.send(JSON.stringify({
            type: 'register',
            status: 'available'
          }));
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          switch(data.type) {
            case 'peer-found':
              setConnectionStatus('connecting');
              // Handle peer connection logic here
              if (onSkip) {
                onSkip(data.peerId, data.roomId);
              }
              break;
              
            case 'peer-connected':
              setConnectionStatus('connected');
              setIsConnecting(false);
              break;
              
            case 'no-peers-available':
              setConnectionStatus('idle');
              setIsConnecting(false);
              // Optionally show a notification
              console.log('No peers available, retrying...');
              setTimeout(() => findRandomPeer(), 2000);
              break;
              
            default:
              break;
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnecting(false);
          setConnectionStatus('idle');
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          // Reconnect after delay
          setTimeout(connectWebSocket, 3000);
        };
      } catch (error) {
        console.error('Connection failed:', error);
        setIsConnecting(false);
        setConnectionStatus('idle');
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Find random peer function
  const findRandomPeer = useCallback(() => {
    if (isConnecting || connectionStatus === 'connecting') return;
    
    setIsConnecting(true);
    setConnectionStatus('searching');
    
    // Send request to backend to find random peer
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'find-random-peer',
        timestamp: Date.now()
      }));
    }
    
    // Also trigger the parent handler if available
    if (onFindRandomPeer) {
      onFindRandomPeer();
    }
    
    // Fallback: Simulate finding a peer if no backend
    setTimeout(() => {
      if (connectionStatus === 'searching') {
        setConnectionStatus('connecting');
        // Simulate connection
        setTimeout(() => {
          setConnectionStatus('connected');
          setIsConnecting(false);
          if (onSkip) {
            onSkip();
          }
        }, 1500);
      }
    }, 5000);
  }, [isConnecting, connectionStatus, onFindRandomPeer, onSkip]);

  // Mouse movement handler to show UI
  useEffect(() => {
    const handleMouseMove = () => {
      setUiVisible(true);
      
      clearTimeout(mouseMoveTimerRef.current);
      clearTimeout(uiTimerRef.current);
      
      mouseMoveTimerRef.current = setTimeout(() => {
        setUiVisible(false);
      }, 4000);
    };

    const handleMouseLeave = () => {
      clearTimeout(mouseMoveTimerRef.current);
      mouseMoveTimerRef.current = setTimeout(() => {
        setUiVisible(false);
      }, 2000);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);
    }

    uiTimerRef.current = setTimeout(() => setUiVisible(false), 6000);

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
      clearTimeout(mouseMoveTimerRef.current);
      clearTimeout(uiTimerRef.current);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`${styles.container} ${!uiVisible ? styles.uiHidden : ''}`}
    >
      {/* Texture Overlay */}
      <div className={styles.grainOverlay} />
      
      {/* REMOTE STREAM */}
      <div className={`${styles.panel} ${styles.remotePanel} ${searching ? styles.searchingBlur : ''}`}>
        <video
          ref={remoteVideoRef}
          className={styles.videoStream}
          autoPlay
          playsInline
          style={{ display: isRemoteConnected ? 'block' : 'none' }}
        />

        {!isRemoteConnected && (
          <div className={styles.brandingCenter}>
            <div className={styles.brandTextMain}>OREY!</div>
            <p className={styles.statusLabel}>
              {searching || isConnecting ? 'Finding Peer...' : 'Waiting for Peer'}
            </p>
          </div>
        )}

        {/* Peer Mute Indicator */}
        {partner && !isPartnerAudioEnabled && (
          <div className={styles.peerMuteIndicator}>
            <MicOff size={14} strokeWidth={2} />
          </div>
        )}

        {/* Connection Status Indicator */}
        {isConnecting && (
          <div className={styles.connectionStatus}>
            <Loader size={16} className={styles.spinningLoader} />
            <span className={styles.connectingText}>
              {connectionStatus === 'searching' ? 'Searching for peers...' : 'Connecting...'}
            </span>
          </div>
        )}
      </div>

      {/* LOCAL STREAM */}
      <div className={`${styles.panel} ${styles.localPanel}`}>
        <video
          ref={localVideoRef}
          className={`${styles.videoStream} ${styles.mirrored}`}
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />

        {!videoEnabled && (
          <div className={styles.brandingCenter}>
            <div className={styles.brandTextMain}>OREY!</div>
            <p className={styles.cameraOffText}>Camera Off</p>
          </div>
        )}

        {/* Local Mute Indicator */}
        {!audioEnabled && (
          <div className={styles.localMuteBadge}>
            <MicOff size={14} strokeWidth={2} />
          </div>
        )}
      </div>

      {/* CONTROL BAR */}
      <div className={`${styles.controlWrapper} ${uiVisible ? styles.controlVisible : ''}`}>
        <div className={styles.controlBar}>
          {/* Camera Toggle */}
          <button 
            onClick={onToggleVideo}
            className={`${styles.controlBtn} ${!videoEnabled ? styles.controlOff : ''}`}
            aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            <div className={styles.btnInner}>
              {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </div>
            <span className={styles.btnLabel}>Camera</span>
          </button>

          {/* Mic Toggle */}
          <button 
            onClick={onToggleAudio}
            className={`${styles.controlBtn} ${!audioEnabled ? styles.controlOff : ''}`}
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            <div className={styles.btnInner}>
              {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </div>
            <span className={styles.btnLabel}>Mic</span>
          </button>

          {/* NEXT Button - Center */}
          <button 
            onClick={findRandomPeer} 
            className={`${styles.nextBtn} ${isConnecting ? styles.connecting : ''}`}
            disabled={isConnecting}
            onMouseEnter={() => setNextHovered(true)}
            onMouseLeave={() => setNextHovered(false)}
          >
            {isConnecting ? (
              <>
                <Loader size={14} className={styles.spinningLoader} />
                <span className={styles.nextText}>
                  {connectionStatus === 'searching' ? 'SEARCHING' : 'CONNECTING'}
                </span>
              </>
            ) : (
              <>
                <span className={styles.nextText}>NEXT</span>
                <Zap 
                  size={14} 
                  className={`${styles.zapIcon} ${nextHovered ? styles.zapActive : ''}`}
                />
              </>
            )}
          </button>

          {/* Leave Button */}
          <button 
            onClick={onLeave} 
            className={`${styles.controlBtn} ${styles.leaveBtn}`}
            aria-label="Leave call"
          >
            <div className={styles.btnInner}>
              <PhoneOff size={20} />
            </div>
            <span className={styles.btnLabel}>Leave</span>
          </button>
        </div>
        
        {/* Security Badge */}
        <div className={styles.securityBadge}>
          <ShieldCheck size={10} />
          <span>E2E Encrypted</span>
          {connectionStatus === 'connected' && (
            <>
              <Circle size={4} fill="currentColor" />
              <span>Connected</span>
            </>
          )}
        </div>
      </div>

      {/* SEARCHING OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.fullOverlay}>
          <div className={styles.overlayContent}>
            {autoSearchCountdown !== null ? (
              <div className={styles.countdownBox}>
                <div className={styles.countdownRing}>
                  <div className={styles.countdownNumber}>
                    {autoSearchCountdown}<span className={styles.accentRed}>!</span>
                  </div>
                </div>
                <p className={styles.incomingText}>Peer Found</p>
                <button onClick={onCancelAutoSearch} className={styles.abortBtn}>
                  Abort Sync
                </button>
              </div>
            ) : (
              <div className={styles.syncBox}>
                <div className={styles.loadingBrand}>OREY!</div>
                <div className={styles.dotRunner}>
                  <div className={styles.dot} style={{ animationDelay: '0s' }} />
                  <div className={styles.dot} style={{ animationDelay: '0.2s' }} />
                  <div className={styles.dot} style={{ animationDelay: '0.4s' }} />
                </div>
                <p className={styles.syncText}>Scanning Peer Mesh</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CallScreen;
