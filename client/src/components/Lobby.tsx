import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import createGlobe from 'cobe';
import {
  Copy, Check, X,
  ArrowRight, Bell, ShieldCheck, User, Users
} from 'lucide-react';
import './styles.css';

// ── Constants ────────────────────────────────────────────────────────────────

const PICKUP_LINES = [
  "Are you a camera? Because every time I look at you, I smile.",
  "I'm not a photographer, but I can definitely picture us together.",
  "You must be a magician, because whenever I look at you, everyone else disappears.",
  "I'd say God Bless You, but it looks like He already did.",
  "Are you made of copper and tellurium? Because you're CuTe.",
  "I'm learning about important dates in history. Do you want to be one of them?",
  "If beauty were time, you'd be an eternity.",
];

const GLOBE_MARKERS = [
  { location: [40.7128, -74.006]   as [number, number], size: 0.05 },
  { location: [51.5074, -0.1278]   as [number, number], size: 0.05 },
  { location: [35.6762, 139.6503]  as [number, number], size: 0.05 },
  { location: [-33.8688, 151.2093] as [number, number], size: 0.04 },
  { location: [55.7558, 37.6173]   as [number, number], size: 0.04 },
  { location: [-1.2921, 36.8219]   as [number, number], size: 0.04 },
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface ONotification {
  id: string;
  title: string;
  message: string;
  isRead?: boolean;
  icon?: string;
}

export interface LobbyProps {
  oreyId?: string;
  searching?: boolean;
  matchStage?: string | null;
  matchTimer?: number;
  onDiscover?: () => void;
  onCancelSearch?: () => void;
  onConnectById?: (id: string) => void;
  gender?: string | null;
  onSetGender?: (g: string | null) => void;
  notifications?: ONotification[];
  unreadCount?: number;
  onViewNotifications?: () => void;
}

// ── Globe ────────────────────────────────────────────────────────────────────

function Globe({ size = 260 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef    = useRef(0);

  useEffect(() => {
    if (!canvasRef.current) return;
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: dpr,
      width:  size * dpr,
      height: size * dpr,
      phi: 0,
      theta: 0.3,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor:   [0.98, 0.96, 0.96],
      markerColor: [0.94, 0.27, 0.27],
      glowColor:   [1, 0.93, 0.93],
      markers: GLOBE_MARKERS,
      onRender(state) {
        state.phi = phiRef.current;
        phiRef.current += 0.004;
      },
    });

    return () => globe.destroy();
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width:  size,
        height: size,
        borderRadius: '50%',
        display: 'block',
        filter: 'drop-shadow(0 20px 40px rgba(239,68,68,0.25))',
      }}
    />
  );
}

// ── Lobby ────────────────────────────────────────────────────────────────────

