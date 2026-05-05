import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import {
  Copy, Check, X,
  ArrowRight, Bell, ShieldCheck, VideoIcon
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

// Permission states:
//  IDLE       → unknown / first-time, no dialog shown yet
//  REQUESTING → system dialog is currently open
//  GRANTED    → both camera + mic allowed
//  DENIED     → permanently denied, must go to Settings
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
  const [permState, setPermState] = useState(PERM.IDLE);

  const controls = useAnimation();
  const x = useMotionValue(0);
  const trackWidth = 280;
  const thumbSize = 56;
  const maxDrag = trackWidth - thumbSize - 8;
  const opacity = useTransform(x, [0, maxDrag * 0.6], [1, 0]);

  // ─── Mount: read-only permission check + wire up native callback ───
  useEffect(() => {
    checkPermissions();

    if (typeof window !== 'undefined') {
      // Called by MainActivity after the system dialog closes
      window.onPermissionResult = function(granted) {
        const next = resolvePermState(granted);
        setPermState(next);
        if (granted) {
          onDiscover();
        }
      };
    }

    return () => {
      if (typeof window !== 'undefined') delete window.onPermissionResult;
    };
  }, []);

  // Reset slider when not searching
  useEffect(() => {
    if (!searching) {
      x.set(0);
      controls.start({ x: 0 });
    }
  }, [searching, x, controls]);

  // Rotate pickup lines
  useEffect(() => {
    const id = setInterval(() => {
      setLineIndex((prev) => (prev + 1) % LOVE_PICKUP_LINES.length);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  // ─── Read-only permission check — never shows a dialog ───
  const checkPermissions = useCallback(() => {
    if (typeof window !== 'undefined' && window.OreyNative) {
      const granted = window.OreyNative.hasPermissions();
      setPermState(resolvePermState(granted));
    } else if (navigator && navigator.permissions && navigator.permissions.query) {
      Promise.all([
        navigator.permissions.query({ name: 'camera' }),
        navigator.permissions.query({ name: 'microphone' }),
      ])
        .then(function(results) {
          const cam = results[0];
          const mic = results[1];
          if (cam.state === 'granted' && mic.state === 'granted') {
            setPermState(PERM.GRANTED);
          } else if (cam.state === 'denied' || mic.state === 'denied') {
            setPermState(PERM.DENIED);
          } else {
            // 'prompt' — user hasn't been asked yet
            setPermState(PERM.IDLE);
          }
        })
        .catch(function() {
          setPermState(PERM.IDLE);
        });
    } else {
      setPermState(PERM.IDLE);
    }
  }, []);

  /**
   * Triggers the native system permission dialog via the JS bridge.
   * ONLY called from handleDragEnd — never automatically.
   */
  const requestPermissions = useCallback(() => {
    setPermState(PERM.REQUESTING);

    if (typeof window !== 'undefined' && window.OreyNative) {
      // Native bridge handles rationale dialog + system dialog
      window.OreyNative.requestPermissions();
    } else if (navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      // Web fallback (browser preview / desktop testing)
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then(function(stream) {
          stream.getTracks().forEach(function(t) { t.stop(); });
          setPermState(PERM.GRANTED);
          onDiscover();
        })
        .catch(function(err) {
          console.log('Permission error:', err.name);
          setPermState(PERM.DENIED);
        });
    } else {
      setPermState(PERM.DENIED);
    }
  }, [onDiscover]);

  /** Opens system app Settings so the user can re-enable denied permissions. */
  const openSettings = useCallback(() => {
    if (typeof window !== 'undefined' && window.OreyNative) {
      window.OreyNative.openAppSettings();
    }
  }, []);

  /**
   * Slider release handler — the ONLY place permissions are ever requested.
   *
   * GRANTED    → go straight to discover
   * DENIED     → open system Settings (can't re-prompt after permanent denial)
   * IDLE       → request in-context (first time, user just swiped = expected)
   * REQUESTING → dialog already open, do nothing
   */
  const handleDragEnd = useCallback(() => {
    if (x.get() > maxDrag * 0.8) {
      if (permState === PERM.GRANTED) {
        onDiscover();
      } else if (permState === PERM.DENIED) {
        openSettings();
      } else if (permState === PERM.IDLE) {
        requestPermissions();
      }
      // REQUESTING: system dialog is open — do nothing
    }
    controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
  }, [x, maxDrag, permState, onDiscover, openSettings, requestPermissions, controls]);

  const copyId = useCallback(() => {
    if (!oreyId || oreyId.includes('·')) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(oreyId).then(function() {
        setCopied(true);
        setTimeout(function() { setCopied(false); }, 2000);
      });
    }
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
      return 'Matching ' + (gender === 'male' ? 'Males' : 'Females') + ' · ' + matchTimer + 's';
    }
    return 'Matching Anyone';
  };

  // Slider hint text changes based on permission state
  const sliderHintText = () => {
    if (permState === PERM.DENIED) return 'Enable in Settings →';
    if (permState === PERM.REQUESTING) return 'Waiting...';
    return 'Slide to Connect';
  };

  return (
    <div className="root">
      <div className="bgGradient">
        <div className="bgGlowTop" />
        <div className="bgGlowBottom" />
      </div>

      <div className="container">
        {/* ── Header ── */}
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

        {/* ── Main ── */}
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
                {/* Permission rationale hint — shown before first request */}
                {permState === PERM.IDLE && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="permHint"
                  >
                    <VideoIcon size={12} style={{ color: '#60a5fa', flexShrink: 0 }} />
                    <span>Camera &amp; mic needed to connect</span>
                  </motion.div>
                )}

                {/* Denied hint */}
                {permState === PERM.DENIED && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="permHintDenied"
                  >
                    <span>Permissions denied — swipe to open Settings</span>
                  </motion.div>
                )}

                {/* Slider */}
                <div
                  className="sliderTrack"
                  style={{
                    borderColor: permState === PERM.DENIED
                      ? 'rgba(244,63,94,0.2)'
                      : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <motion.div style={{ opacity }} className="sliderHint">
                    <motion.span
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="sliderHintText"
                      style={{
                        color: permState === PERM.DENIED ? '#fb7185' : '#64748b',
                      }}
                    >
                      {sliderHintText()}
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

                {/* Requesting indicator */}
                {permState === PERM.REQUESTING && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="requestingLabel"
                  >
                    Waiting for permission…
                  </motion.p>
                )}

                {/* Settings button — shown only after permanent denial */}
                {permState === PERM.DENIED && (
                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={openSettings}
                    className="settingsBtn"
                  >
                    Enable Camera &amp; Mic in Settings
                  </motion.button>
                )}
              </motion.div>
            ) : (
              /* ── Searching state ── */
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
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Cancel Search
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* ── Footer ── */}
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

      {/* ── Notifications Sheet ── */}
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
