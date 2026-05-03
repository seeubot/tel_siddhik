import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { 
  Copy, Check, X, ArrowRight, Bell, 
  Globe, ShieldCheck, ArrowRightCircle, SlidersHorizontal,
  Settings, Users
} from 'lucide-react';
import styles from './Lobby.module.css';

const PICKUP_LINES = [
  "Connection is the new currency.",
  "Your digital soulmate is one tap away.",
  "Skip the swipe. Start the spark.",
  "Where mystery meets meaningful.",
  "Modern love, simplified.",
  "Your next story starts here."
];

/**
 * Lobby Component
 * Handles the main landing state, discovery triggers, and identity management.
 * * Props from Parent/Backend:
 * @param {string} oreyId - Unique user identification string
 * @param {boolean} searching - Global state indicating if match search is active
 * @param {number} matchTimer - Countdown timer value from backend
 * @param {function} onDiscover - Triggered when slider reaches threshold
 * @param {function} onCancelSearch - Triggered to abort searching
 * @param {function} onConnectById - Triggered for direct ID entry
 * @param {string|null} gender - Current target filter ('male', 'female', null)
 * @param {function} onSetGender - Updates the target filter
 * @param {number} unreadCount - Notification count
 * @param {function} onSettings - Open settings panel
 * @param {function} onContacts - Open contacts/friends list
 */