export default function Lobby({
  oreyId              = 'OREY-X7R2P',
  searching           = false,
  matchStage          = null,
  matchTimer          = 3,
  onDiscover          = () => {},
  onCancelSearch      = () => {},
  onConnectById       = () => {},
  gender              = null,
  onSetGender         = () => {},
  notifications       = [],
  unreadCount         = 2,
  onViewNotifications = () => {},
}: LobbyProps) {
  const [copied,         setCopied]         = useState(false);
  const [targetId,       setTargetId]       = useState('');
  const [showNotif,      setShowNotif]      = useState(false);
  const [lineIndex,      setLineIndex]      = useState(0);
  const [activeGender,   setActiveGender]   = useState(gender);
  const [isSearching,    setIsSearching]    = useState(searching);

  // Framer slider
  const controls  = useAnimation();
  const x         = useMotionValue(0);
  const TRACK_W   = 280;
  const THUMB_W   = 56;
  const MAX_DRAG  = TRACK_W - THUMB_W - 8;
  const hintAlpha = useTransform(x, [0, MAX_DRAG * 0.6], [1, 0]);

  // Cycle pickup lines
  useEffect(() => {
    const t = setInterval(() => setLineIndex(i => (i + 1) % PICKUP_LINES.length), 4500);
    return () => clearInterval(t);
  }, []);

  // Sync external prop
  useEffect(() => {
    setIsSearching(searching);
    if (!searching) { x.set(0); controls.start({ x: 0 }); }
  }, [searching]); // eslint-disable-line

  const handleDragEnd = useCallback(() => {
    if (x.get() > MAX_DRAG * 0.8) {
      setIsSearching(true);
      onDiscover();
    }
    controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
  }, [x, MAX_DRAG, onDiscover, controls]);

  const handleCancel = useCallback(() => {
    setIsSearching(false);
    x.set(0);
    controls.start({ x: 0 });
    onCancelSearch();
  }, [onCancelSearch, x, controls]);

  const copyId = useCallback(() => {
    navigator.clipboard?.writeText(oreyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [oreyId]);

  const handleConnect = useCallback(() => {
    const v = targetId.trim().toUpperCase();
    if (v.length === 5) { onConnectById('OREY-' + v); setTargetId(''); }
  }, [targetId, onConnectById]);

  const pickGender = (g: string | null) => {
    setActiveGender(g);
    onSetGender(g);
  };

  const statusText =
    matchStage === 'gender'
      ? `Matching ${activeGender === 'male' ? 'Females' : 'Males'} · ${matchTimer}s`
      : 'Matching Anyone · Worldwide';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="root">
      <div className="bg">
        <div className="bgTop" />
        <div className="bgBot" />
      </div>

      <div className="container">

        {/* Header */}
        <header className="header">
          <div className="headerLeft">
            <h1 className="logo">Orey<span className="logoAccent">!</span></h1>

            <AnimatePresence>
              {!isSearching && (
                <motion.div
                  key="spark"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="spark"
                >
                  <span className="sparkLabel">Daily Spark:</span>
                  <div className="sparkWindow">
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={lineIndex}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.25 }}
                        className="sparkText"
                      >
                        "{PICKUP_LINES[lineIndex]}"
                      </motion.p>
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            className="bellBtn"
            aria-label="Notifications"
            onClick={() => { setShowNotif(true); onViewNotifications(); }}
          >
            <Bell size={18} strokeWidth={2.5} />
            {unreadCount > 0 && <span className="bellDot" />}
          </button>
        </header>

        {/* Gender selector */}
        <AnimatePresence>
          {!isSearching && (
            <motion.div
              key="gender"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="genderRow"
            >
              {([
                { value: 'male',   label: 'Male',   Icon: User },
                { value: 'female', label: 'Female', Icon: User },
                { value: null,     label: 'Any',    Icon: Users },
              ] as const).map(({ value, label, Icon }) => (
                <button
                  key={String(value)}
                  className={[
                    'gBtn',
                    activeGender === value
                      ? value === null ? 'gBtnAny' : 'gBtnRed'
                      : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => pickGender(value)}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main */}
        <main className="main">
          <AnimatePresence mode="wait">

            {/* Idle */}
            {!isSearching && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className="idleWrap"
              >
                <div className="track">
                  <motion.div style={{ opacity: hintAlpha }} className="trackHint">
                    <motion.span
                      animate={{ opacity: [0.55, 1, 0.55] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="trackHintText"
                    >
                      Slide to Find a Match
                    </motion.span>
                  </motion.div>

                  <motion.div
                    className="thumb"
                    drag="x"
                    dragConstraints={{ left: 0, right: MAX_DRAG }}
                    dragElastic={0.05}
                    onDragEnd={handleDragEnd}
                    animate={controls}
                    style={{ x }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    role="slider"
                    aria-label="Slide to connect"
                  >
                    <span className="thumbLetter">O</span>
                  </motion.div>
                </div>

                <p className="permHint">Camera &amp; microphone required to connect</p>
              </motion.div>
            )}

            {/* Searching */}
            {isSearching && (
              <motion.div
                key="searching"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="searchWrap"
              >
                <div className="globeGroup">
                  <Globe size={260} />

                  <motion.p
                    className="searchLabel"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    {matchStage === 'gender' ? 'Finding Match' : 'Searching Worldwide'}
                  </motion.p>

                  <div className="searchStatus">
                    <span className="statusDot" />
                    <motion.span
                      key={matchStage + String(matchTimer)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      {statusText}
                    </motion.span>
                  </div>
                </div>

                <motion.button
                  className="cancelBtn"
                  onClick={handleCancel}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                >
                  Cancel Search
                </motion.button>
              </motion.div>
            )}

          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="footer">
          <div className="idRow">
            <div
              className="idBlock"
              onClick={copyId}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && copyId()}
            >
              <span className="idLabel">My Identity</span>
              <div className="idDisplay">
                <span className="idCode">{oreyId}</span>
                {copied
                  ? <Check size={18} color="#ef4444" />
                  : <Copy size={16} color="#94a3b8" />}
              </div>
            </div>

            <div className="privateBadge">
              <ShieldCheck size={18} color="#94a3b8" />
              <span className="privateText">Private</span>
            </div>
          </div>

          <div className="connectCard">
            <span className="connectPfx">OREY-</span>
            <input
              className="connectInput"
              type="text"
              placeholder="ENTER PARTNER ID"
              maxLength={5}
              value={targetId}
              onChange={e =>
                setTargetId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))
              }
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              className="connectBtn"
              onClick={handleConnect}
              disabled={targetId.length !== 5}
              aria-label="Connect to partner"
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </footer>
      </div>

      {/* Notification sheet */}
      <AnimatePresence>
        {showNotif && (
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowNotif(false)}
          >
            <motion.div
              className="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="sheetHandle" />

              <div className="sheetHeader">
                <h3 className="sheetTitle">Notifications</h3>
                <button
                  className="sheetClose"
                  onClick={() => setShowNotif(false)}
                  aria-label="Close notifications"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="sheetBody">
                {notifications.length === 0 ? (
                  <div className="emptyState">
                    <Bell size={38} style={{ color: '#94a3b8', display: 'block', margin: '0 auto 8px' }} />
                    <p className="emptyText">No activity yet</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className="notifItem"
                      style={{
                        background:  n.isRead ? 'rgba(255,255,255,0.02)' : 'rgba(239,68,68,0.05)',
                        borderColor: n.isRead ? 'transparent'            : 'rgba(239,68,68,0.2)',
                      }}
                    >
                      <span className="notifEmoji">{n.icon ?? '✨'}</span>
                      <div className="notifBody">
                        <p className="notifTitle">{n.title}</p>
                        <p className="notifMsg">{n.message}</p>
                      </div>
                      {!n.isRead && <span className="unreadDot" />}
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
