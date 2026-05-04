import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import {
  Copy, Check, X,
  ArrowRight, Bell, ShieldCheck, Camera, Mic
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

// ─── Permission States ────────────────────────────────────────────────────────
// idle       → dialog not shown
// requesting → waiting for native/browser response
// denied     → user denied, show retry/settings prompt
// granted    → permissions OK
const PERM = { IDLE: 'idle', REQUESTING: 'requesting', DENIED: 'denied', GRANTED: 'granted' };

function resolvePermState(granted) {
  return granted ? PERM.GRANTED : PERM.DENIED;
}

// ─── Permission Dialog ────────────────────────────────────────────────────────
function PermissionDialog({ state, onGrant, onDismiss }) {
  const isDenied = state === PERM.DENIED;
  const isRequesting = state === PERM.REQUESTING;

  return (
    // Portal-style overlay: uses flex centering, NOT absolute + transform hack
    <motion.div
      key="perm-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
      onClick={onDismiss}
    >
      <motion.div
        key="perm-dialog"
        initial={{ scale: 0.88, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 8 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '320px',
          backgroundColor: '#0c0d0e',
          border: isDenied
            ? '1px solid rgba(244,63,94,0.25)'
            : '1px solid rgba(255,255,255,0.1)',
          borderRadius: '1.5rem',
          padding: '2rem',
          boxShadow: '0 32px 64px -12px rgba(0,0,0,0.7)',
        }}
      >
        {/* Icon */}
        <div style={{
          width: '4rem',
          height: '4rem',
          borderRadius: '1.25rem',
          backgroundColor: isDenied ? 'rgba(244,63,94,0.1)' : 'rgba(59,130,246,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem',
        }}>
          {isDenied
            ? <Camera size={28} color="#fb7185" />
            : <Camera size={28} color="#60a5fa" />
          }
        </div>

        {/* Title */}
        <h3 style={{
          fontSize: '1.125rem',
          fontWeight: 900,
          color: '#fff',
          textAlign: 'center',
          marginBottom: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '-0.025em',
        }}>
          {isDenied ? 'Permissions Denied' : 'Camera & Mic Required'}
        </h3>

        {/* Description */}
        <p style={{
          fontSize: '0.75rem',
          color: '#94a3b8',
          textAlign: 'center',
          lineHeight: 1.7,
          marginBottom: '1.5rem',
        }}>
          {isDenied
            ? 'You denied camera and microphone access. Please grant permissions in your device settings to use Orey.'
            : 'Orey needs camera and microphone access to connect you with others. This is essential for the full experience.'
          }
        </p>

        {/* Camera / Mic icons row */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { Icon: Camera, label: 'Camera', color: '#60a5fa' },
            { Icon: Mic,    label: 'Microphone', color: '#a78bfa' },
          ].map(({ Icon, label, color }) => (
            <div key={label} style={{
              flex: 1,
              padding: '0.75rem',
              borderRadius: '0.75rem',
              backgroundColor: 'rgba(255,255,255,0.05)',
              textAlign: 'center',
            }}>
              <Icon size={20} color={color} style={{ margin: '0 auto 0.35rem', display: 'block' }} />
              <p style={{ fontSize: '8px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Primary action */}
        <motion.button
          whileHover={!isRequesting ? { scale: 1.02 } : {}}
          whileTap={!isRequesting ? { scale: 0.97 } : {}}
          onClick={onGrant}
          disabled={isRequesting}
          style={{
            width: '100%',
            padding: '0.875rem',
            borderRadius: '0.75rem',
            border: 'none',
            backgroundColor: isRequesting
              ? 'rgba(59,130,246,0.3)'
              : isDenied ? '#dc2626' : '#2563eb',
            color: '#fff',
            fontSize: '0.75rem',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            cursor: isRequesting ? 'wait' : 'pointer',
            marginBottom: '0.75rem',
            transition: 'background-color 0.2s',
          }}
        >
          {isRequesting
            ? 'Waiting for permission…'
            : isDenied
              ? 'Try Again'
              : 'Grant Permissions'
          }
        </motion.button>

        {/* Cancel */}
        <button
          onClick={onDismiss}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '0.75rem',
            border: '1px solid rgba(255,255,255,0.08)',
            backgroundColor: 'transparent',
            color: '#64748b',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            cursor: 'pointer',
          }}
        >
          {isDenied ? 'Cancel' : 'Not Now'}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Lobby ───────────────────────────────────────────────────────────────
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

  // Permission state machine
  const [permState, setPermState] = useState(PERM.IDLE);
  const [showPermDialog, setShowPermDialog] = useState(false);

  const controls = useAnimation();
  const x = useMotionValue(0);
  const trackWidth = 280;
  const thumbSize = 56;
  const maxDrag = trackWidth - thumbSize - 8;
  const opacity = useTransform(x, [0, maxDrag * 0.6], [1, 0]);

  // ── Bootstrap: check permissions + wire Android callback ──────────────────
  useEffect(() => {
    checkPermissions();

    if (typeof window !== 'undefined') {
      // Android native bridge calls this after requestPermissions()
      window.onPermissionResult = (granted) => {
        const next = resolvePermState(granted);
        setPermState(next);
        if (granted) {
          setShowPermDialog(false);
        }
        // If denied: keep dialog open and show the denied variant
      };
    }

    return () => {
      if (typeof window !== 'undefined') delete window.onPermissionResult;
    };
  }, []);

  // Reset slider whenever we leave searching mode
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

  // ── Permission helpers ─────────────────────────────────────────────────────
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
          const granted = cam.state === 'granted' && mic.state === 'granted';
          setPermState(resolvePermState(granted));
        })
        .catch(() => setPermState(PERM.DENIED));
    }
  }, []);

  const requestPermissions = useCallback(() => {
    setPermState(PERM.REQUESTING);

    if (typeof window !== 'undefined' && window.OreyNative) {
      // Android: result arrives via window.onPermissionResult callback
      window.OreyNative.requestPermissions();
    } else if (navigator?.mediaDevices?.getUserMedia) {
      // Browser fallback
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          stream.getTracks().forEach((t) => t.stop());
          setPermState(PERM.GRANTED);
          setShowPermDialog(false);
        })
        .catch(() => {
          setPermState(PERM.DENIED);
          // Keep dialog open so user sees the denied state
        });
    } else {
      setPermState(PERM.DENIED);
    }
  }, []);

  const handlePermissionDismiss = useCallback(() => {
    setShowPermDialog(false);
    // Reset to idle so re-opening the dialog starts fresh
    if (permState !== PERM.GRANTED) setPermState(PERM.IDLE);
  }, [permState]);

  // ── Slider ─────────────────────────────────────────────────────────────────
  const handleDragEnd = useCallback(() => {
    if (x.get() > maxDrag * 0.8) {
      if (permState === PERM.GRANTED) {
        onDiscover();
      } else {
        setShowPermDialog(true);
        // If we know they're denied, show denied variant immediately
        if (permState === PERM.IDLE) {
          // Will become DENIED or GRANTED after checkPermissions re-runs
          checkPermissions();
        }
      }
    }
    controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
  }, [x, maxDrag, permState, onDiscover, controls, checkPermissions]);

  // ── Misc helpers ───────────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────
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

        {/* ── Main / Slider / Searching ── */}
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

      {/* ── Permission Dialog (rendered outside .container to avoid stacking context issues) ── */}
      <AnimatePresence>
        {showPermDialog && permState !== PERM.GRANTED && (
          <PermissionDialog
            state={permState}
            onGrant={requestPermissions}
            onDismiss={handlePermissionDismiss}
          />
        )}
      </AnimatePresence>

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
