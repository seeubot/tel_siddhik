import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Copy, Check, Heart, Sparkles, Shield, Users, Search, X, 
  ArrowRight, Clock, Bell, MessageCircle, ChevronRight, User,
  Wifi, Battery, Signal
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
  userName,
  setUserName,
  oreyId, 
  oreyIdExpiry,
  searching,
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
  const [nameEditMode, setNameEditMode] = useState(false);
  const [tempName, setTempName] = useState(userName || '');
  const [isOnline, setIsOnline] = useState(true);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (nameEditMode && nameInputRef.current) nameInputRef.current.focus();
  }, [nameEditMode]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handler = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }, []);

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

  const handleNameSave = () => {
    if (tempName.trim()) setUserName(tempName.trim());
    setNameEditMode(false);
  };

  const expiryStr = oreyIdExpiry
    ? new Date(oreyIdExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const genderEmoji = gender === 'male' ? '♂️' : gender === 'female' ? '♀️' : '👤';
  const genderLabel = gender === 'male' ? 'Male' : gender === 'female' ? 'Female' : 'Anyone';

  return (
    <div className={styles.root}>
      {/* iOS Status Bar */}
      <div className={styles.statusBar}>
        <span className={styles.time}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <div className={styles.statusIcons}>
          <Signal size={12} />
          <Wifi size={12} />
          <Battery size={14} />
        </div>
      </div>

      <div className={styles.container}>
        {/* ── Header ── */}
        <header className={styles.header}>
          <div className={styles.headerRow}>
            <div className={styles.avatarStack}>
              <div className={styles.avatar} onClick={() => { setTempName(userName); setNameEditMode(true); }}>
                <User size={22} />
              </div>
              <div className={`${styles.onlineDot} ${isOnline ? styles.dotOnline : styles.dotOffline}`} />
            </div>
            <div className={styles.headerInfo}>
              <h2 className={styles.greeting}>
                {userName ? `Hey, ${userName}` : 'Welcome'}
              </h2>
              <p className={styles.status}>
                {isOnline ? 'Ready to connect' : 'Offline'}
              </p>
            </div>
            <button 
              className={`${styles.notifBtn} ${unreadCount > 0 ? styles.hasNotif : ''}`}
              onClick={() => {
                setShowNotifications(!showNotifications);
                if (onViewNotifications) onViewNotifications();
              }}
            >
              <Bell size={20} />
              {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
            </button>
          </div>
        </header>

        {/* ── Gender & Name Quick Chips ── */}
        <div className={styles.chipRow}>
          <motion.button 
            className={styles.chip}
            onClick={() => setShowGenderModal(true)}
            whileTap={{ scale: 0.96 }}
          >
            <span className={styles.chipEmoji}>{genderEmoji}</span>
            <span className={styles.chipLabel}>{genderLabel}</span>
            <ChevronRight size={14} className={styles.chipArrow} />
          </motion.button>
          <motion.button 
            className={styles.chip}
            onClick={() => { setTempName(userName); setNameEditMode(true); }}
            whileTap={{ scale: 0.96 }}
          >
            <span className={styles.chipLabel}>{userName || 'Set Name'}</span>
            <ChevronRight size={14} className={styles.chipArrow} />
          </motion.button>
        </div>

        {/* ── Name Edit Sheet ── */}
        <AnimatePresence>
          {nameEditMode && (
            <motion.div 
              className={styles.sheetOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNameEditMode(false)}
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
                <h3 className={styles.sheetTitle}>Display Name</h3>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={tempName}
                  onChange={e => setTempName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNameSave()}
                  placeholder="How should we call you?"
                  maxLength={20}
                  className={styles.sheetInput}
                  autoFocus
                />
                <div className={styles.sheetActions}>
                  <button className={styles.sheetBtnSecondary} onClick={() => setNameEditMode(false)}>Cancel</button>
                  <button className={styles.sheetBtnPrimary} onClick={handleNameSave}>Save</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
                <h3 className={styles.sheetTitle}>Who would you like to meet?</h3>
                <p className={styles.sheetSubtitle}>We'll try to match you with your preference first</p>
                
                <div className={styles.genderList}>
                  <motion.button 
                    className={`${styles.genderRow} ${gender === 'male' ? styles.genderRowActive : ''}`}
                    onClick={() => { onSetGender('male'); setShowGenderModal(false); }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={styles.genderRowIcon} style={{ background: 'linear-gradient(135deg, #3b82f6, #60a5fa)' }}>
                      <MaleIcon />
                    </div>
                    <div className={styles.genderRowInfo}>
                      <span className={styles.genderRowLabel}>Male</span>
                      <span className={styles.genderRowDesc}>Match with females</span>
                    </div>
                    {gender === 'male' && <Check size={20} className={styles.checkIcon} />}
                  </motion.button>
                  
                  <motion.button 
                    className={`${styles.genderRow} ${gender === 'female' ? styles.genderRowActive : ''}`}
                    onClick={() => { onSetGender('female'); setShowGenderModal(false); }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={styles.genderRowIcon} style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)' }}>
                      <FemaleIcon />
                    </div>
                    <div className={styles.genderRowInfo}>
                      <span className={styles.genderRowLabel}>Female</span>
                      <span className={styles.genderRowDesc}>Match with males</span>
                    </div>
                    {gender === 'female' && <Check size={20} className={styles.checkIcon} />}
                  </motion.button>
                  
                  <motion.button 
                    className={`${styles.genderRow} ${!gender ? styles.genderRowActive : ''}`}
                    onClick={() => { onSetGender(null); setShowGenderModal(false); }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={styles.genderRowIcon} style={{ background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' }}>
                      <User size={16} />
                    </div>
                    <div className={styles.genderRowInfo}>
                      <span className={styles.genderRowLabel}>Anyone</span>
                      <span className={styles.genderRowDesc}>No preference</span>
                    </div>
                    {!gender && <Check size={20} className={styles.checkIcon} />}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main Action Card ── */}
        <div className={styles.card}>
          {!searching ? (
            <motion.button 
              className={styles.matchBtn}
              onClick={onDiscover}
              whileTap={{ scale: 0.97 }}
            >
              <motion.div 
                className={styles.matchBtnContent}
                animate={{ scale: [1, 1.03, 1] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                <div className={styles.matchBtnIcon}>
                  <Heart size={28} fill="currentColor" />
                </div>
                <span className={styles.matchBtnLabel}>Find Your Match</span>
                <span className={styles.matchBtnSub}>
                  {gender ? `Preference: ${genderLabel}` : 'Open to anyone'}
                </span>
              </motion.div>
            </motion.button>
          ) : (
            <div className={styles.searchingCard}>
              <div className={styles.searchingPulse}>
                <div className={styles.pulseRing1} />
                <div className={styles.pulseRing2} />
                <div className={styles.pulseCenter}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <Search size={24} />
                  </motion.div>
                </div>
              </div>
              <p className={styles.searchingText}>Finding your match</p>
              <p className={styles.searchingSub}>
                {gender ? `Looking for ${gender === 'male' ? 'males' : 'females'}...` : 'Searching for anyone...'}
              </p>
              <button className={styles.cancelBtn} onClick={onCancelSearch}>
                Cancel Search
              </button>
            </div>
          )}
        </div>

        {/* ── Orey ID Card ── */}
        <div className={styles.card}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Your Orey ID</span>
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
          <p className={styles.hint}>Tap to copy • Share with friends</p>
        </div>

        {/* ── Direct Connect Card ── */}
        <div className={styles.card}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Connect with Code</span>
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
                      <Bell size={32} className={styles.emptyIcon} />
                      <p className={styles.emptyTitle}>No Notifications</p>
                      <p className={styles.emptySub}>You're all caught up!</p>
                    </div>
                  ) : (
                    notifications.slice(0, 10).map((n) => (
                      <div key={n.id} className={`${styles.notifRow} ${!n.isRead ? styles.notifUnread : ''}`}>
                        <span className={styles.notifIcon}>{n.icon || '📢'}</span>
                        <div className={styles.notifContent}>
                          <p className={styles.notifTitle}>{n.title}</p>
                          <p className={styles.notifBody}>{n.message}</p>
                          <span className={styles.notifDate}>
                            {new Date(n.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        {!n.isRead && <div className={styles.unreadDot} />}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer ── */}
        <footer className={styles.footer}>
          <Shield size={12} />
          <span>End-to-end encrypted</span>
        </footer>
      </div>
    </div>
  );
}
