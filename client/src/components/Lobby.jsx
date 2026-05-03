import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Copy, Check, Heart, Sparkles, Shield, X, 
  ArrowRight, Clock, Bell, ChevronRight, User, Zap, Globe
} from 'lucide-react';
import styles from './Lobby.module.css';

const MaleIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="14" r="5"/><line x1="20" y1="4" x2="13.5" y2="10.5"/><line x1="20" y1="4" x2="16" y2="4"/><line x1="20" y1="4" x2="20" y2="8"/>
  </svg>
);

const FemaleIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5"/><line x1="12" y1="13" x2="12" y2="22"/><line x1="9" y1="18" x2="15" y2="18"/><line x1="7" y1="2" x2="17" y2="2"/>
  </svg>
);

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

  const copyId = useCallback(() => {
    if (!oreyId || oreyId === 'OREY-·····') return;
    navigator.clipboard.writeText(oreyId).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
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
    onViewNotifications();
  }, [onViewNotifications]);

  const expiryStr = oreyIdExpiry 
    ? new Date(oreyIdExpiry).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) 
    : null;

  const genderIcon = gender === 'male' ? '♂️' : gender === 'female' ? '♀️' : null;

  return (
    <div className={styles.root}>
      <div className={styles.bgGradient} />
      
      <div className={styles.container}>
        {/* ── Top Bar: Logo + Notification ── */}
        <div className={styles.topBar}>
          {/* Logo */}
          <div className={styles.logoBlock}>
            <span className={styles.logoIcon}>🔷</span>
            <h1 className={styles.logo}>
              Orey<span className={styles.logoAccent}>!</span>
            </h1>
          </div>

          {/* Notification Bell (always visible) */}
          <button 
            className={`${styles.bellBtn} ${unreadCount > 0 ? styles.bellActive : ''}`}
            onClick={handleNotifOpen}
          >
            <Bell size={18} />
            {unreadCount > 0 && <span className={styles.bellBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
        </div>

        <p className={styles.tagline}>Connect • Chat • Share</p>

        {/* ── Match Card ── */}
        <div className={styles.matchCard}>
          {!searching ? (
            <>
              {/* Gender chip */}
              <button 
                className={`${styles.genderChip} ${gender ? styles.genderChipSet : ''}`}
                onClick={() => setShowGenderSheet(true)}
              >
                {genderIcon ? (
                  <span className={styles.genderEmoji}>{genderIcon}</span>
                ) : (
                  <Globe size={13} />
                )}
                <span>{gender ? (gender === 'male' ? 'Female' : 'Male') : 'Anyone'}</span>
                <ChevronRight size={11} />
              </button>

              {/* Match Button */}
              <motion.button 
                className={styles.matchBtn}
                onClick={onDiscover}
                whileTap={{ scale: 0.96 }}
              >
                <motion.span 
                  className={styles.matchBtnLabel}
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Heart size={20} fill="currentColor" className={styles.matchHeart} />
                  Find Match
                </motion.span>
              </motion.button>
            </>
          ) : (
            <div className={styles.searchingBlock}>
              {/* Stage badge */}
              <span className={`${styles.stageBadge} ${matchStage === 'gender' ? styles.stageGender : styles.stageOpen}`}>
                {matchStage === 'gender' ? (
                  <><Zap size={10} /> Gender • {matchTimer}s</>
                ) : (
                  <><Globe size={10} /> Open</>
                )}
              </span>

              {/* Pulse animation */}
              <div className={styles.pulseWrap}>
                <motion.span 
                  className={styles.pulseDot}
                  animate={{ scale: [1, 2], opacity: [0.6, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
                <motion.span 
                  className={styles.pulseDot}
                  animate={{ scale: [1, 2], opacity: [0.6, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: 0.6 }}
                />
                <div className={styles.pulseInner}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles size={20} />
                  </motion.div>
                </div>
              </div>

              <p className={styles.searchingLabel}>Finding match...</p>
              
              <button className={styles.cancelBtn} onClick={onCancelSearch}>
                <X size={14} /> Cancel
              </button>
            </div>
          )}
        </div>

        {/* ── Orey ID Card ── */}
        <div className={styles.idCard}>
          <div className={styles.idTop}>
            <span className={styles.idLabel}>YOUR ID</span>
            {expiryStr && (
              <span className={styles.idExpiry}><Clock size={9} />{expiryStr}</span>
            )}
          </div>
          <div className={styles.idRow}>
            <code className={styles.idCode} onClick={copyId}>{oreyId}</code>
            <button className={`${styles.copyBtn} ${copied ? styles.copied : ''}`} onClick={copyId}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* ── Connect Card ── */}
        <div className={styles.connectCard}>
          <div className={styles.connectRow}>
            <span className={styles.connectPrefix}>OREY-</span>
            <input
              className={styles.connectInput}
              type="text"
              placeholder="XXXXX"
              maxLength={5}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value.toUpperCase().slice(0, 5))}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
            />
            <button 
              className={`${styles.goBtn} ${targetId.length === 5 ? styles.goActive : ''}`}
              onClick={handleConnect}
              disabled={targetId.length !== 5}
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className={styles.footer}>
          <Shield size={9} />
          <span>Encrypted • Secure</span>
        </footer>
      </div>

      {/* ═══ Gender Sheet ═══ */}
      <AnimatePresence>
        {showGenderSheet && (
          <motion.div className={styles.sheetOverlay} initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} onClick={() => setShowGenderSheet(false)}>
            <motion.div 
              className={styles.sheet} 
              initial={{ y:'100%' }} animate={{ y:0 }} exit={{ y:'100%' }}
              transition={{ type:'spring', damping:28, stiffness:280 }}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.sheetHandle} />
              <h3 className={styles.sheetTitle}>Show me</h3>
              {[
                { v:'male', i:<MaleIcon/>, l:'Males', c:'#3b82f6' },
                { v:'female', i:<FemaleIcon/>, l:'Females', c:'#ec4899' },
                { v:null, i:<Globe size={14}/>, l:'Anyone', c:'#8b5cf6' },
              ].map(({v,i,l,c}) => (
                <motion.button
                  key={v??'any'}
                  className={`${styles.sheetOption} ${gender===v ? styles.sheetOptionActive : ''}`}
                  onClick={()=>handleGenderSelect(v)}
                  whileTap={{scale:0.97}}
                >
                  <span className={styles.sheetOptIcon} style={{background:`${c}20`,color:c}}>{i}</span>
                  <span className={styles.sheetOptLabel}>{l}</span>
                  {gender===v && <Check size={16} color="#6366f1" />}
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Notifications Sheet ═══ */}
      <AnimatePresence>
        {showNotifSheet && (
          <motion.div className={styles.sheetOverlay} initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} onClick={() => setShowNotifSheet(false)}>
            <motion.div 
              className={styles.sheet} 
              initial={{ y:'100%' }} animate={{ y:0 }} exit={{ y:'100%' }}
              transition={{ type:'spring', damping:28, stiffness:280 }}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.sheetHandle} />
              <div className={styles.sheetTop}>
                <h3 className={styles.sheetTitle}>Notifications</h3>
                <button onClick={() => setShowNotifSheet(false)} className={styles.sheetClose}><X size={18} /></button>
              </div>
              <div className={styles.notifScroll}>
                {notifications.length === 0 ? (
                  <div className={styles.notifEmpty}>
                    <Bell size={36} />
                    <p>All clear!</p>
                    <span>No new notifications</span>
                  </div>
                ) : (
                  notifications.slice(0,15).map(n => (
                    <div key={n.id} className={`${styles.notifItem} ${!n.isRead ? styles.notifNew : ''}`}>
                      <span className={styles.notifIcon}>{n.icon||'📢'}</span>
                      <div className={styles.notifBody}>
                        <p className={styles.notifTitle}>{n.title}</p>
                        <p className={styles.notifMsg}>{n.message}</p>
                        <span className={styles.notifTime}>{new Date(n.timestamp).toLocaleDateString()}</span>
                      </div>
                      {!n.isRead && <span className={styles.notifDot} />}
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
