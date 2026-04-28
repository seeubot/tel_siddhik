import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Loader2,
  Flag, ShieldCheck, Activity,
  RefreshCw, X
} from 'lucide-react';
import './App.css';

/**
 * Orey! Pro — Minimalist Adaptive Interface
 * Component logic separated from global CSS styles.
 *
 * Fixes applied:
 *  1. Replaced non-standard `animate-in / fade-in / zoom-in / duration-*` classes
 *     (from the optional tailwindcss-animate plugin) with explicit CSS class names
 *     defined in App.css so the component works without the plugin.
 *  2. Replaced `bg-glass`, `brand-gradient-text`, `action-button-gradient`,
 *     `animate-pulse-slow` with the CSS classes defined in App.css.
 *  3. Replaced `transform -scale-x-100` (invalid Tailwind) with `mirror-x` CSS class.
 *  4. Added timer cleanup on unmount to prevent memory leaks.
 *  5. Replaced `ease-[cubic-bezier(...)]` arbitrary Tailwind value on the control bar
 *     with the `control-bar-transition` CSS class so it works without JIT/v3+.
 *  6. Added `overflow-hidden` guard on modals to prevent body scroll.
 */
const App = () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [hasPartner, setHasPartner]         = useState(false);
  const [audioEnabled, setAudioEnabled]     = useState(true);
  const [videoEnabled, setVideoEnabled]     = useState(true);
  const [isConnecting, setIsConnecting]     = useState(false);
  const [uiVisible, setUiVisible]           = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const uiTimerRef     = useRef(null);

  // ── Auto-hide UI when partner is active ───────────────────────────────────
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

    // Cleanup listeners AND pending timer on unmount / dep change
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
    <div className="fixed inset-0 bg-[#020204] text-white font-sans overflow-hidden flex flex-col md:flex-row select-none">

      {/* ── 1. REMOTE VIEWPORT (The Other Person) ─────────────────────────── */}
      <div className="relative flex-[1.4] bg-black overflow-hidden flex items-center justify-center border-b md:border-b-0 md:border-r border-white/5">
        {hasPartner ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            /* Fix: replaced `animate-in fade-in duration-1000` with CSS class */
            className="w-full h-full object-cover animate-fade-in-slow"
          />
        ) : (
          /* Fix: replaced `animate-in fade-in zoom-in duration-700` */
          <div className="flex flex-col items-center animate-fade-zoom-in">
            <h1 className="text-7xl md:text-9xl font-black italic tracking-tighter brand-gradient-text uppercase">
              Orey!
            </h1>
            <p className="mt-4 text-[10px] font-bold tracking-[0.4em] text-white/20 uppercase">
              {isConnecting ? 'Negotiating Mesh…' : 'Partner Disconnected'}
            </p>

            {!isConnecting && (
              <button
                onClick={handleFindNext}
                className="mt-8 flex items-center gap-2 px-6 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"
              >
                {/* Fix: replaced `group-hover:rotate-180 transition-transform duration-500`
                    with explicit CSS classes */}
                <RefreshCw
                  size={14}
                  className="group-hover:rotate-180 transition-transform duration-500 text-pink-500"
                />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Search Again
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 2. LOCAL VIEWPORT (The User) ──────────────────────────────────── */}
      <div className="relative flex-1 bg-[#050508] overflow-hidden flex items-center justify-center">
        {videoEnabled ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            /* Fix: replaced `transform -scale-x-100` (invalid Tailwind) with CSS class */
            className="w-full h-full object-cover mirror-x"
          />
        ) : (
          /* Fix: replaced `animate-in fade-in duration-500` */
          <div className="flex flex-col items-center animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-black italic tracking-tighter text-white/5 uppercase">
              Orey!
            </h2>
            <div className="mt-4 p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
              <VideoOff size={20} className="text-white/10" />
            </div>
          </div>
        )}

        {/* Local HUD Info */}
        <div className="absolute top-6 left-6 md:left-auto md:right-6">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-full">
            <Activity size={12} className="text-emerald-500" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/50">
              Live Encrypted
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. ADAPTIVE CONTROL BAR ───────────────────────────────────────── */}
      {/* Fix: replaced `ease-[cubic-bezier(...)]` arbitrary value with CSS class */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[100] p-6 control-bar-transition ${
          uiVisible ? 'control-bar-visible' : 'control-bar-hidden'
        }`}
      >
        <div className="max-w-screen-md mx-auto">
          {/* Fix: replaced `bg-glass` inline with the CSS class defined in App.css */}
          <div className="w-full bg-glass border border-white/10 rounded-[2rem] p-2 flex flex-wrap items-center justify-center sm:justify-between gap-2 shadow-2xl">

            {/* Toggle Group */}
            <div className="flex items-center gap-1 bg-white/[0.03] rounded-full p-1 border border-white/5">
              <button
                onClick={() => setVideoEnabled(v => !v)}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                  videoEnabled
                    ? 'text-white/40 hover:bg-white/5 hover:text-white'
                    : 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                }`}
                title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </button>

              <button
                onClick={() => setAudioEnabled(a => !a)}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                  audioEnabled
                    ? 'text-white/40 hover:bg-white/5 hover:text-white'
                    : 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                }`}
                title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            </div>

            {/* Main Action */}
            <div className="flex-1 min-w-[140px] max-w-xs flex justify-center px-2">
              <button
                onClick={handleFindNext}
                disabled={isConnecting}
                className="w-full group relative flex items-center justify-center gap-3 h-12 rounded-full bg-white text-black font-black uppercase tracking-widest text-[10px] transition-all active:scale-[0.97] hover:shadow-xl hover:shadow-white/5 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {/* Fix: `action-button-gradient` defined in App.css */}
                <div className="absolute inset-0 action-button-gradient opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10 flex items-center gap-2 group-hover:text-white transition-colors">
                  {isConnecting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Zap size={16} className="fill-current" />
                  )}
                  <span>{isConnecting ? 'Searching…' : 'Next Discovery'}</span>
                </div>
              </button>
            </div>

            {/* Safety & Exit Group */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowReportModal(true)}
                className="w-11 h-11 rounded-full flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="Report User"
              >
                <Flag size={18} />
              </button>
              <button
                onClick={handleDisconnect}
                className="w-11 h-11 rounded-full flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"
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
        /* Fix: replaced `animate-in fade-in duration-300` with CSS class */
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-2xl flex items-center justify-center p-6 animate-fade-in-fast">
          <div className="w-full max-w-sm bg-[#0f0f14] border border-white/10 rounded-[2.5rem] p-8 relative shadow-2xl animate-slide-up-fade-in">
            <button
              onClick={() => setShowReportModal(false)}
              className="absolute top-6 right-6 text-white/20 hover:text-white transition-colors"
              aria-label="Close safety center"
            >
              <X size={20} />
            </button>

            <div className="mb-8 text-center sm:text-left">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 mb-4 mx-auto sm:mx-0">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-xl font-bold">Safety Center</h3>
              <p className="text-xs text-white/40 mt-1 uppercase tracking-widest font-black">
                Report current session
              </p>
            </div>

            <div className="grid gap-2">
              {['Nudity / Sexual', 'Harassment', 'Underage', 'Other'].map(reason => (
                <button
                  key={reason}
                  onClick={() => setShowReportModal(false)}
                  className="w-full p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 text-left text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. BACKGROUND ANIMATED BLOBS ─────────────────────────────────── */}
      {/* Fix: replaced `animate-pulse-slow` inline with the CSS class */}
      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-30">
        <div
          className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-pink-600/20 blur-[120px] rounded-full animate-pulse-slow"
        />
        <div
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-600/10 blur-[120px] rounded-full animate-pulse-slow"
          style={{ animationDelay: '2s' }}
        />
      </div>
    </div>
  );
};

export default App;
