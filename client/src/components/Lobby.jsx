import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Copy, Check, Heart, Sparkles, Shield, Users, X, 
  ArrowRight, Clock, Bell, ChevronRight, User, Zap, Globe
} from 'lucide-react';
import styles from './Lobby.module.css';

const MaleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="14" r="5"/>
    <line x1="20" y1="4" x2="13.5" y2="10.5"/>
    <line x1="20" y1="4" x2="16" y2="4"/>
    <line x1="20" y1="4" x2="20" y2="8"/>
  </svg>
);

const FemaleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5"/>
    <line x1="12" y1="13" x2="12" y2="22"/>
    <line x1="9" y1="18" x2="15" y2="18"/>
    <line x1="7" y1="2" x2="17" y2="2"/>
  </svg>
);

export default function Lobby({
  oreyId, 
  oreyIdExpiry,
  searching,
  matchStage,        // 'gender' | 'anyone' | null
  matchTimer,        // countdown seconds
  onDiscover, 
  onCancelSearch, 
  onConnectById,
  gender = null,
  onSetGender = () => {},
  notifications = [],
  unreadCount = 0,
  onViewNotifications,
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const copyId = () => {
    if (!oreyId) return;
    navigator.clipboard.writeText(oreyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = oreyId;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleConnect = () => {
    const trimmed = targetId.trim().toUpperCase();
    const formattedId = trimmed.startsWith('OREY-') ? trimmed : `OREY-${trimmed}`;
    if (formattedId.length === 10) onConnectById(formattedId);
  };

  const expiryStr = oreyIdExpiry
    ? new Date(oreyIdExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const genderEmoji = gender === 'male' ? '♂️' : gender === 'female' ? '♀️' : '🌐';
  const genderLabel = gender === 'male' ? 'Male' : gender === 'female' ? 'Female' : 'Anyone';

  return (
    <div className={styles.root}>
      {/* Background */}
      <div className={styles.bgOrb} />
      <div className={styles.bgOrb2} />
      
      <div className={styles.container}>
        {/* ── Logo ── */}
        <header className={styles.header}>
          <motion.h1 
            className={styles.logo}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className={styles.logoIcon}>🔷</span>
            Orey<span className={styles.logoAccent}>!</span>
          </motion.h1>
          <p className={styles.tagline}>Connect • Chat • Share</p>
        </header>

        {/* ── Quick Chips Row ── */}
        <div className={styles.chipRow}>
          <motion.button 
            className={`${styles.chip} ${gender ? styles.chipActive : ''}`}
            onClick={() => setShowGenderModal(true)}
            whileTap={{ scale: 0.96 }}
          >
            <span className={styles.chipEmoji}>{genderEmoji}</span>
            <span className={styles.chipLabel}>{gender ? genderLabel : 'Set Preference'}</span>
            <ChevronRight size={14} className={styles.chipArrow} />
          </motion.button>
          
          {unreadCount > 0 && (
            <motion.button 
              className={styles.chip}
              onClick={() => {
                setShowNotifications(true);
                if (onViewNotifications) onViewNotifications();
              }}
              whileTap={{ scale: 0.96 }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
            >
              <Bell size={14} />
              <span className={styles.chipLabel}>{unreadCount} new</span>
            </motion.button>
          )}
        </div>

        {/* ── Gender Selection Sheet ── */}
        <AnimatePresence>
          {showGenderModal && (
            <motion.div 
              className={styles.sheetOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGenderModal(false)}
            >
              <motion.div 
                className={styles.sheet}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                onClick={e => e.stopPropagation()}
              >
                <div className={styles.sheetHandle} />
                <h3 className={styles.sheetTitle}>Match Preference</h3>
                <p className={styles.sheetSubtitle}>We'll try your preference for 3 seconds</p>
                
                <div className={styles.genderList}>
                  {[
                    { value: 'male', icon: <MaleIcon />, label: 'Male', desc: 'Match with females', color: '#3b82f6' },
                    { value: 'female', icon: <FemaleIcon />, label: 'Female', desc: 'Match with males', color: '#ec4899' },
                    { value: null, icon: <Globe size={16} />, label: 'Anyone', desc: 'Fastest matching', color: '#8b5cf6' },
                  ].map(({ value, icon, label, desc, color }) => (
                    <motion.button 
                      key={value ?? 'anyone'}
                      className={`${styles.genderRow} ${gender === value ? styles.genderRowActive : ''}`}
                      onClick={() => { onSetGender(value); setShowGenderModal(false); }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className={styles.genderRowIcon} style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}>
                        {icon}
                      </div>
                      <div className={styles.genderRowInfo}>
                        <span className={styles.genderRowLabel}>{label}</span>
                        <span className={styles.genderRowDesc}>{desc}</span>
                      </div>
                      {gender === value && <Check size={20} className={styles.checkIcon} />}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main Action ── */}
        <div className={styles.mainCard}>
          {!searching ? (
            <motion.button 
              className={styles.matchBtn}
              onClick={onDiscover}
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.02 }}
            >
              <div className={styles.matchBtnShimmer} />
              <div className={styles.matchBtnContent}>
                <motion.div 
                  className={styles.matchBtnIconWrap}
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Heart size={30} fill="currentColor" className={styles.heartIcon} />
                </motion.div>
                <span className={styles.matchBtnLabel}>Find Match</span>
                {gender && (
                  <span className={styles.matchBtnPref}>
                    {gender === 'male' ? '♀️ Prefer Female' : '♂️ Prefer Male'}
                  </span>
                )}
              </div>
            </motion.button>
          ) : (
            <div className={styles.searchingCard}>
              {/* Stage indicator */}
              <div className={styles.stageBadge}>
                {matchStage === 'gender' ? (
                  <span className={styles.stageGender}>
                    <Zap size={12} /> Gender Match • {matchTimer}s
                  </span>
                ) : (
                  <span className={styles.stageAnyone}>
                    <Globe size={12} /> Open Match
                  </span>
                )}
              </div>
              
              {/* Animated rings */}
              <div className={styles.searchingPulse}>
                <motion.div 
                  className={styles.pulseRing}
                  animate={{ scale: [1, 1.5], opacity: [1, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                />
                <motion.div 
                  className={styles.pulseRing}
                  animate={{ scale: [1, 1.5], opacity: [1, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.75 }}
                />
                <div className={styles.pulseCenter}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles size={28} />
                  </motion.div>
                </div>
              </div>
              
              <p className={styles.searchingText}>Finding your match...</p>
              <p className={styles.searchingSub}>
                {matchStage === 'gender' 
                  ? `Prioritizing ${gender === 'male' ? 'females' : 'males'}`
                  : 'Connecting with anyone available'}
              </p>
              
              <button className={styles.cancelBtn} onClick={onCancelSearch}>
                <X size={16} /> Cancel
              </button>
            </div>
          )}
        </div>

        {/* ── Orey ID Card ── */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Your Orey ID</span>
            {expiryStr && (
              <span className={styles.expiry}>
                <Clock size={10} /> Expires {expiryStr}
              </span>
            )}
          </div>
          <div className={styles.idBox}>
            <code className={styles.idCode} onClick={copyId}>
              {oreyId || 'OREY-·····'}
            </code>
            <motion.button 
              className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
              onClick={copyId}
              whileTap={{ scale: 0.9 }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </motion.button>
          </div>
          <p className={styles.hint}>Tap to copy • Share to connect</p>
        </div>

        {/* ── Direct Connect Card ── */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Connect with Code</span>
          </div>
          <div className={styles.connectRow}>
            <div className={styles.inputBox}>
              <span className={styles.inputPrefix}>OREY-</span>
              <input
                className={styles.codeInput}
                type="text"
                placeholder="XXXXX"
                maxLength={5}
                value={targetId.replace('OREY-', '')}
                onChange={(e) => setTargetId(e.target.value.toUpperCase().replace('OREY-', ''))}
                onKeyDown={(e) => e.key === 'Enter' && targetId.length === 5 && handleConnect()}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <motion.button
              className={`${styles.goBtn} ${targetId.length === 5 ? styles.goBtnActive : ''}`}
              onClick={handleConnect}
              disabled={targetId.length !== 5}
              whileTap={{ scale: 0.93 }}
            >
              <ArrowRight size={18} />
            </motion.button>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className={styles.footer}>
          <Shield size={10} />
          <span>Encrypted • Private • Secure</span>
        </footer>
      </div>

      {/* ── Notifications Sheet ── */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div 
            className={styles.sheetOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowNotifications(false)}
          >
            <motion.div 
              className={styles.sheet}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.sheetHandle} />
              <div className={styles.sheetHeader}>
                <h3 className={styles.sheetTitle}>Notifications</h3>
                <button onClick={() => setShowNotifications(false)} className={styles.sheetClose}>
                  <X size={20} />
                </button>
              </div>
              
              <div className={styles.notifList}>
                {notifications.length === 0 ? (
                  <div className={styles.emptyState}>
                    <Bell size={40} className={styles.emptyIcon} />
                    <p className={styles.emptyTitle}>All Clear</p>
                    <p className={styles.emptySub}>No new notifications</p>
                  </div>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <motion.div 
                      key={n.id} 
                      className={`${styles.notifRow} ${!n.isRead ? styles.notifUnread : ''}`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                    >
                      <span className={styles.notifIcon}>{n.icon || '📢'}</span>
                      <div className={styles.notifContent}>
                        <p className={styles.notifTitle}>{n.title}</p>
                        <p className={styles.notifBody}>{n.message}</p>
                        <span className={styles.notifDate}>
                          {new Date(n.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      {!n.isRead && <div className={styles.unreadDot} />}
                    </motion.div>
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
