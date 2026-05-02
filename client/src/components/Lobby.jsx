import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Zap, Hash, Loader2, Heart, Sparkles, Shield, Users } from 'lucide-react';
import styles from './Lobby.module.css';

// Custom SVG icons to replace Mars, Venus, User
const MaleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="14" r="5"/>
    <line x1="20" y1="4" x2="13.5" y2="10.5"/>
    <line x1="20" y1="4" x2="16" y2="4"/>
    <line x1="20" y1="4" x2="20" y2="8"/>
  </svg>
);

const FemaleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5"/>
    <line x1="12" y1="13" x2="12" y2="22"/>
    <line x1="9" y1="18" x2="15" y2="18"/>
    <line x1="7" y1="2" x2="17" y2="2"/>
  </svg>
);

const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

export default function Lobby({
  oreyId, oreyIdExpiry,
  searching,
  onDiscover, onCancelSearch, onConnectById,
  gender = null,
  onSetGender = () => {},
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [showGenderModal, setShowGenderModal] = useState(false);

  const copyId = () => {
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

  const genderLabel = gender === 'male' ? 'Male' : gender === 'female' ? 'Female' : 'Anyone';

  return (
    <div className={styles.root}>
      {/* Background */}
      <div className={styles.bgGlow} />
      
      <div className={styles.container}>
        {/* Header */}
        <header className={styles.header}>
          <h1 className={styles.logo}>Orey<span>!</span></h1>
          <p className={styles.subtitle}>Connect • Chat • Share</p>
        </header>

        {/* Gender Selection Card */}
        <div className={styles.card}>
          <div className={styles.genderRow}>
            <div className={styles.genderInfo}>
              <Users size={16} className={styles.genderIcon} />
              <span className={styles.genderLabel}>Matching Preference</span>
            </div>
            <button 
              className={styles.genderSelect} 
              onClick={() => setShowGenderModal(true)}
            >
              {gender === 'male' && <MaleIcon />}
              {gender === 'female' && <FemaleIcon />}
              {!gender && <UserIcon />}
              <span>{genderLabel}</span>
              <span className={styles.chevron}>▾</span>
            </button>
          </div>
        </div>

        {/* Gender Modal */}
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

        {/* Orey ID Card */}
        <div className={styles.card}>
          <div className={styles.idHeader}>
            <span className={styles.idLabel}>Your Orey ID</span>
            {expiryStr && (
              <span className={styles.expiryBadge}>Expires {expiryStr}</span>
            )}
          </div>
          
          <div className={styles.idDisplay}>
            <code className={styles.idText}>{oreyId || 'OREY-·····'}</code>
            <button 
              className={`${styles.copyBtn} ${copied ? styles.copied : ''}`} 
              onClick={copyId}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          
          <p className={styles.idHint}>Share this code to connect instantly</p>
        </div>

        {/* Action Button */}
        <div className={styles.actions}>
          {!searching ? (
            <button className={styles.discoverBtn} onClick={onDiscover}>
              <Heart size={20} fill="currentColor" />
              <span>Find Your Match</span>
              <Sparkles size={16} />
            </button>
          ) : (
            <div className={styles.searchingBox}>
              <div className={styles.searchingContent}>
                <Loader2 size={20} className={styles.spinner} />
                <p className={styles.searchingTitle}>Finding your match</p>
                <p className={styles.searchingSub}>
                  {gender ? `Looking for ${gender === 'male' ? 'males' : 'females'}...` : 'Searching for anyone...'}
                </p>
              </div>
              <button className={styles.cancelBtn} onClick={onCancelSearch}>
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Direct Connect */}
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
              />
            </div>
            <button
              className={`${styles.connectBtn} ${targetId.length === 5 ? styles.connectBtnActive : ''}`}
              onClick={handleConnect}
              disabled={targetId.length !== 5}
            >
              Go
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <Shield size={10} />
          <span>Encrypted • Private • Secure</span>
        </footer>
      </div>
    </div>
  );
}
