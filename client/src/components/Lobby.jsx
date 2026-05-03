import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { 
  Copy, Check, Sparkles, X, 
  ArrowRight, Bell, Globe, ShieldCheck, 
  ArrowRightCircle, SlidersHorizontal, Clock, Zap
} from 'lucide-react';
import styles from './Lobby.module.css';

const MaleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="14" r="5"/><line x1="20" y1="4" x2="13.5" y2="10.5"/><line x1="20" y1="4" x2="16" y2="4"/><line x1="20" y1="4" x2="20" y2="8"/>
  </svg>
);

const FemaleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5"/><line x1="12" y1="13" x2="12" y2="22"/><line x1="9" y1="18" x2="15" y2="18"/><line x1="7" y1="2" x2="17" y2="2"/>
  </svg>
);

const PICKUP_LINES = [
  "Connection is the new currency.",
  "Your digital soulmate is one tap away.",
  "Skip the swipe. Start the spark.",
  "Where mystery meets meaningful.",
  "Modern love, simplified.",
  "Your next story starts here."
];

export default function Lobby({
  oreyId = 'OREY-·····', 
  oreyIdExpiry = null,
  searching = false,
  matchStage = null,
  matchTimer = 3,
  onDiscover = () => {}, 
  onCancelSearch = () => {}, 
  onConnectById = () => {},
  gender = null,
  onSetGender = () => {},
  notifications = [],
  unreadCount = 0,
  onViewNotifications = () => {},
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [showGenderSheet, setShowGenderSheet] = useState(false);
  const [showNotifSheet, setShowNotifSheet] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);

  const x = useMotionValue(0);
  const thumbWidth = 56;
  const opacity = useTransform(x, [0, 236 - thumbWidth], [1, 0]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLineIndex((prev) => (prev + 1) % PICKUP_LINES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const copyId = useCallback(() => {
    if (!oreyId || oreyId === 'OREY-·····') return;
    navigator.clipboard.writeText(oreyId).then(() => {
      setCopied(true); 
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }, [oreyId]);

  const handleConnect = useCallback(() => {
    const trimmed = targetId.trim().toUpperCase().replace('OREY-', '');
    if (trimmed.length === 5) {
      onConnectById('OREY-' + trimmed);
      setTargetId('');
    }
  }, [targetId, onConnectById]);

  const handleGenderSelect = useCallback((value) => {
    onSetGender(value);
    setShowGenderSheet(false);
  }, [onSetGender]);

  const handleNotifOpen = useCallback(() => {
    setShowNotifSheet(true);
    if (onViewNotifications) onViewNotifications();
  }, [onViewNotifications]);

  const handleDragEnd = () => {
    if (x.get() > 180) {
      onDiscover();
    }
    x.set(0);
  };

  const expiryStr = oreyIdExpiry 
    ? new Date(oreyIdExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    : null;

  return (
    <div className={styles.root}>
      {/* Premium Ambient Background */}
      <div className={styles.bgGradient}>
        <div className={styles.bgGlowTop} />
        <div className={styles.bgGlowBottom} />
      </div>

      <div className={styles.container}>
        {/* Header with Notifications */}
        <nav className={styles.nav}>
          <button 
            onClick={handleNotifOpen}
            className={styles.bellBtn}
          >
            <Bell size={22} strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className={styles.bellBadge} />
            )}
          </button>
        </nav>

        {/* Branding Section */}
        <header className={styles.branding}>
          <h1 className={styles.logo}>
            Orey<span className={styles.logoAccent}>!</span>
          </h1>
          <div className={styles.taglineContainer}>
            <AnimatePresence mode="wait">
              <motion.p 
                key={lineIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={styles.tagline}
              >
                {PICKUP_LINES[lineIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </header>

        {/* Interaction Body */}
        <main className={styles.main}>
          {!searching ? (
            <div className={styles.idleContent}>
              {/* Discovery Slider */}
              <div className={styles.sliderContainer}>
                <div className={styles.sliderTrack}>
                  <motion.div 
                    style={{ opacity }}
                    className={styles.sliderHint}
                  >
                    <span className={styles.sliderHintText}>
                      Slide to Discover
                    </span>
                  </motion.div>
                  
                  <motion.div
                    drag="x"
                    dragConstraints={{ left: 0, right: 236 }}
                    dragElastic={0.1}
                    onDragEnd={handleDragEnd}
                    style={{ x }}
                    className={styles.sliderThumb}
                  >
                    <ArrowRightCircle size={24} className={styles.sliderThumbIcon} />
                  </motion.div>
                </div>

                <button 
                  onClick={() => setShowGenderSheet(true)}
                  className={styles.prefsBtn}
                >
                  <SlidersHorizontal size={14} />
                  <span className={styles.prefsLabel}>
                    Preferences: <span className={styles.prefsValue}>
                      {gender ? (gender === 'male' ? 'Males' : 'Females') : 'Global'}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.searchingContent}>
              {/* Stage Badge */}
              {matchStage && (
                <div className={`${styles.stageBadge} ${
                  matchStage === 'gender' ? styles.stageGender : styles.stageOpen
                }`}>
                  {matchStage === 'gender' ? (
                    <><Zap size={12} />Gender Match • {matchTimer}s</>
                  ) : (
                    <><Globe size={12} />Open Search</>
                  )}
                </div>
              )}

              {/* Timer & Pulse */}
              <div className={styles.pulseContainer}>
                <motion.div
                  animate={{ scale: [1, 1.5], opacity: [0.3, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={styles.pulseRing}
                />
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  className={styles.pulseIcon}
                >
                  <Sparkles size={32} />
                </motion.div>
                <div className={styles.timer}>
                  {matchTimer}s
                </div>
                <div className={styles.searchingLabel}>
                  <span className={styles.searchingDot} />
                  <span className={styles.searchingText}>
                    Searching...
                  </span>
                </div>
              </div>
              
              <button 
                onClick={onCancelSearch}
                className={styles.cancelBtn}
              >
                Abort Search
              </button>
            </div>
          )}
        </main>

        {/* Identity Bar */}
        <section className={styles.identitySection}>
          <div className={styles.identityContent}>
            <div className={styles.idRow}>
              <div onClick={copyId} className={styles.idBlock}>
                <div className={styles.idLabelRow}>
                  <span className={styles.idLabel}>Your ID</span>
                  {expiryStr && (
                    <span className={styles.idExpiry}>
                      <Clock size={8} />{expiryStr}
                    </span>
                  )}
                </div>
                <div className={styles.idDisplay}>
                  <span className={styles.idCode}>{oreyId}</span>
                  {copied ? (
                    <Check size={16} className={styles.copySuccess} />
                  ) : (
                    <Copy size={14} className={styles.copyIcon} />
                  )}
                </div>
              </div>
              
              <div className={styles.privateBadge}>
                <ShieldCheck size={16} className={styles.privateIcon} />
                <span className={styles.privateText}>Private</span>
              </div>
            </div>

            {/* Connect Input */}
            <div className={styles.connectCard}>
              <span className={styles.connectPrefix}>OREY-</span>
              <input 
                type="text"
                placeholder="ENTER ID"
                maxLength={5}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value.toUpperCase().slice(0, 5))}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                className={styles.connectInput}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button 
                onClick={handleConnect}
                disabled={targetId.length !== 5}
                className={`${styles.connectBtn} ${
                  targetId.length === 5 ? styles.connectBtnActive : styles.connectBtnDisabled
                }`}
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </section>

        {/* Gender Preference Sheet */}
        <AnimatePresence>
          {showGenderSheet && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={styles.sheetOverlay}
              onClick={() => setShowGenderSheet(false)}
            >
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                onClick={(e) => e.stopPropagation()}
                className={styles.sheetContent}
              >
                <div className={styles.sheetHandle} />
                <h3 className={styles.sheetTitle}>Show me</h3>
                <div className={styles.genderOptions}>
                  {[
                    { id: 'male', label: 'Males', icon: <MaleIcon />, color: '#3b82f6' },
                    { id: 'female', label: 'Females', icon: <FemaleIcon />, color: '#ec4899' },
                    { id: null, label: 'Anyone (Global)', icon: <Globe size={18} />, color: '#8b5cf6' }
                  ].map((opt) => (
                    <button
                      key={opt.id ?? 'any'}
                      onClick={() => handleGenderSelect(opt.id)}
                      className={`${styles.genderOption} ${
                        gender === opt.id ? styles.genderOptionActive : styles.genderOptionInactive
                      }`}
                    >
                      <span style={{ color: gender === opt.id ? 'white' : opt.color }}>
                        {opt.icon}
                      </span>
                      <span className={styles.genderOptionLabel}>{opt.label}</span>
                      {gender === opt.id && <Check size={18} className={styles.genderOptionCheck} />}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setShowGenderSheet(false)} 
                  className={styles.dismissBtn}
                >
                  Dismiss
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
              className={styles.sheetOverlay}
              onClick={() => setShowNotifSheet(false)}
            >
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                onClick={(e) => e.stopPropagation()}
                className={`${styles.sheetContent} ${styles.sheetNotif}`}
              >
                <div className={styles.sheetHandle} />
                <div className={styles.sheetHeader}>
                  <h3 className={styles.sheetTitle}>Notifications</h3>
                  <button 
                    onClick={() => setShowNotifSheet(false)}
                    className={styles.sheetClose}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className={styles.notifScroll}>
                  {notifications.length === 0 ? (
                    <div className={styles.notifEmpty}>
                      <Bell size={48} className={styles.notifEmptyIcon} />
                      <p className={styles.notifEmptyTitle}>All clear!</p>
                      <p className={styles.notifEmptyText}>No new notifications</p>
                    </div>
                  ) : (
                    notifications.slice(0, 15).map((n) => (
                      <div 
                        key={n.id} 
                        className={`${styles.notifItem} ${
                          !n.isRead ? styles.notifItemUnread : styles.notifItemRead
                        }`}
                      >
                        <span className={styles.notifIcon}>{n.icon || '📢'}</span>
                        <div className={styles.notifBody}>
                          <p className={styles.notifTitle}>{n.title}</p>
                          <p className={styles.notifMessage}>{n.message}</p>
                          <p className={styles.notifTime}>
                            {new Date(n.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        {!n.isRead && (
                          <span className={styles.notifDot} />
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
