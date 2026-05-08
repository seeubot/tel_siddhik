import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import {
  Copy, Check, X,
  ArrowRight, Bell, ShieldCheck, Settings, User, Users
} from 'lucide-react';
import { GlobePulse } from '@/components/ui/globe-pulse';
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
  const trackWidth = 280;
  const thumbSize = 56;
  const maxDrag = trackWidth - thumbSize - 8;
  const opacity = useTransform(x, [0, maxDrag * 0.6], [1, 0]);

  // Globe markers with worldwide locations for realistic searching feel
  const globeMarkers = [
    { id: "pulse-1", location: [40.7128, -74.0060] as [number, number], delay: 0 },    // New York
    { id: "pulse-2", location: [51.5074, -0.1278] as [number, number], delay: 0.4 },   // London
    { id: "pulse-3", location: [35.6762, 139.6503] as [number, number], delay: 0.8 },  // Tokyo
    { id: "pulse-4", location: [-33.8688, 151.2093] as [number, number], delay: 1.2 }, // Sydney
    { id: "pulse-5", location: [55.7558, 37.6173] as [number, number], delay: 1.6 },   // Moscow
    { id: "pulse-6", location: [-1.2921, 36.8219] as [number, number], delay: 2.0 },   // Nairobi
  ];

  useEffect(() => {
    checkPermissions();

    if (typeof window !== 'undefined') {
      (window as any).onPermissionResult = (granted: boolean) => {
        setPermState(resolvePermState(granted));
        if (granted) {
          onDiscover();
        }
      };
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).onPermissionResult;
      }
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
      setLineIndex((prev) => (prev + 1) % LOVE_PICKUP_LINES.length);
    }, 4500);
    return () => { clearInterval(id); };
  }, []);

  const checkPermissions = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).OreyNative) {
      try {
        const granted = (window as any).OreyNative.hasPermissions();
        setPermState(resolvePermState(granted));
      } catch (e) {
        setPermState(PERM.IDLE);
      }
    } else {
      setPermState(PERM.IDLE);
    }
  }, []);

  const requestPermissions = useCallback(() => {
    setPermState(PERM.REQUESTING);

    if (typeof window !== 'undefined' && (window as any).OreyNative) {
      try {
        (window as any).OreyNative.requestPermissions();
      } catch (e) {
        setPermState(PERM.DENIED);
      }
    } else {
      setPermState(PERM.DENIED);
    }
  }, []);

  const openSettings = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).OreyNative) {
      try {
        (window as any).OreyNative.openAppSettings();
      } catch (e) {
        console.log('Error opening settings:', e);
      }
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    if (x.get() > maxDrag * 0.8) {
      if (permState === PERM.GRANTED) {
        onDiscover();
      } else {
        requestPermissions();
      }
    }
    controls.start({ 
      x: 0, 
      transition: { type: 'spring', stiffness: 300, damping: 25 } 
    });
  }, [x, maxDrag, permState, onDiscover, requestPermissions, controls]);

  const copyId = useCallback(() => {
    if (!oreyId || oreyId.indexOf('·') !== -1) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(oreyId).then(() => {
        setCopied(true);
        setTimeout(() => { setCopied(false); }, 2000);
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

  const handleGenderSelect = (selected: string | null) => {
    onSetGender(selected);
  };

  const getSearchStatusText = () => {
    if (matchStage === 'gender') {
      const target = gender === 'male' ? 'Females' : 'Males';
      return `Matching ${target} · ${matchTimer}s`;
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
                <span className="styleLabel">Daily Spark:</span>
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
            onClick={() => { 
              setShowNotifSheet(true); 
              onViewNotifications(); 
            }}
            className="bellBtn"
            aria-label="Notifications"
          >
            <Bell size={18} strokeWidth={2.5} />
            {unreadCount > 0 && <span className="bellBadge" />}
          </button>
        </header>

        {!searching && (
          <div className="genderSelector">
            <button
              onClick={() => handleGenderSelect('male')}
              className={`genderBtn ${gender === 'male' ? 'genderBtnActiveMale' : ''}`}
            >
              <User size={16} />
              <span>Male</span>
            </button>
            <button
              onClick={() => handleGenderSelect('female')}
              className={`genderBtn ${gender === 'female' ? 'genderBtnActiveFemale' : ''}`}
            >
              <User size={16} />
              <span>Female</span>
            </button>
            <button
              onClick={() => handleGenderSelect(null)}
              className={`genderBtn ${gender === null ? 'genderBtnActiveAny' : ''}`}
            >
              <Users size={16} />
              <span>Any</span>
            </button>
          </div>
        )}

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
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    role="slider"
                    aria-label="Slide to connect"
                  >
                    <span className="thumbLogo">O</span>
                  </motion.div>
                </div>

                <AnimatePresence mode="wait">
                  {permState === PERM.IDLE && (
                    <motion.p
                      key="hint-idle"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className="permHintIdle"
                    >
                      Camera & microphone required to connect
                    </motion.p>
                  )}

                  {permState === PERM.REQUESTING && (
                    <motion.p
                      key="hint-requesting"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className="permHintRequesting"
                    >
                      Waiting for permission...
                    </motion.p>
                  )}

                  {permState === PERM.DENIED && (
                    <motion.button
                      key="hint-denied"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      onClick={openSettings}
                      className="settingsBtn"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <Settings size={13} style={{ flexShrink: 0 }} />
                      Open App Settings
                    </motion.button>
                  )}
                </AnimatePresence>
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
                <div className="globeContainer">
                  <GlobePulse
                    markers={globeMarkers}
                    speed={0.004}
                    globeColor={[0.85, 0.15, 0.15]}
                    markerColor={[0.94, 0.27, 0.27]}
                  />

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
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
                  ? <Check size={18} style={{ color: '#ef4444' }} />
                  : <Copy size={16} style={{ color: '#94a3b8' }} />
                }
              </div>
            </div>
            <div className="privateBadge">
              <ShieldCheck size={18} style={{ color: '#94a3b8' }} />
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
              onChange={(e) => { setTargetId(e.target.value.toUpperCase().slice(0, 5)); }}
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
            className="overlay"
            onClick={() => { setShowNotifSheet(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="sheet"
              onClick={(e) => { e.stopPropagation(); }}
            >
              <div className="handle" />
              <div className="sheetHeader">
                <h3 className="sheetTitle">Notifications</h3>
                <button
                  onClick={() => { setShowNotifSheet(false); }}
                  className="sheetCloseBtn"
                  aria-label="Close notifications"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="sheetContent">
                {notifications.length === 0 ? (
                  <div className="emptyState">
                    <Bell size={40} className="emptyStateIcon" />
                    <p className="emptyStateText">No activity yet</p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    return (
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
                        {!n.isRead && (
                          <div className="unreadDot" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