export default function Lobby({
  oreyId = 'OREY-·····', 
  searching = false,
  matchTimer = 0,
  onDiscover = () => {}, 
  onCancelSearch = () => {}, 
  onConnectById = () => {},
  gender = null,
  onSetGender = () => {},
  unreadCount = 0,
  onSettings = () => {},
  onContacts = () => {},
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [showGenderSheet, setShowGenderSheet] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);

  // Framer Motion Slider State
  const x = useMotionValue(0);
  const sliderWidth = 300; // Track width
  const thumbWidth = 56;  // Approx 3.5rem
  const maxDrag = sliderWidth - thumbWidth - 16; // Bounds check
  
  const opacity = useTransform(x, [0, maxDrag - 40], [1, 0]);

  // Pickup line rotator
  useEffect(() => {
    const interval = setInterval(() => {
      setLineIndex((prev) => (prev + 1) % PICKUP_LINES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const copyId = useCallback(() => {
    if (!oreyId || oreyId.includes('·')) return;
    navigator.clipboard.writeText(oreyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback for environments without clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = oreyId;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      document.body.removeChild(textArea);
    });
  }, [oreyId]);

  const handleConnect = useCallback(() => {
    const trimmed = targetId.trim().toUpperCase().replace('OREY-', '');
    if (trimmed.length === 5) {
      onConnectById(`OREY-${trimmed}`);
      setTargetId('');
    }
  }, [targetId, onConnectById]);

  const handleDragEnd = (event, info) => {
    // If dragged more than 80% of the way
    if (info.offset.x > maxDrag * 0.8) {
      onDiscover();
    }
    x.set(0); // Snap back to start
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && targetId.length >= 5) {
      handleConnect();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.backgroundAura}>
        <div className={styles.auraTop} />
        <div className={styles.auraBottom} />
      </div>

      <div className={styles.wrapper}>
        {/* Improved Navigation */}
        <nav className={styles.nav}>
          <div className={styles.navLeft}>
            <span className={styles.miniLogo}>
              Orey<span className={styles.miniLogoAccent}>!</span>
            </span>
          </div>
          
          <div className={styles.navRight}>
            <button 
              onClick={onContacts}
              className={styles.navButton}
              aria-label="Contacts"
            >
              <Users size={20} strokeWidth={1.5} />
            </button>
            
            <button 
              className={styles.bellButton}
              aria-label="Notifications"
            >
              <Bell size={20} strokeWidth={1.5} />
              {unreadCount > 0 && <span className={styles.notificationBadge} />}
            </button>
            
            <button 
              onClick={onSettings}
              className={styles.navButton}
              aria-label="Settings"
            >
              <Settings size={20} strokeWidth={1.5} />
            </button>
          </div>
        </nav>

        <header className={styles.header}>
          <h1 className={styles.logo}>
            Orey<span className={styles.logoAccent}>!</span>
          </h1>
          <div className={styles.pickupLineContainer}>
            <AnimatePresence mode="wait">
              <motion.p 
                key={lineIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className={styles.pickupLine}
              >
                {PICKUP_LINES[lineIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </header>

        <main className={styles.main}>
          {!searching ? (
            <div className={styles.sliderContainer}>
              <div className={styles.sliderTrack}>
                <motion.div style={{ opacity }} className={styles.sliderLabel}>
                  Slide to Discover
                </motion.div>
                
                <motion.div
                  drag="x"
                  dragConstraints={{ left: 0, right: maxDrag }}
                  dragElastic={0.05}
                  onDragEnd={handleDragEnd}
                  style={{ x }}
                  className={styles.sliderThumb}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <ArrowRightCircle size={24} color="#0f172a" />
                </motion.div>
              </div>

              <button 
                onClick={() => setShowGenderSheet(true)}
                className={styles.preferenceButton}
              >
                <SlidersHorizontal size={14} />
                <span className={styles.preferenceLabel}>
                  Preferences: <span className={styles.preferenceValue}>
                    {gender ? (gender === 'male' ? 'Males' : 'Females') : 'Global'}
                  </span>
                </span>
              </button>
            </div>
          ) : (
            <div className={styles.searchingContainer}>
              <div className={styles.timerWrapper}>
                <motion.div 
                  className={styles.timerText}
                  key={matchTimer}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {matchTimer}s
                </motion.div>
                <div className={styles.statusRow}>
                  <span className={styles.pingDot} />
                  <span className={styles.statusText}>Searching...</span>
                </div>
              </div>
              
              <button onClick={onCancelSearch} className={styles.abortButton}>
                Abort Search
              </button>
            </div>
          )}
        </main>

        <section className={styles.identitySection}>
          <div className={styles.idRow}>
            <div onClick={copyId} className={styles.idDisplay}>
              <span className={styles.idLabel}>Your ID</span>
              <div className={styles.idValueContainer}>
                <span className={styles.idValue}>{oreyId}</span>
                <motion.div
                  initial={false}
                  animate={{ scale: copied ? [1, 1.2, 1] : 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {copied ? (
                    <Check size={16} color="#10b981" />
                  ) : (
                    <Copy size={14} color="#475569" />
                  )}
                </motion.div>
              </div>
            </div>
            
            <div className={styles.privateBadge}>
              <ShieldCheck size={16} color="#64748b" />
              <span className={styles.privateLabel}>Private</span>
            </div>
          </div>

          <div className={styles.directInputBar}>
            <input 
              type="text"
              placeholder="ENTER FRIEND ID"
              maxLength={10}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              className={styles.directInput}
            />
            <button 
              onClick={handleConnect}
              disabled={targetId.length < 5}
              className={`${styles.directSubmit} ${targetId.length >= 5 ? styles.submitActive : styles.submitInactive}`}
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </section>

        {/* Gender Selection Sheet */}
        <AnimatePresence>
          {showGenderSheet && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowGenderSheet(false)}
                className={styles.sheetOverlay}
              />
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className={styles.sheet}
              >
                <div className={styles.sheetHandle} />
                <div className={styles.sheetOptions}>
                  {[
                    { id: null, label: 'Global (Everyone)', icon: <Globe size={18} /> },
                    { id: 'male', label: 'Connect with Males', icon: '♂' },
                    { id: 'female', label: 'Connect with Females', icon: '♀' }
                  ].map((opt) => (
                    <motion.button
                      key={opt.id}
                      onClick={() => { onSetGender(opt.id); setShowGenderSheet(false); }}
                      className={`${styles.optionButton} ${gender === opt.id ? styles.optionActive : ''}`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className={styles.optionIcon}>{opt.icon}</span>
                      <span className={styles.optionLabel}>{opt.label}</span>
                    </motion.button>
                  ))}
                </div>
                <button 
                  onClick={() => setShowGenderSheet(false)} 
                  className={styles.sheetClose}
                >
                  Dismiss
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
