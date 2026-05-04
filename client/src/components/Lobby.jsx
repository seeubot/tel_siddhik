import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import {
  Copy, Check, X,
  ArrowRight, Bell, Globe, ShieldCheck, Camera, Mic
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

export default function Lobby({
  oreyId = 'OREY-X7R2P',
  searching = false,
  matchStage = null,
  matchTimer = 3,
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
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [waitingForPermission, setWaitingForPermission] = useState(false);

  const controls = useAnimation();
  const x = useMotionValue(0);
  const trackWidth = 280;
  const thumbSize = 56;
  const maxDrag = trackWidth - thumbSize - 8;
  const opacity = useTransform(x, [0, maxDrag * 0.6], [1, 0]);

  // Check permissions on mount and setup callback
  useEffect(() => {
    checkPermissions();
    
    // Setup callback for permission results from Android
    if (typeof window !== 'undefined') {
      window.onPermissionResult = (granted) => {
        setWaitingForPermission(false);
        if (granted) {
          setHasPermissions(true);
          setShowPermissionDialog(false);
        } else {
          setHasPermissions(false);
        }
      };
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        delete window.onPermissionResult;
      }
    };
  }, []);

  // Reset slider when switching back from searching
  useEffect(() => {
    if (!searching) {
      x.set(0);
      controls.start({ x: 0 });
    }
  }, [searching, x, controls]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLineIndex((prev) => (prev + 1) % LOVE_PICKUP_LINES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const checkPermissions = useCallback(() => {
    // Check if OreyNative bridge is available (Android WebView)
    if (typeof window !== 'undefined' && window.OreyNative) {
      const granted = window.OreyNative.hasPermissions();
      setHasPermissions(granted);
    } else {
      // Fallback for web/browser testing
      if (navigator?.mediaDevices?.getUserMedia) {
        Promise.all([
          navigator.permissions?.query({ name: 'camera' }),
          navigator.permissions?.query({ name: 'microphone' })
        ]).then(([cam, mic]) => {
          setHasPermissions(cam?.state === 'granted' && mic?.state === 'granted');
        }).catch(() => {
          setHasPermissions(false);
        });
      }
    }
  }, []);

  const requestAndroidPermissions = useCallback(() => {
    if (typeof window !== 'undefined' && window.OreyNative) {
      setWaitingForPermission(true);
      window.OreyNative.requestPermissions();
    } else {
      // Fallback for web/browser - request directly
      if (navigator?.mediaDevices?.getUserMedia) {
        setWaitingForPermission(true);
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          .then((stream) => {
            stream.getTracks().forEach(track => track.stop());
            setHasPermissions(true);
            setWaitingForPermission(false);
            setShowPermissionDialog(false);
          })
          .catch(() => {
            setHasPermissions(false);
            setWaitingForPermission(false);
          });
      }
    }
  }, []);

  const copyId = useCallback(() => {
    if (!oreyId || oreyId.includes('·')) return;
    navigator.clipboard.writeText(oreyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [oreyId]);

  const handleConnect = useCallback(() => {
    const trimmed = targetId.trim().toUpperCase();
    if (trimmed.length === 5) {
      onConnectById('OREY-' + trimmed);
      setTargetId('');
    }
  }, [targetId, onConnectById]);

  const handleDragEnd = useCallback(() => {
    if (x.get() > maxDrag * 0.8) {
      // Check permissions before allowing discovery
      if (hasPermissions) {
        onDiscover();
      } else {
        // Show permission dialog
        setShowPermissionDialog(true);
      }
    }
    // Always spring back
    controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
  }, [x, maxDrag, onDiscover, controls, hasPermissions]);

  const getSearchStatusText = () => {
    if (matchStage === 'gender') {
      return `Matching ${gender === 'male' ? 'Males' : 'Females'} · ${matchTimer}s`;
    }
    return 'Matching Anyone';
  };

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
            {!searching && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="styleContainer"
              >
                <span className="styleLabel">DAILY SPARK:</span>
                <div className="h-10 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={lineIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                      className="styleValue"
                    >
                      "{LOVE_PICKUP_LINES[lineIndex]}"
                    </motion.p>
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </div>

          <button
            onClick={() => { setShowNotifSheet(true); onViewNotifications(); }}
            className="bellBtn"
          >
            <Bell size={18} strokeWidth={2.5} />
            {unreadCount > 0 && <span className="bellBadge" />}
          </button>
        </header>

        <main className="main">
          <AnimatePresence mode="wait">
            {!searching ? (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center"
              >
                <div className="sliderTrack">
                  <motion.div style={{ opacity }} className="sliderHint">
                    <motion.span
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="sliderHintText"
                    >
                      Slide to Connect
                    </motion.span>
                  </motion.div>

                  <motion.div
                    drag="x"
                    dragConstraints={{ left: 0, right: maxDrag }}
                    dragElastic={0.05}
                    onDragEnd={handleDragEnd}
                    animate={controls}
                    style={{ x }}
                    className="sliderThumb"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span className="thumbLogo">O</span>
                  </motion.div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="searching"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="searchingContent"
              >
                <div className="pulseContainer">
                  <motion.div
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.4, 0.1, 0.4],
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="pulseRing"
                    style={{ width: 160, height: 160 }}
                  />
                  <motion.div
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.3, 0.05, 0.3],
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                    className="pulseRing"
                    style={{ width: 200, height: 200 }}
                  />
                  
                  <motion.div
                    animate={{ 
                      scale: [1, 1.08, 1],
                      rotate: [0, 5, -5, 0],
                    }}
                    transition={{ 
                      scale: { duration: 2, repeat: Infinity },
                      rotate: { duration: 3, repeat: Infinity },
                    }}
                    style={{
                      backgroundColor: '#2563eb',
                      width: '6rem',
                      height: '6rem',
                      borderRadius: '1.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 25px 50px -12px rgba(59,130,246,0.5)',
                      zIndex: 10,
                      position: 'relative',
                    }}
                  >
                    <motion.span
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      style={{ fontSize: '2.25rem', fontWeight: 900, color: '#fff' }}
                    >
                      O
                    </motion.span>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="timer"
                  >
                    {matchStage === 'gender' ? 'Finding Match' : 'Searching...'}
                  </motion.div>

                  <div className="statusLabel">
                    <span className="statusDot" />
                    <motion.span
                      key={matchStage + matchTimer}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      {getSearchStatusText()}
                    </motion.span>
                  </div>
                </div>

                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  onClick={onCancelSearch}
                  className="cancelSearchBtn"
                  whileHover={{ scale: 1.05, color: '#f43f5e', borderColor: 'rgba(244,63,94,0.4)' }}
                  whileTap={{ scale: 0.95 }}
                >
                  Cancel Search
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
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
            />
            <button
              onClick={handleConnect}
              disabled={targetId.length !== 5}
              className="connectBtn"
              style={{
                backgroundColor: targetId.length === 5 ? '#2563eb' : 'rgba(255,255,255,0.05)',
                color: targetId.length === 5 ? '#ffffff' : '#334155',
              }}
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </footer>

        {/* Permission Dialog */}
        <AnimatePresence>
          {showPermissionDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overlay"
              onClick={() => setShowPermissionDialog(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 'calc(100% - 3rem)',
                  maxWidth: '320px',
                  backgroundColor: '#0c0d0e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '1.5rem',
                  padding: '2rem',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                  zIndex: 101,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ 
                  width: '4rem', 
                  height: '4rem', 
                  borderRadius: '1.25rem', 
                  backgroundColor: 'rgba(59,130,246,0.1)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  marginBottom: '1.5rem',
                  marginLeft: 'auto',
                  marginRight: 'auto'
                }}>
                  <Camera size={28} color="#60a5fa" />
                </div>

                <h3 style={{ 
                  fontSize: '1.125rem', 
                  fontWeight: 900, 
                  color: '#fff', 
                  textAlign: 'center',
                  marginBottom: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '-0.025em'
                }}>
                  Camera & Mic Required
                </h3>

                <p style={{ 
                  fontSize: '0.75rem', 
                  color: '#94a3b8', 
                  textAlign: 'center',
                  lineHeight: '1.625',
                  marginBottom: '1.5rem'
                }}>
                  Orey needs camera and microphone access to connect you with others. This is essential for the full experience.
                </p>

                <div style={{
                  display: 'flex',
                  gap: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{
                    flex: 1,
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    textAlign: 'center'
                  }}>
                    <Camera size={20} color="#60a5fa" style={{ margin: '0 auto 0.25rem' }} />
                    <p style={{ fontSize: '8px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Camera</p>
                  </div>
                  <div style={{
                    flex: 1,
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    textAlign: 'center'
                  }}>
                    <Mic size={20} color="#a78bfa" style={{ margin: '0 auto 0.25rem' }} />
                    <p style={{ fontSize: '8px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Microphone</p>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={requestAndroidPermissions}
                  disabled={waitingForPermission}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    borderRadius: '0.75rem',
                    border: 'none',
                    backgroundColor: waitingForPermission ? 'rgba(59,130,246,0.3)' : '#2563eb',
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    cursor: waitingForPermission ? 'wait' : 'pointer',
                    transition: 'all 0.2s',
                    marginBottom: '0.75rem'
                  }}
                >
                  {waitingForPermission ? 'Waiting...' : 'Grant Permissions'}
                </motion.button>

                <button
                  onClick={() => setShowPermissionDialog(false)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backgroundColor: 'transparent',
                    color: '#64748b',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notifications Sheet */}
        <AnimatePresence>
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
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="sheet"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="handle" />
                <div className="flex justify-between items-center mb-6">
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.05em', color: '#fff' }}>
                    Notifications
                  </h3>
                  <button
                    onClick={() => setShowNotifSheet(false)}
                    style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '9999px', color: '#64748b', border: 'none', cursor: 'pointer' }}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="overflow-y-auto space-y-2 pr-2">
                  {notifications.length === 0 ? (
                    <div style={{ padding: '3rem 0', textAlign: 'center', opacity: 0.3 }}>
                      <Bell size={40} style={{ margin: '0 auto 0.5rem' }} />
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        No activity yet
                      </p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className="notifItem"
                        style={{
                          backgroundColor: n.isRead ? 'rgba(255,255,255,0.02)' : 'rgba(59,130,246,0.05)',
                          borderColor: n.isRead ? 'transparent' : 'rgba(59,130,246,0.2)',
                        }}
                      >
                        <div style={{ fontSize: '1.25rem', flexShrink: 0 }}>{n.icon || '✨'}</div>
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {n.title}
                          </p>
                          <p style={{ fontSize: '10px', color: '#64748b', marginTop: '0.25rem', lineHeight: 1.625 }}>
                            {n.message}
                          </p>
                        </div>
                        {!n.isRead && (
                          <div style={{ width: '0.5rem', height: '0.5rem', borderRadius: '9999px', backgroundColor: '#3b82f6', marginTop: '0.25rem', flexShrink: 0 }} />
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
