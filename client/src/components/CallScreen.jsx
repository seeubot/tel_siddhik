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

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleFindNext = () => {
    setIsConnecting(true);
    setHasPartner(false);
    setTimeout(() => {
      setIsConnecting(false);
      setHasPartner(true);
    }, 1800);
  };

  const handleDisconnect = () => {
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
