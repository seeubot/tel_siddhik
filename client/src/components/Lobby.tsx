import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import {
  Copy, Check, X,
  ArrowRight, Bell, ShieldCheck, Settings, User, Users
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

const PERM = {
  IDLE: 'idle',
  REQUESTING: 'requesting',
  DENIED: 'denied',
  GRANTED: 'granted'
};

function resolvePermState(granted: boolean) {
  return granted ? PERM.GRANTED : PERM.DENIED;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead?: boolean;
  icon?: string;
}

interface LobbyProps {
  oreyId?: string;
  searching?: boolean;
  matchStage?: string | null;
  matchTimer?: number;
  onDiscover?: () => void;
  onCancelSearch?: () => void;
  onConnectById?: (id: string) => void;
  gender?: string | null;
  onSetGender?: (g: string | null) => void;
  notifications?: Notification[];
  unreadCount?: number;
  onViewNotifications?: () => void;
}

// ── Globe Component ──────────────────────────────────────────────────────────

const GLOBE_MARKERS = [
  { lat: 40.7128, lng: -74.006 },
  { lat: 51.5074, lng: -0.1278 },
  { lat: 35.6762, lng: 139.6503 },
  { lat: -33.8688, lng: 151.2093 },
  { lat: 55.7558, lng: 37.6173 },
  { lat: -1.2921, lng: 36.8219 },
];

function Globe({ size = 240 }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);
  const phiOffsetRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const pulseTimesRef = useRef(GLOBE_MARKERS.map((_, i) => i * 0.4));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 8;

    function latLngToXYZ(lat: number, lng: number, phi: number) {
      const latR = (lat * Math.PI) / 180;
      const lngR = ((lng + phi * (180 / Math.PI)) * Math.PI) / 180;
      return {
        x: Math.cos(latR) * Math.sin(lngR),
        y: -Math.sin(latR),
        z: Math.cos(latR) * Math.cos(lngR),
      };
    }

    function projectToCanvas(xyz: { x: number; y: number; z: number }) {
      return {
        sx: cx + xyz.x * R,
        sy: cy + xyz.y * R,
        visible: xyz.z > 0,
      };
    }

    function isLand(lat: number, lng: number) {
      if (lat > 15  && lat < 75  && lng > -170 && lng < -52)  return Math.random() < 0.65;
      if (lat > -60 && lat < 15  && lng > -82  && lng < -34)  return Math.random() < 0.60;
      if (lat > 35  && lat < 72  && lng > -12  && lng < 45)   return Math.random() < 0.72;
      if (lat > -40 && lat < 38  && lng > -18  && lng < 52)   return Math.random() < 0.65;
      if (lat > 0   && lat < 78  && lng > 45   && lng < 150)  return Math.random() < 0.60;
      if (lat > -12 && lat < 25  && lng > 95   && lng < 145)  return Math.random() < 0.45;
      if (lat > -45 && lat < -10 && lng > 112  && lng < 155)  return Math.random() < 0.60;
      return false;
    }

    const dots: { lat: number; lng: number }[] = [];
    for (let i = 0; i < 2200; i++) {
      const phi_rand = Math.random() * Math.PI * 2;
      const theta_rand = Math.acos(2 * Math.random() - 1);
      const lat = 90 - (theta_rand * 180) / Math.PI;
      const lng = (phi_rand * 180) / Math.PI - 180;
      if (isLand(lat, lng)) dots.push({ lat, lng });
    }

    let t = 0;

    function draw() {
      const phi = phiRef.current + phiOffsetRef.current;
      ctx.clearRect(0, 0, size, size);

      // Globe base
      const grad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      grad.addColorStop(0, 'rgba(200,30,30,0.18)');
      grad.addColorStop(0.5, 'rgba(180,20,20,0.10)');
      grad.addColorStop(1, 'rgba(100,10,10,0.06)');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Edge
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239,68,68,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Latitude lines
      for (let lat = -60; lat <= 60; lat += 30) {
        const y0 = cy + Math.sin((lat * Math.PI) / 180) * R;
        const rx = Math.cos((lat * Math.PI) / 180) * R;
        if (rx > 0) {
          ctx.beginPath();
          ctx.ellipse(cx, y0, rx, rx * 0.15, 0, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239,68,68,0.07)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // Longitude lines
      for (let lng = 0; lng < 360; lng += 30) {
        const lngR = ((lng + phi * (180 / Math.PI)) * Math.PI) / 180;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.abs(Math.sin(lngR)) * R, R, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239,68,68,0.05)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Land dots
      for (const d of dots) {
        const xyz = latLngToXYZ(d.lat, d.lng, phi);
        if (xyz.z < 0.05) continue;
        const { sx, sy } = projectToCanvas(xyz);
        const fade = Math.min(1, (xyz.z - 0.05) / 0.3);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(239,68,68,${0.35 * fade})`;
        ctx.fill();
      }

      // Markers + pulse rings
      GLOBE_MARKERS.forEach((m, i) => {
        const xyz = latLngToXYZ(m.lat, m.lng, phi);
        if (xyz.z < 0.1) return;
        const { sx, sy } = projectToCanvas(xyz);
        const fade = Math.min(1, (xyz.z - 0.1) / 0.4);

        const cycle = (t * 0.8 - pulseTimesRef.current[i] + i * 0.7) % 2;
        if (cycle >= 0 && cycle < 1.8) {
          const progress = cycle / 1.8;
          ctx.beginPath();
          ctx.arc(sx, sy, progress * 22, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239,68,68,${(1 - progress) * 0.6 * fade})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(sx, sy, progress * 14, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239,68,68,${(1 - progress) * 0.4 * fade})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(239,68,68,${0.8 * fade})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Specular
      const spec = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, 0, cx - R * 0.2, cy - R * 0.2, R * 0.55);
      spec.addColorStop(0, 'rgba(255,255,255,0.08)');
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = spec;
      ctx.fill();

      if (!isDraggingRef.current) phiRef.current += 0.004;
      t += 0.016;
      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [size]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastXRef.current = e.clientX;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    phiOffsetRef.current += (e.clientX - lastXRef.current) / 150;
    lastXRef.current = e.clientX;
  }, []);

  const onPointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    phiRef.current += phiOffsetRef.current;
    phiOffsetRef.current = 0;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{
        cursor: 'grab',
        borderRadius: '50%',
        touchAction: 'none',
        display: 'block',
        filter: 'drop-shadow(0 16px 32px rgba(239,68,68,0.22))',
      }}
    />
  );
}

// ── Main Lobby Component ─────────────────────────────────────────────────────

export default function Lobby({
  oreyId = 'OREY-X7R2P',
  searching = false,
  matchStage = null,
  matchTimer = 3,
  onDiscover = () => { console.log('Discover triggered'); },
  onCancelSearch = () => { console.log('Search cancelled'); },
  onConnectById = (id: string) => { console.log('Connecting to', id); },
  gender = null,
  onSetGender = (g: string | null) => { console.log('Gender set to', g); },
  notifications = [],
  unreadCount = 2,
  onViewNotifications = () => {},
}: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [showNotifSheet, setShowNotifSheet] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [permState, setPermState] = useState(PERM.IDLE);

  const controls = useAnimation();
  const x = useMotionValue(0);
  const trackWidth = 300;
  const thumbSize = 52;
  const maxDrag = trackWidth - thumbSize - 8;
  const opacity = useTransform(x, [0, maxDrag * 0.6], [1, 0]);

  useEffect(() => {
    checkPermissions();
    if (typeof window !== 'undefined') {
      (window as any).onPermissionResult = (granted: boolean) => {
        setPermState(resolvePermState(granted));
        if (granted) onDiscover();
      };
    }
    return () => {
      if (typeof window !== 'undefined') delete (window as any).onPermissionResult;
    };
  }, []);

  useEffect(() => {
    if (!searching) {
      x.set(0);
      controls.start({ x: 0 });
    }
  }, [searching]);

  useEffect(() => {
    const id = setInterval(() => {
      setLineIndex(prev => (prev + 1) % LOVE_PICKUP_LINES.length);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  const checkPermissions = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).OreyNative) {
      try {
        setPermState(resolvePermState((window as any).OreyNative.hasPermissions()));
      } catch { setPermState(PERM.IDLE); }
    } else {
      setPermState(PERM.IDLE);
    }
  }, []);

  const requestPermissions = useCallback(() => {
    setPermState(PERM.REQUESTING);
    if (typeof window !== 'undefined' && (window as any).OreyNative) {
      try { (window as any).OreyNative.requestPermissions(); }
      catch { setPermState(PERM.DENIED); }
    } else {
      setPermState(PERM.DENIED);
    }
  }, []);

  const openSettings = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).OreyNative) {
      try { (window as any).OreyNative.openAppSettings(); } catch {}
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    if (x.get() > maxDrag * 0.8) {
      permState === PERM.GRANTED ? onDiscover() : requestPermissions();
    }
    controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
  }, [x, maxDrag, permState, onDiscover, requestPermissions, controls]);

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
      return `Matching ${gender === 'male' ? 'Females' : 'Males'} · ${matchTimer}s`;
    }
    return 'Matching Anyone · Worldwide';
  };

  const getSliderHint = () => {
    if (permState === PERM.GRANTED) return 'Slide to Find a Match';
    if (permState === PERM.REQUESTING) return 'Waiting...';
    return 'Slide to Allow Camera & Mic';
  };

  return (
    <div className="root">
      {/* Background glows */}
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
                transition={{ duration: 0.25 }}
                className="styleContainer"
              >
                <span className="styleLabel">Daily Spark</span>
                <div className="h-10 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={lineIndex}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
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
            aria-label="Notifications"
          >
            <Bell size={17} strokeWidth={2.5} />
            {unreadCount > 0 && <span className="bellBadge" />}
          </button>
        </header>

        {/* ── Gender selector — only shown when idle ── */}
        {!searching && (
          <div className="genderSelector">
            {(['male', 'female', null] as (string | null)[]).map((g) => (
              <button
                key={String(g)}
                onClick={() => onSetGender(g)}
                className={[
                  'genderBtn',
                  g === 'male'   && gender === 'male'   ? 'genderBtnActiveMale'   : '',
                  g === 'female' && gender === 'female' ? 'genderBtnActiveFemale' : '',
                  g === null     && gender === null      ? 'genderBtnActiveAny'    : '',
                ].filter(Boolean).join(' ')}
              >
                {g === null ? <Users size={14} /> : <User size={14} />}
                <span>{g === null ? 'Any' : g.charAt(0).toUpperCase() + g.slice(1)}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Main content ── */}
        <main className="main">
          <AnimatePresence mode="wait">
            {!searching ? (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22 }}
                className="flex flex-col items-center"
              >
                {/* Slider */}
                <div className="sliderTrack">
                  <motion.div style={{ opacity }} className="sliderHint">
                    <motion.span
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="sliderHintText"
                    >
                      {getSliderHint()}
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
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.94 }}
                    role="slider"
                    aria-label="Slide to connect"
                  >
                    <span className="thumbLogo">O</span>
                  </motion.div>
                </div>

                {/* Permission hint */}
                <AnimatePresence mode="wait">
                  {permState === PERM.IDLE && (
                    <motion.p
                      key="hint-idle"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="permHintIdle"
                    >
                      Camera & microphone required to connect
                    </motion.p>
                  )}
                  {permState === PERM.REQUESTING && (
                    <motion.p
                      key="hint-requesting"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="permHintRequesting"
                    >
                      Waiting for permission...
                    </motion.p>
                  )}
                  {permState === PERM.DENIED && (
                    <motion.button
                      key="hint-denied"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      onClick={openSettings}
                      className="settingsBtn"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <Settings size={12} style={{ flexShrink: 0 }} />
                      Open App Settings
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div
                key="searching"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.28 }}
                className="searchingContent"
              >
                <div className="globeContainer">
                  <Globe size={240} />
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="searchTimer"
                  >
                    {matchStage === 'gender' ? 'Finding Match' : 'Searching Worldwide'}
                  </motion.div>
                  <div className="searchStatus">
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
                  transition={{ delay: 0.35 }}
                  onClick={onCancelSearch}
                  className="cancelSearchBtn"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Cancel Search
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* ── Footer — app action bar ── */}
        <footer className="footer">
          <div className="idRow">
            <div onClick={copyId} className="idBlock">
              <span className="idLabel">My Identity</span>
              <div className="idDisplay">
                <span className="idCode">{oreyId}</span>
                {copied
                  ? <Check size={16} style={{ color: '#ef4444' }} />
                  : <Copy size={14} style={{ color: '#a1a1aa' }} />
                }
              </div>
            </div>
            <div className="privateBadge">
              <ShieldCheck size={16} style={{ color: '#a1a1aa' }} />
              <span className="privateText">Private</span>
            </div>
          </div>

          <div className="connectCard">
            <span className="connectPrefix">OREY-</span>
            <input
              type="text"
              placeholder="ENTER PARTNER ID"
              maxLength={5}
              value={targetId}
              onChange={e => setTargetId(e.target.value.toUpperCase().slice(0, 5))}
              className="connectInput"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              onClick={handleConnect}
              disabled={targetId.length !== 5}
              className="connectBtn"
              aria-label="Connect to partner"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </footer>
      </div>

      {/* ── Notification sheet ── */}
      <AnimatePresence>
        {showNotifSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overlay"
            onClick={() => setShowNotifSheet(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="sheet"
              onClick={e => e.stopPropagation()}
            >
              <div className="handle" />
              <div className="sheetHeader">
                <h3 className="sheetTitle">Notifications</h3>
                <button
                  onClick={() => setShowNotifSheet(false)}
                  className="sheetCloseBtn"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="sheetContent">
                {notifications.length === 0 ? (
                  <div className="emptyState">
                    <Bell size={36} className="emptyStateIcon" />
                    <p className="emptyStateText">No activity yet</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className="notifItem"
                      style={{
                        backgroundColor: n.isRead ? 'rgba(255,255,255,0.02)' : 'rgba(239,68,68,0.05)',
                        borderColor: n.isRead ? 'transparent' : 'rgba(239,68,68,0.2)',
                      }}
                    >
                      <div className="notifIcon">{n.icon || '✨'}</div>
                      <div className="notifContent">
                        <p className="notifTitle">{n.title}</p>
                        <p className="notifMessage">{n.message}</p>
                      </div>
                      {!n.isRead && <div className="unreadDot" />}
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
