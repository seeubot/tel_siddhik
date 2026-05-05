import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import {
  Copy, Check, X,
  ArrowRight, Bell, ShieldCheck
} from 'lucide-react';
import './styles.css';

const LOVE_PICKUP_LINES = [
  "Are you a camera? Because every time I look at you, I smile.",
  "I'm not a photographer, but I can definitely picture us together.",
  "You must be a magician, because whenever I look at you, everyone else disappears.",
  "I'd say God Bless You, but it looks like He already did.",
  "Are you made of copper and tellurium? Because you're CuTe.",
  "I'm learning about important dates in history. Do you want to be one of them?",
  "If beauty were time, you'd be an eternity."
];

const PERM = { IDLE: 'idle', REQUESTING: 'requesting', DENIED: 'denied', GRANTED: 'granted' };

function resolvePermState(granted) {
  return granted ? PERM.GRANTED : PERM.DENIED;
}

export default function Lobby({
  oreyId = 'OREY-X7R2P',
  searching = false,
  matchStage = null,
  matchTimer = 3,
  onDiscover = () => console.log('Discover triggered'),
  onCancelSearch = () => console.log('Search cancelled'),
  onConnectById = (id) => console.log('Connecting to', id),
  gender = null,
  onSetGender = (g) => console.log('Gender set to', g),
  notifications = [],
  unreadCount = 2,
  onViewNotifications = () => {},
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [showNotifSheet, setShowNotifSheet] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);

  // Permission state — IDLE means unknown/first-time, not denied.
  // We never speculatively request; we only read the current state on mount.
  const [permState, setPermState] = useState(PERM.IDLE);

  const controls = useAnimation();
  const x = useMotionValue(0);
  const trackWidth = 280;
  const thumbSize = 56;
  const maxDrag = trackWidth - thumbSize - 8;
  const opacity = useTransform(x, [0, maxDrag * 0.6], [1, 0]);

  // On mount: READ current permission state only — no dialog, no request.
  // The window.onPermissionResult callback handles results from native dialogs
  // triggered later by the slider swipe.
  useEffect(() => {
    checkPermissions();

    if (typeof window !== 'undefined') {
      window.onPermissionResult = (granted) => {
        const next = resolvePermState(granted);
        setPermState(next);

        // Only proceed to discover if the user just granted — they intentionally
        // swiped and then accepted the system dialog.
        if (granted) {
          onDiscover();
        }
      };
    }

    return () => {
      if (typeof window !== 'undefined') delete window.onPermissionResult;
    };
  }, []);

  useEffect(() => {
    if (!searching) {
      x.set(0);
      controls.start({ x: 0 });
    }
  }, [searching, x, controls]);

  useEffect(() => {
    const id = setInterval(() => {
      setLineIndex((prev) => (prev + 1) % LOVE_PICKUP_LINES.length);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  /**
   * READ-ONLY permission check — never triggers a system dialog.
   * Used on mount and after returning from Settings to refresh UI state.
   */
  const checkPermissions = useCallback(() => {
    if (typeof window !== 'undefined' && window.OreyNative) {
      const granted = window.OreyNative.hasPermissions();
      setPermState(resolvePermState(granted));
    } else if (navigator?.permissions?.query) {
      Promise.all([
        navigator.permissions.query({ name: 'camera' }),
        navigator.permissions.query({ name: 'microphone' }),
      ])
        .then(([cam, mic]) => {
          if (cam.state === 'granted' && mic.state === 'granted') {
            setPermState(PERM.GRANTED);
          } else if (cam.state === 'denied' || mic.state === 'denied') {
            setPermState(PERM.DENIED);
          } else {
            // 'prompt' state — user hasn't been asked yet
            setPermState(PERM.IDLE);
          }
        })
        .catch(() => {
          setPermState(PERM.IDLE);
        });
    } else {
      setPermState(PERM.IDLE);
    }
  }, []);

  /**
   * Triggers the native system permission dialog.
   * Must only be called in DIRECT response to the user's slider swipe gesture.
   * Never call this on app load, onResume, or any automatic trigger.
   */
  const requestPermissions = useCallback(() => {
    setPermState(PERM.REQUESTING);

    if (typeof window !== 'undefined' && window.OreyNative) {
      // Native bridge — result comes back via window.onPermissionResult
      window.OreyNative.requestPermissions();
    } else if (navigator?.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          stream.getTracks().forEach((t) => t.stop());
          setPermState(PERM.GRANTED);
          onDiscover();
        })
        .catch((err) => {
          console.log('Permission error:', err.name);
          setPermState(PERM.DENIED);
        });
    } else {
      setPermState(PERM.DENIED);
    }
  }, [onDiscover]);

  /**
   * Opens system app settings so the user can re-enable denied permissions.
   * Only shown when permState === DENIED.
   */
  const openSettings = useCallback(() => {
    if (typeof window !== 'undefined' && window.OreyNative) {
      window.OreyNative.openAppSettings();
    }
  }, []);

  /**
   * Handles the slider release.
   *
   * Permission flow (Google Play policy-compliant):
   *  - GRANTED  → go straight to discover (camera/mic already allowed)
   *  - DENIED   → send user to Settings (they previously denied; can't re-prompt)
   *  - IDLE     → request permissions now, in context of this explicit user action
   *  - REQUESTING → do nothing (dialog already open)
   */
  const handleDragEnd = useCallback(() => {
    if (x.get() > maxDrag * 0.8) {
      if (permState === PERM.GRANTED) {
        onDiscover();
      } else if (permState === PERM.DENIED) {
        openSettings();
      } else if (permState === PERM.IDLE) {
        // First time — user just swiped, so the request is in-context and expected.
        requestPermissions();
      }
      // REQUESTING: dialog is already visible, do nothing.
    }
    controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
  }, [x, maxDrag, permState, onDiscover, openSettings, requestPermissions, controls]);

  const copyId = useCallback(() => {
    if (!oreyId || oreyId.includes('·')) return;
    navigator.clipboard?.writeText(oreyId).then(() => {
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
                {/* Hint text shown only before permissions are granted */}
                {permState === PERM.IDLE && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.15em',
                      color: '#475569',
                      marginBottom: '0.75rem',
                      textAlign: 'center',
                    }}
                  >
                    Camera & mic needed to connect
                  </motion.p>
                )}

                <div className="sliderTrack">
                  <motion.div style={{ opacity }} className="sliderHint">
                    <motion.span
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="sliderHintText"
                    >
                      {permState === PERM.DENIED ? 'Enable in Settings' : 'Slide to Connect'}
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

                {/* Settings button — only visible after a hard denial */}
                {permState === PERM.DENIED && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={openSettings}
                    className="settingsBtn"
                  >
                    Enable Camera & Mic in Settings
                  </motion.button>
                )}

                {/* Requesting state indicator */}
                {permState === PERM.REQUESTING && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.15em',
                      color: '#60a5fa',
                      marginTop: '0.75rem',
                    }}
                  >
                    Waiting for permission…
                  </motion.p>
                )}
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
                    animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0.1, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="pulseRing"
                    style={{ width: 160, height: 160 }}
                  />
                  <motion.div
                    animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.05, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                    className="pulseRing"
                    style={{ width: 200, height: 200 }}
                  />
                  <motion.div
                    animate={{ scale: [1, 1.08, 1], rotate: [0, 5, -5, 0] }}
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
                    <motion.span key={matchStage + matchTimer} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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
                  whileHover={{ scale: 1.05 }}
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
      </div>

      <AnimatePresence>
        {showNotifSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 150,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(12px)',
            }}
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
  );
}
