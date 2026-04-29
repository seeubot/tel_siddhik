import React, { useState } from 'react';
import { Copy, Check, Zap, Hash, Loader2, Heart, Sparkles, Shield } from 'lucide-react';
import styles from './Lobby.module.css';

/**
 * Lobby Component - Fully Responsive Dating App Style
 */
export default function Lobby({
  oreyId, oreyIdExpiry,
  searching,
  onDiscover, onCancelSearch, onConnectById,
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');

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
    if (formattedId.length === 10) onConnectById(formattedId); // OREY-XXXXX = 10 chars
  };

  const expiryStr = oreyIdExpiry
    ? new Date(oreyIdExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const taglines = [
    "Your next favorite person is one click away",
    "Swipe right on serendipity",
    "Where chemistry meets connection",
    "Real vibes. Real people. Real moments.",
    "Less swiping, more sparking ✨",
    "Your vibe attracts your tribe",
    "Manifesting your meet-cute 💕"
  ];
  
  const randomTagline = taglines[Math.floor(Math.random() * taglines.length)];

  return (
    <div className={styles.root}>
      {/* Animated background */}
      <div className={styles.gradientOrb1} />
      <div className={styles.gradientOrb2} />
      <div className={styles.gridOverlay} />
      
      {/* Floating elements */}
      <div className={styles.floatingElements}>
        <Heart className={styles.floatingIcon1} size={16} />
        <Heart className={styles.floatingIcon2} size={12} />
        <Sparkles className={styles.floatingIcon3} size={14} />
        <Sparkles className={styles.floatingIcon4} size={18} />
      </div>

      <div className={styles.container}>
        {/* Logo & Hero */}
        <div className={styles.hero}>
          <div className={styles.logoWrapper}>
            <div className={styles.logoGlow} />
            <h1 className={styles.logo}>
              Orey<span className={styles.logoAccent}>!</span>
            </h1>
          </div>
          
          <p className={styles.tagline}>{randomTagline}</p>
          
          <div className={styles.brandMotto}>
            <span className={styles.divider}>✦</span>
            <span>Mana People • Mana Vibes</span>
            <span className={styles.divider}>✦</span>
          </div>
        </div>

        {/* Your ID Card */}
        <div className={styles.card}>
          <div className={styles.idSection}>
            <div className={styles.idHeader}>
              <div className={styles.badge}>
                <Sparkles size={12} />
                <span>Your Connection Code</span>
              </div>
              {expiryStr && (
                <span className={styles.expiryBadge}>
                  ⏳ {expiryStr}
                </span>
              )}
            </div>
            
            <div className={styles.idDisplay}>
              <code className={styles.idText}>
                {oreyId || 'OREY-·····'}
              </code>
              <button 
                className={`${styles.copyBtn} ${copied ? styles.copied : ''}`} 
                onClick={copyId}
                title="Copy ID"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            
            <p className={styles.idHint}>Share this code with someone special ✨</p>
          </div>
        </div>

        {/* Main Action */}
        <div className={styles.actions}>
          {!searching ? (
            <button className={styles.discoverBtn} onClick={onDiscover}>
              <Heart size={20} fill="currentColor" className={styles.heartBeat} />
              <span>Find Your Match</span>
              <Sparkles size={16} />
            </button>
          ) : (
            <div className={styles.searchingContainer}>
              <div className={styles.searchingBox}>
                <div className={styles.searchingAnimation}>
                  <Loader2 size={20} className={styles.spinner} />
                  <div className={styles.dots}>
                    <span>.</span><span>.</span><span>.</span>
                  </div>
                </div>
                <p className={styles.searchingTitle}>Finding your vibe match</p>
                <p className={styles.searchingSub}>Someone amazing is nearby...</p>
              </div>
              <button className={styles.cancelBtn} onClick={onCancelSearch}>
                Cancel Search
              </button>
            </div>
          )}
        </div>

        {/* Direct Connect */}
        <div className={styles.card}>
          <div className={styles.connectSection}>
            <div className={styles.connectHeader}>
              <Hash size={14} className={styles.accentIcon} />
              <span>Have a code?</span>
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
                />
              </div>
              <button
                className={`${styles.connectBtn} ${targetId.length === 5 ? styles.connectBtnActive : ''}`}
                onClick={handleConnect}
                disabled={targetId.length !== 5}
              >
                Connect
                <Heart size={14} />
              </button>
            </div>
            
            <p className={styles.connectHint}>
              Connect directly with someone you already vibe with
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.footerRow}>
            <Shield size={12} />
            <span>Encrypted • Private • Real Connections</span>
          </div>
          <p className={styles.footerMotto}>
            No screenshots. No recordings. Just vibes.
          </p>
        </footer>
      </div>
    </div>
  );
}
