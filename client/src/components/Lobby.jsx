import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Copy, Check, Zap, Hash, Loader2, Heart, Sparkles, Shield, Users,
  Search, X, ArrowRight, Clock, AlertCircle, Info, MessageCircle
} from 'lucide-react';
import styles from './Lobby.module.css';

// Custom SVG icons
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
  const [activeTab, setActiveTab] = useState('connect'); // 'connect' | 'notifications'
  const [showNotifications, setShowNotifications] = useState(false);
  const [nameEditMode, setNameEditMode] = useState(false);
  const [tempName, setTempName] = useState(userName || '');
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (nameEditMode && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [nameEditMode]);

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
    if (tempName.trim()) {
      setUserName(tempName.trim());
    }
    setNameEditMode(false);
  };

  const expiryStr = oreyIdExpiry
    ? new Date(oreyIdExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const genderLabel = gender === 'male' ? 'Male' : gender === 'female' ? 'Female' : 'Anyone';
  const genderShort = gender === 'male' ? '♂' : gender === 'female' ? '♀' : 'All';

  return (
    <div className={styles.root}>
      {/* Background Effects */}
      <div className={styles.bgGlow} />
      <div className={styles.bgGrid} />
      
      <div className={styles.container}>
        {/* ── Header ── */}
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <h1 className={styles.logo}>
              Orey<span>!</span>
            </h1>
            <div className={styles.headerActions}>
              {/* Notification Bell */}
              <button 
                className={`${styles.iconBtn} ${unreadCount > 0 ? styles.hasNotifications : ''}`}
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (onViewNotifications) onViewNotifications();
                }}
                title="Notifications"
              >
                <MessageCircle size={18} />
                {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
              </button>
            </div>
          </div>
          <p className={styles.subtitle}>Connect • Chat • Share</p>
        </header>

        {/* ── Quick Actions Bar ── */}
        <div className={styles.quickBar}>
          <div className={styles.quickLeft}>
            {/* Gender Quick Select */}
            <button 
              className={styles.genderChip}
              onClick={() => setShowGenderModal(true)}
            >
              {gender === 'male' ? <MaleIcon /> : gender === 'female' ? <FemaleIcon /> : <Users size={14} />}
              <span>{genderShort}</span>
            </button>

            {/* Name Display */}
            <button 
              className={styles.nameChip}
              onClick={() => { setTempName(userName); setNameEditMode(true); }}
            >
              {userName || 'Anonymous'}
            </button>
          </div>
        </div>

        {/* ── Name Edit Modal ── */}
        <AnimatePresence>
          {nameEditMode && (
            <motion.div 
              className={styles.modalOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNameEditMode(false)}
            >
              <motion.div 
                className={styles.miniModal}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
              >
                <h3>Your Display Name</h3>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={tempName}
                  onChange={e => setTempName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNameSave()}
                  placeholder="Enter name..."
                  maxLength={20}
                  className={styles.nameInput}
                  autoFocus
                />
                <div className={styles.modalActions}>
                  <button className={styles.btnSecondary} onClick={() => setNameEditMode(false)}>Cancel</button>
                  <button className={styles.btnPrimary} onClick={handleNameSave}>Save</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Gender Modal ── */}
        <AnimatePresence>
          {showGenderModal && (
            <motion.div 
              className={styles.modalOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGenderModal(false)}
            >
              <motion.div 
                className={styles.modal}
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                onClick={e => e.stopPropagation()}
              >
                <h3>Who would you like to meet?</h3>
                <p>We'll try to match you with your preference first</p>
                
                <div className={styles.genderOptions}>
                  <button 
                    className={`${styles.genderOption} ${gender === 'male' ? styles.genderOptionActive : ''}`}
                    onClick={() => { onSetGender('male'); setShowGenderModal(false); }}
                  >
                    <div className={styles.genderCircle}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="10" cy="14" r="5"/>
                        <line x1="20" y1="4" x2="13.5" y2="10.5"/>
                        <line x1="20" y1="4" x2="16" y2="4"/>
                        <line x1="20" y1="4" x2="20" y2="8"/>
                      </svg>
                    </div>
                    <span>Male</span>
                  </button>
                  
                  <button 
                    className={`${styles.genderOption} ${gender === 'female' ? styles.genderOptionActive : ''}`}
                    onClick={() => { onSetGender('female'); setShowGenderModal(false); }}
                  >
                    <div className={styles.genderCircle}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="5"/>
                        <line x1="12" y1="13" x2="12" y2="22"/>
                        <line x1="9" y1="18" x2="15" y2="18"/>
                      </svg>
                    </div>
                    <span>Female</span>
                  </button>
                  
                  <button 
                    className={`${styles.genderOption} ${!gender ? styles.genderOptionActive : ''}`}
                    onClick={() => { onSetGender(null); setShowGenderModal(false); }}
                  >
                    <div className={styles.genderCircle}>
                      <Users size={24} />
                    </div>
                    <span>Anyone</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main Action: Find Match ── */}
        <motion.div 
          className={styles.mainAction}
          whileTap={{ scale: 0.98 }}
        >
          {!searching ? (
            <button className={styles.matchBtn} onClick={onDiscover}>
              <motion.div 
                className={styles.matchBtnInner}
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Heart size={22} fill="currentColor" />
                <span>Find Your Match</span>
                <Sparkles size={16} />
              </motion.div>
              <div className={styles.matchBtnGlow} />
            </button>
          ) : (
            <div className={styles.searchingBox}>
              <motion.div 
                className={styles.searchingRing}
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              >
                <div className={styles.searchingRingInner} />
              </motion.div>
              <div className={styles.searchingContent}>
                <Loader2 size={18} className={styles.spinner} />
                <p className={styles.searchingTitle}>Finding your match</p>
                <p className={styles.searchingSub}>
                  {gender ? `Looking for ${gender === 'male' ? 'males' : 'females'}...` : 'Searching for anyone...'}
                </p>
              </div>
              <button className={styles.cancelBtn} onClick={onCancelSearch}>
                <X size={16} /> Cancel
              </button>
            </div>
          )}
        </motion.div>

        {/* ── Orey ID Card ── */}
        <div className={styles.card}>
          <div className={styles.idHeader}>
            <span className={styles.idLabel}>Your Orey ID</span>
            {expiryStr && (
              <span className={styles.expiryBadge}>
                <Clock size={10} /> {expiryStr}
              </span>
            )}
          </div>
          
          <div className={styles.idDisplay}>
            <code className={styles.idText}>{oreyId || 'OREY-·····'}</code>
            <motion.button 
              className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
              onClick={copyId}
              whileTap={{ scale: 0.9 }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </motion.button>
          </div>
          
          <p className={styles.idHint}>Share this code to connect instantly</p>
        </div>

        {/* ── Direct Connect ── */}
        <div className={styles.card}>
          <div className={styles.connectHeader}>
            <Hash size={14} />
            <span>Connect with code</span>
          </div>
          
          <div className={styles.connectInputGroup}>
            <div className={styles.inputWrapper}>
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
              />
            </div>
            <motion.button
              className={`${styles.connectBtn} ${targetId.length === 5 ? styles.connectBtnActive : ''}`}
              onClick={handleConnect}
              disabled={targetId.length !== 5}
              whileTap={{ scale: 0.95 }}
            >
              <ArrowRight size={18} />
            </motion.button>
          </div>
        </div>

        {/* ── Notifications Panel ── */}
        <AnimatePresence>
          {showNotifications && (
            <motion.div 
              className={styles.card}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className={styles.notifHeader}>
                <h3>Notifications</h3>
                <button 
                  className={styles.closeNotifBtn}
                  onClick={() => setShowNotifications(false)}
                >
                  <X size={16} />
                </button>
              </div>
              
              {notifications.length === 0 ? (
                <div className={styles.emptyNotif}>
                  <Info size={20} />
                  <p>No new notifications</p>
                </div>
              ) : (
                <div className={styles.notifList}>
                  {notifications.slice(0, 5).map((n) => (
                    <div key={n.id} className={styles.notifItem}>
                      <span className={styles.notifIcon}>{n.icon || '📢'}</span>
                      <div className={styles.notifContent}>
                        <p className={styles.notifTitle}>{n.title}</p>
                        <p className={styles.notifMsg}>{n.message}</p>
                        <span className={styles.notifTime}>
                          {new Date(n.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer ── */}
        <footer className={styles.footer}>
          <Shield size={10} />
          <span>Encrypted • Private • Secure</span>
        </footer>
      </div>
    </div>
  );
}
