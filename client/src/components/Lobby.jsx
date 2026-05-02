import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Zap, Hash, Loader2, Heart, Sparkles, Shield, Users, Venus, Mars, User } from 'lucide-react';
import styles from './Lobby.module.css';

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
              {gender === 'male' && <Mars size={14} />}
              {gender === 'female' && <Venus size={14} />}
              {!gender && <User size={14} />}
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
                      <Mars size={24} />
                    </div>
                    <span>Male</span>
                  </button>
                  
                  <button 
                    className={`${styles.genderOption} ${gender === 'female' ? styles.genderOptionActive : ''}`}
                    onClick={() => { onSetGender('female'); setShowGenderModal(false); }}
                  >
                    <div className={styles.genderCircle}>
                      <Venus size={24} />
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
