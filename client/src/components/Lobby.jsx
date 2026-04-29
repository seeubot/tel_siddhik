import React, { useState } from 'react';
import { Copy, Check, Zap, Hash, Loader2, Heart, Sparkles } from 'lucide-react';
import styles from './Lobby.module.css';

/**
 * Lobby Component
 * Premium dating-style entrance UI with romantic/flirty aesthetics
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
      // Fallback
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
    if (trimmed.length === 8) onConnectById(trimmed);
  };

  const expiryStr = oreyIdExpiry
    ? new Date(oreyIdExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  // Flirty taglines that rotate
  const taglines = [
    "Your next favorite person is one click away",
    "Swipe right on serendipity",
    "Where chemistry meets connection",
    "Real vibes. Real people. Real moments.",
    "Less swiping, more sparking ✨",
    "Your vibe attracts your tribe",
    "Manifesting your meet-cute"
  ];
  
  const randomTagline = taglines[Math.floor(Math.random() * taglines.length)];

  return (
    <div className={styles.root}>
      {/* Animated background elements */}
      <div className={styles.gradientOrb1} />
      <div className={styles.gradientOrb2} />
      <div className={styles.floatingHearts}>
        <Heart className={styles.heart1} size={20} />
        <Heart className={styles.heart2} size={16} />
        <Heart className={styles.heart3} size={24} />
        <Sparkles className={styles.sparkle1} size={16} />
        <Sparkles className={styles.sparkle2} size={20} />
      </div>
      <div className={styles.gridOverlay} />

      <div className={styles.container}>
        {/* Hero Section */}
        <div className={styles.heroSection}>
          <div className={styles.logoWrapper}>
            <div className={styles.logoGlow} />
            <h1 className={styles.logo}>
              Orey<span className={styles.logoAccent}>!</span>
            </h1>
          </div>
          
          <p className={styles.mainTagline}>
            {randomTagline}
          </p>
          
          <div className={styles.subtitleWrapper}>
            <span className={styles.subtitleDivider}>✦</span>
            <p className={styles.subtitle}>
              Mana People • Mana Vibes
            </p>
            <span className={styles.subtitleDivider}>✦</span>
          </div>
        </div>

        {/* ID Card */}
        <div className={styles.glassCard}>
          <div className={styles.idSection}>
            <div className={styles.idHeader}>
              <div className={styles.idBadge}>
                <Sparkles size={14} />
                <span>Your Connection Code</span>
              </div>
              {expiryStr && (
                <span className={styles.expiryPill}>
                  ⏳ {expiryStr}
                </span>
              )}
            </div>
            
            <div className={styles.idDisplay}>
              <span className={styles.idNumber}>
                {oreyId ? oreyId.match(/.{1,4}/g).join(' ') : '···· ····'}
              </span>
              <button 
                className={`${styles.copyButton} ${copied ? styles.copied : ''}`} 
                onClick={copyId}
                title="Copy ID"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
            
            <p className={styles.idHint}>
              Share this code with someone special ✨
            </p>
          </div>
        </div>

        {/* Main Actions */}
        <div className={styles.actionSection}>
          {!searching ? (
            <button className={styles.discoverButton} onClick={onDiscover}>
              <Heart size={24} fill="currentColor" className={styles.heartIcon} />
              <span className={styles.buttonText}>
                Find Your Match
              </span>
              <Sparkles size={20} className={styles.buttonSparkle} />
            </button>
          ) : (
            <div className={styles.searchingContainer}>
              <div className={styles.searchingStatus}>
                <div className={styles.searchingAnimation}>
                  <Loader2 size={24} className={styles.spinnerIcon} />
                  <div className={styles.searchingDots}>
                    <span>.</span><span>.</span><span>.</span>
                  </div>
                </div>
                <p className={styles.searchingText}>
                  Finding your vibe match
                </p>
                <p className={styles.searchingSubtext}>
                  Someone amazing is nearby...
                </p>
              </div>
              <button className={styles.cancelButton} onClick={onCancelSearch}>
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Direct Connect */}
        <div className={styles.glassCard}>
          <div className={styles.directSection}>
            <div className={styles.directHeader}>
              <Hash size={16} className={styles.hashIcon} />
              <span>Have a code?</span>
            </div>
            
            <div className={styles.connectInputGroup}>
              <input
                className={styles.codeInput}
                type="text"
                placeholder="Enter 8-digit code"
                maxLength={8}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value.toUpperCase())}
              />
              <button
                className={`${styles.connectButton} ${targetId.length === 8 ? styles.active : ''}`}
                onClick={handleConnect}
                disabled={targetId.length !== 8}
              >
                Connect
                <Heart size={16} />
              </button>
            </div>
            
            <p className={styles.connectHint}>
              Connect directly with someone you already vibe with
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.footerContent}>
            <span className={styles.footerIcon}>🔒</span>
            <p>Encrypted • Private • Real Connections</p>
          </div>
          <p className={styles.footerMotto}>
            No screenshots. No recordings. Just vibes.
          </p>
        </footer>
      </div>
    </div>
  );
}
