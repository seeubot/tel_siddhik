// Lobby.jsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy, Check, X,
  Power, Bell, Globe, ShieldCheck,
  SlidersHorizontal
} from 'lucide-react';
import './styles.css';

const MaleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="14" r="5" />
    <line x1="20" y1="4" x2="13.5" y2="10.5" />
    <line x1="20" y1="4" x2="16" y2="4" />
    <line x1="20" y1="4" x2="20" y2="8" />
  </svg>
);

const FemaleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5" />
    <line x1="12" y1="13" x2="12" y2="22" />
    <line x1="9" y1="18" x2="15" y2="18" />
    <line x1="7" y1="2" x2="17" y2="2" />
  </svg>
);

const LOVE_PICKUP_LINES = [
  "Are you a camera? Because every time I look at you, I smile.",
  "I'm not a photographer, but I can definitely picture us together.",
  "You must be a magician, because whenever I look at you, everyone else disappears.",
  "I'd say God Bless You, but it looks like He already did.",
  "Are you made of copper and tellurium? Because you're CuTe.",
  "I'm learning about important dates in history. Do you want to be one of them?",
  "If beauty were time, you'd be an eternity."
];

export default function App({
  oreyId = 'OREY-X7R2P',
  onDiscover = () => console.log("Discover triggered"),
  onCancelSearch = () => console.log("Search cancelled"),
  onConnectById = (id) => console.log("Connecting to", id),
  gender = null,
  onSetGender = (g) => console.log("Gender set to", g),
  notifications = [],
  unreadCount = 2,
  onViewNotifications = () => {},
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [showGenderSheet, setShowGenderSheet] = useState(false);
  const [showNotifSheet, setShowNotifSheet] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  
  // New states for connection button
  const [connectionStatus, setConnectionStatus] = useState('idle'); // 'idle' | 'connecting' | 'connected'
  const connectionTimerRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setLineIndex((prev) => (prev + 1) % LOVE_PICKUP_LINES.length);
    }, 4500);
    return () => {
      clearInterval(interval);
      if (connectionTimerRef.current) clearTimeout(connectionTimerRef.current);
    };
  }, []);

  const copyId = useCallback(() => {
    if (!oreyId || oreyId.includes('·')) return;
    navigator.clipboard.writeText(oreyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [oreyId]);

  const handleConnectToggle = useCallback(() => {
    if (connectionStatus === 'idle') {
      const trimmed = targetId.trim().toUpperCase();
      if (trimmed.length !== 5) return;
      
      setConnectionStatus('connecting');
      connectionTimerRef.current = setTimeout(() => {
        setConnectionStatus('connected');
        onConnectById('OREY-' + trimmed);
        setTargetId('');
      }, 3000);
    } else if (connectionStatus === 'connected') {
      setConnectionStatus('idle');
    }
  }, [connectionStatus, targetId, onConnectById]);

  const handleSlideToDiscover = useCallback(() => {
    setConnectionStatus('connecting');
    connectionTimerRef.current = setTimeout(() => {
      setConnectionStatus('connected');
      onDiscover();
    }, 3000);
  }, [onDiscover]);

  return (
    <div className="root">
      <div className="bgGradient">
        <div className="bgGlowTop" />
        <div className="bgGlowBottom" />
      </div>

      <div className="container">
        <header className="header">
          <div className="flex flex-col">
            <h1 className="logo">
              Orey<span className="logoAccent">!</span>
            </h1>
            <div className="styleContainer">
              <span className="styleLabel">DAILY SPARK:</span>
              <div className="h-10 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={lineIndex}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.3 }}
                    className="styleValue"
                  >
                    "{LOVE_PICKUP_LINES[lineIndex]}"
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          </div>

          <button
            onClick={() => { setShowNotifSheet(true); onViewNotifications(); }}
            className="bellBtn"
            aria-label="Notifications"
          >
            <Bell size={18} strokeWidth={2.5} />
            {unreadCount > 0 && <span className="bellBadge" />}
          </button>
        </header>

        <main className="main">
          {connectionStatus === 'idle' ? (
            <div className="flex flex-col items-center">
              {/* Slide to Discover Button */}
              <div className="relative mb-6">
                <button
                  onClick={handleSlideToDiscover}
                  className="slideDiscoverBtn"
                >
                  <span className="slideDiscoverText">Slide to Discover</span>
                  <div className="slideDiscoverArrow">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              </div>

              {/* Preferences Button */}
              <button onClick={() => setShowGenderSheet(true)} className="prefsBtn">
                <SlidersHorizontal size={14} />
                <span className="prefsLabel">
                  Looking for:{' '}
                  <span className="prefsValue">
                    {gender ? (gender === 'male' ? 'Males' : 'Females') : 'Anyone'}
                  </span>
                </span>
              </button>
            </div>
          ) : (
            <div className="searchingContent">
              {/* New Connection Button */}
              <div className="connectionBtnContainer">
                <button
                  onClick={handleConnectToggle}
                  disabled={connectionStatus === 'connecting'}
                  className={`connectionBtn ${
                    connectionStatus === 'idle' ? 'connectionIdle' : ''
                  } ${
                    connectionStatus === 'connecting' ? 'connectionLoading' : ''
                  } ${
                    connectionStatus === 'connected' ? 'connectionSuccess' : ''
                  }`}
                >
                  {/* Label Text Container */}
                  <div className="connectionLabelContainer">
                    <span className={`connectionLabelText ${
                      connectionStatus === 'connecting' ? 'labelExit' : 'labelVisible'
                    }`}>
                      {connectionStatus === 'idle' ? 'Connect' : 'Connected'}
                    </span>

                    <span className={`connectionLabelText connectionLoadingText ${
                      connectionStatus === 'connecting' ? 'labelVisible' : 'labelExit'
                    }`}>
                      Connecting...
                    </span>
                  </div>

                  {/* Icon Container */}
                  <div className="connectionIconContainer">
                    {/* Power Icon (Idle) */}
                    <div className={`connectionIcon transition-all duration-300 ${
                      connectionStatus === 'idle' ? 'iconVisible' : 'iconHidden'
                    }`}>
                      <Power className="w-5 h-5" strokeWidth={2.5} />
                    </div>

                    {/* Spinner (Connecting) */}
                    {connectionStatus === 'connecting' && (
                      <div className="connectionSpinner animate-fadeIn">
                        <div className="spinnerTrack" />
                        <div className="spinnerActive" />
                      </div>
                    )}

                    {/* Check Icon (Connected) */}
                    <div className={`connectionIcon transition-all duration-300 ${
                      connectionStatus === 'connected' ? 'iconVisible' : 'iconHidden'
                    }`}>
                      <Check className="w-6 h-6" strokeWidth={3} />
                    </div>
                  </div>
                </button>

                {connectionStatus === 'connected' && (
                  <p className="disconnectHint">
                    Tap to disconnect
                  </p>
                )}
              </div>

              {connectionStatus === 'connecting' && (
                <button
                  onClick={onCancelSearch}
                  className="cancelBtn"
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#f43f5e';
                    e.currentTarget.style.borderColor = 'rgba(244,63,94,0.3)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = '#64748b';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  }}
                >
                  Cancel Search
                </button>
              )}
            </div>
          )}
        </main>

        <footer className="footer">
          <div className="idRow">
            <div onClick={copyId} className="idBlock">
              <span className="idLabel">My Identity</span>
              <div className="idDisplay">
                <span className="idCode">{oreyId}</span>
                {copied
                  ? <Check size={18} style={{ color: '#34d399' }} />
                  : <Copy size={16} style={{ color: '#334155' }} />
                }
              </div>
            </div>
            <div className="flex flex-col items-end opacity-40">
              <ShieldCheck size={18} style={{ color: '#64748b' }} />
              <span style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.025em' }}>
                Private
              </span>
            </div>
          </div>

          <div className="connectCard">
            <span className="connectPrefix">OREY-</span>
            <input
              type="text"
              placeholder="ENTER PARTNER ID"
              maxLength={5}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value.toUpperCase().slice(0, 5))}
              className="connectInput"
              disabled={connectionStatus !== 'idle'}
            />
            <button
              onClick={handleConnectToggle}
              disabled={targetId.length !== 5 || connectionStatus !== 'idle'}
              className="connectBtn"
              style={{
                backgroundColor: targetId.length === 5 && connectionStatus === 'idle' ? '#2563eb' : 'rgba(255,255,255,0.05)',
                color: targetId.length === 5 && connectionStatus === 'idle' ? '#ffffff' : '#334155',
              }}
            >
              <Power size={20} />
            </button>
          </div>
        </footer>

        {/* Gender Selection Sheet */}
        <AnimatePresence>
          {showGenderSheet && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overlay"
              onClick={() => setShowGenderSheet(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="sheet"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="handle" />
                <h3 className="sheetTitle">
                  Discover Settings
                </h3>
                <div className="space-y-3">
                  {[
                    { id: 'male',   label: 'Males Only',     icon: <MaleIcon />,          color: '#60a5fa' },
                    { id: 'female', label: 'Females Only',   icon: <FemaleIcon />,        color: '#fb7185' },
                    { id: null,     label: 'Anyone (Global)',icon: <Globe size={18} />,   color: '#a78bfa' },
                  ].map((opt) => {
                    const active = gender === opt.id;
                    return (
                      <button
                        key={opt.id ?? 'any'}
                        onClick={() => { onSetGender(opt.id); setShowGenderSheet(false); }}
                        className={`genderOption ${active ? 'genderOptionActive' : ''}`}
                      >
                        <span style={{ color: active ? '#ffffff' : opt.color }}>{opt.icon}</span>
                        <span className="genderOptionLabel">
                          {opt.label}
                        </span>
                        {active && <Check size={18} style={{ marginLeft: 'auto' }} />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Notifications Sheet */}
          {showNotifSheet && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overlay"
              onClick={() => setShowNotifSheet(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="sheet"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="handle" />
                <div className="flex justify-between items-center mb-6">
                  <h3 className="sheetTitle" style={{ marginBottom: 0 }}>
                    Notifications
                  </h3>
                  <button
                    onClick={() => setShowNotifSheet(false)}
                    className="closeBtn"
                    aria-label="Close notifications"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="emptyState">
                      <Bell size={40} style={{ margin: '0 auto 0.5rem' }} />
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        No activity yet
                      </p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`notifItem ${n.isRead ? 'notifRead' : 'notifUnread'}`}
                      >
                        <div style={{ fontSize: '1.25rem', flexShrink: 0 }}>{n.icon || '✨'}</div>
                        <div className="flex-1 min-w-0">
                          <p className="notifTitle">
                            {n.title}
                          </p>
                          <p className="notifMessage">
                            {n.message}
                          </p>
                        </div>
                        {!n.isRead && (
                          <div className="notifDot" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
