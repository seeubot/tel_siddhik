import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Loader2,
  Flag, ShieldCheck, Activity,
  RefreshCw, X
} from 'lucide-react';
import './CallScreen.css';

/**
 * Orey! Pro — Minimalist Adaptive Interface
 *
 * REWRITE REASON: Tailwind CSS was not loading in the build environment,
 * causing a completely broken, unstyled layout. All Tailwind utility classes
 * have been removed and replaced with semantic CSS class names (prefixed `cs-`)
 * that are fully defined in CallScreen.css. The component now works with zero
 * dependency on Tailwind or any CSS framework.
 */
const CallScreen = () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [hasPartner, setHasPartner]           = useState(false);
  const [audioEnabled, setAudioEnabled]       = useState(true);
  const [videoEnabled, setVideoEnabled]       = useState(true);
  const [isConnecting, setIsConnecting]       = useState(false);
  const [uiVisible, setUiVisible]             = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const uiTimerRef     = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);

  // ── Initialize local media stream ───────────────────────────────────────
  useEffect(() => {
    const startLocalStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        localStreamRef.current = stream;
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing media devices:', error);
        setVideoEnabled(false);
        setAudioEnabled(false);
      }
    };

    startLocalStream();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  // ── Handle video toggle ────────────────────────────────────────────────
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = videoEnabled;
      });
    }
  }, [videoEnabled]);

  // ── Handle audio toggle ────────────────────────────────────────────────
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = audioEnabled;
      });
    }
  }, [audioEnabled]);

  // ── Auto-hide UI when a partner is connected ───────────────────────────────
  useEffect(() => {
    const handleActivity = () => {
      setUiVisible(true);
      clearTimeout(uiTimerRef.current);
      if (!showReportModal && hasPartner) {
        uiTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
      }
    };

    window.addEventListener('mousemove',  handleActivity);
    window.addEventListener('touchstart', handleActivity);

    return () => {
      window.removeEventListener('mousemove',  handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearTimeout(uiTimerRef.current);
    };
  }, [showReportModal, hasPartner]);

  // ── WebRTC: Create local loopback connection ────────────────────────────
  const setupLoopbackConnection = async () => {
    try {
      // Create RTCPeerConnection with proper configuration
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      peerConnectionRef.current = pc;

      // Add local tracks to the peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      // Handle incoming remote stream
      pc.ontrack = (event) => {
        console.log('Remote track received:', event);
        if (remoteVideoRef.current) {
          const [remoteStream] = event.streams;
          if (remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            console.log('Remote stream set successfully');
          }
        }
      };

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Create a new peer connection for the "remote" side (ourselves)
      const remotePc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      // Add the same local stream to remote peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          remotePc.addTrack(track, localStreamRef.current);
        });
      }

      // Set the remote description on the remote peer
      await remotePc.setRemoteDescription(pc.localDescription);

      // Create answer from remote peer
      const answer = await remotePc.createAnswer();
      await remotePc.setLocalDescription(answer);

      // Set the answer as remote description on local peer
      await pc.setRemoteDescription(remotePc.localDescription);

      // Handle ICE candidates for both peers
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          remotePc.addIceCandidate(new RTCIceCandidate(event.candidate))
            .catch(console.error);
        }
      };

      remotePc.onicecandidate = (event) => {
        if (event.candidate) {
          pc.addIceCandidate(new RTCIceCandidate(event.candidate))
            .catch(console.error);
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('Local PC connection state:', pc.connectionState);
      };

      remotePc.onconnectionstatechange = () => {
        console.log('Remote PC connection state:', remotePc.connectionState);
      };

      // Wait a bit for ICE candidates to be exchanged
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error('Error setting up loopback connection:', error);
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleFindNext = async () => {
    setIsConnecting(true);
    
    // Clean up previous connection if exists
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Clear remote video
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setHasPartner(false);

    try {
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 1800));
      
      // Setup loopback connection
      await setupLoopbackConnection();
      
      setHasPartner(true);
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Clear remote video
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setHasPartner(false);
    setIsConnecting(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="cs-screen">

      {/* ── 1. REMOTE VIEWPORT ────────────────────────────────────────────── */}
      <div className="cs-remote">
        {hasPartner ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="cs-remote-video"
          />
        ) : (
          <div className="cs-idle">
            <h1 className="cs-brand-title">Orey!</h1>
            <p className="cs-idle-subtitle">
              {isConnecting ? 'Negotiating Mesh…' : 'Partner Disconnected'}
            </p>
            {!isConnecting && (
              <button onClick={handleFindNext} className="cs-search-btn">
                <RefreshCw size={14} className="cs-search-icon" />
                <span>Search Again</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 2. LOCAL VIEWPORT ─────────────────────────────────────────────── */}
      <div className="cs-local">
        {videoEnabled ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="cs-local-video"
          />
        ) : (
          <div className="cs-cam-off">
            <h2 className="cs-cam-off-title">Orey!</h2>
            <div className="cs-cam-off-icon">
              <VideoOff size={20} />
            </div>
          </div>
        )}

        {/* HUD badge */}
        <div className="cs-hud">
          <div className="cs-hud-badge">
            <Activity size={12} className="cs-hud-dot" />
            <span className="cs-hud-label">Live Encrypted</span>
          </div>
        </div>
      </div>

      {/* ── 3. CONTROL BAR ────────────────────────────────────────────────── */}
      <div className={`cs-control-bar ${uiVisible ? 'cs-control-bar--visible' : 'cs-control-bar--hidden'}`}>
        <div className="cs-control-bar-inner">
          <div className="cs-control-panel">

            {/* Toggle group */}
            <div className="cs-toggle-group">
              <button
                onClick={() => setVideoEnabled(v => !v)}
                className={`cs-icon-btn ${!videoEnabled ? 'cs-icon-btn--muted' : ''}`}
                title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
              <button
                onClick={() => setAudioEnabled(a => !a)}
                className={`cs-icon-btn ${!audioEnabled ? 'cs-icon-btn--muted' : ''}`}
                title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            </div>

            {/* Main action */}
            <div className="cs-main-action">
              <button
                onClick={handleFindNext}
                disabled={isConnecting}
                className="cs-next-btn"
              >
                <div className="cs-next-btn-overlay" />
                <div className="cs-next-btn-content">
                  {isConnecting
                    ? <Loader2 size={16} className="cs-spin" />
                    : <Zap size={16} style={{ fill: 'currentColor' }} />
                  }
                  <span>{isConnecting ? 'Searching…' : 'Next Discovery'}</span>
                </div>
              </button>
            </div>

            {/* Safety & exit */}
            <div className="cs-safety-group">
              <button
                onClick={() => setShowReportModal(true)}
                className="cs-report-btn"
                title="Report User"
              >
                <Flag size={18} />
              </button>
              <button
                onClick={handleDisconnect}
                className="cs-end-btn"
                title="End Call"
              >
                <PhoneOff size={18} />
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ── 4. REPORT MODAL ───────────────────────────────────────────────── */}
      {showReportModal && (
        <div className="cs-modal-overlay">
          <div className="cs-modal-card">
            <button
              onClick={() => setShowReportModal(false)}
              className="cs-modal-close"
              aria-label="Close safety center"
            >
              <X size={20} />
            </button>

            <div className="cs-modal-header">
              <div className="cs-modal-icon">
                <ShieldCheck size={24} />
              </div>
              <h3 className="cs-modal-title">Safety Center</h3>
              <p className="cs-modal-subtitle">Report current session</p>
            </div>

            <div className="cs-report-options">
              {['Nudity / Sexual', 'Harassment', 'Underage', 'Other'].map(reason => (
                <button
                  key={reason}
                  className="cs-report-option"
                  onClick={() => setShowReportModal(false)}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. BACKGROUND BLOBS ───────────────────────────────────────────── */}
      <div className="cs-blobs">
        <div className="cs-blob cs-blob--pink" />
        <div className="cs-blob cs-blob--orange" />
      </div>

    </div>
  );
};

export default CallScreen;
