
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Loader, 
  ShieldCheck, Layers
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! Pro — Call Screen Component
 * Logic and structure for the peer-to-peer video interface.
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
  onFindRandomPeer = () => {},
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [nextHovered, setNextHovered] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const mouseMoveTimerRef = useRef(null);
  const wsRef = useRef(null);

  const isPartnerVideoEnabled = partnerMedia?.video !== false;
  const isPartnerAudioEnabled = partnerMedia?.audio !== false;
  const isRemoteConnected = partner && isPartnerVideoEnabled;

  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket('wss://your-server.com/signaling');
        wsRef.current = ws;
        ws.onopen = () => ws.send(JSON.stringify({ type: 'register', status: 'available' }));
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'peer-found') setConnectionStatus('connecting');
          if (data.type === 'peer-connected') { 
            setConnectionStatus('connected'); 
            setIsConnecting(false); 
          }
        };
        ws.onclose = () => setTimeout(connectWebSocket, 3000);
      } catch (e) {}
    };
    connectWebSocket();
    return () => wsRef.current?.close();
  }, []);

  const handleNext = useCallback(() => {
    if (isConnecting || connectionStatus === 'connecting') return;
    setIsConnecting(true);
    setConnectionStatus('searching');
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'find-random-peer', timestamp: Date.now() }));
    }
    onFindRandomPeer?.();
    setTimeout(() => {
      setConnectionStatus('connecting');
      setTimeout(() => {
        setConnectionStatus('connected');
        setIsConnecting(false);
        onSkip?.();
      }, 1500);
    }, 3000);
  }, [isConnecting, connectionStatus, onFindRandomPeer, onSkip]);

  useEffect(() => {
    const handleInteraction = () => {
      setUiVisible(true);
      clearTimeout(mouseMoveTimerRef.current);
      mouseMoveTimerRef.current = setTimeout(() => setUiVisible(false), 5000);
    };
    window.addEventListener('mousemove', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    return () => {
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.grainOverlay} />
      
      {/* REMOTE FEED */}
      <div className={`${styles.remotePanel} ${searching ? styles.searchingBlur : ''}`}>
        <video
          ref={remoteVideoRef}
          className={styles.videoStream}
          autoPlay playsInline
          style={{ display: isRemoteConnected ? 'block' : 'none' }}
        />
        {!isRemoteConnected && (
          <div className={styles.brandingCenter}>
            <div className={styles.brandTextMain}>OREY!</div>
          </div>
        )}
        {partner && !isPartnerAudioEnabled && (
          <div className="absolute top-6 left-6 z-40 p-2.5 bg-red-500/10 backdrop-blur-xl rounded-2xl border border-red-500/20 text-red-500">
            <MicOff size={16} />
          </div>
        )}
      </div>

      {/* LOCAL FEED */}
      <div className={styles.localPanel}>
        <video
          ref={localVideoRef}
          className={`${styles.videoStream} ${styles.mirrored} ${isBlurred ? styles.blurred : ''}`}
          autoPlay playsInline muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />
        {!videoEnabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f]">
            <VideoOff size={48} className="text-white/5" />
          </div>
        )}
      </div>

      {/* FLOATING CONTROL ISLAND */}
      <div className={`${styles.controlWrapper} ${!uiVisible ? styles.uiHidden : ''}`}>
        <div className={styles.statusBadge}>
          <div className={`${styles.statusDot} ${isRemoteConnected ? styles.dotActive : ''}`} />
          <span className={styles.statusText}>
            {isRemoteConnected ? `Live Session • ${roomId}` : 'Mesh Offline'}
          </span>
        </div>

        <div className={styles.controlIsland}>
          <div className="flex items-center gap-1">
            <button 
              onClick={onToggleVideo}
              className={`${styles.btnRound} ${!videoEnabled ? styles.btnDanger : ''}`}
            >
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button 
              onClick={onToggleAudio}
              className={`${styles.btnRound} ${!audioEnabled ? styles.btnDanger : ''}`}
            >
              {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
          </div>

          <button 
            onClick={handleNext} 
            disabled={isConnecting}
            onMouseEnter={() => setNextHovered(true)}
            onMouseLeave={() => setNextHovered(false)}
            className={styles.btnNext}
          >
            {isConnecting ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <Zap size={16} className={nextHovered ? "fill-current" : ""} />
            )}
            <span>{isConnecting ? 'Wait' : 'Next'}</span>
          </button>

          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsBlurred(!isBlurred)}
              className={`${styles.btnRound} ${isBlurred ? "bg-white/10 text-white" : ""}`}
            >
              <Layers size={18} />
            </button>
            <button onClick={onLeave} className={`${styles.btnRound} ${styles.btnDanger}`}>
              <PhoneOff size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.fullOverlay}>
          <div className="w-full flex flex-col items-center">
            {autoSearchCountdown !== null ? (
              <>
                <div className={styles.countdownText}>{autoSearchCountdown}</div>
                <p className="text-[10px] font-black tracking-[1em] text-[#ff2d55] uppercase mb-12">Handshake Init</p>
                <button onClick={onCancelAutoSearch} className={styles.abortBtn}>Abort</button>
              </>
            ) : (
              <>
                <div className="text-3xl font-black italic text-white/5 tracking-[0.5em] mb-8">SCANNING</div>
                <Loader size={32} className="text-[#ff2d55] animate-spin" />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CallScreen;

