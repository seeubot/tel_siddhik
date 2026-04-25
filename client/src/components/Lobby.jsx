import React, { useState } from 'react';
import {
  Zap,
  Copy,
  X,
  ChevronRight,
  User,
  Fingerprint,
  ShieldCheck
} from 'lucide-react';
import styles from './Lobby.module.css';

export default function Lobby({ myId, onJoinRandom, onConnectById, waiting, onCancelRandom, status }) {
  const [userName, setUserName] = useState('');
  const [targetId, setTargetId] = useState('');

  // FIX 1: Use modern Clipboard API with execCommand fallback
  const handleCopy = async () => {
    if (!myId) return;
    try {
      await navigator.clipboard.writeText(myId);
    } catch {
      // Fallback for browsers that block clipboard API without user gesture
      const el = document.createElement('textarea');
      el.value = myId;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(el);
    }
  };

  return (
    <div className={styles.container}>
      {/* Background Ambience */}
      <div className={styles.ambience}>
        <div className={styles.glowTop} />
        <div className={styles.gridOverlay} />
      </div>

      <div className={styles.content}>
        {/* Aesthetic Branding Section */}
        <header className={styles.header}>
          <div className={styles.logoWrapper}>
            <h1 className={styles.logoText}>OREY</h1>
            <div className={styles.logoBlur} />
          </div>
          <div className={styles.taglineWrapper}>
            <div className={styles.line} />
            <p className={styles.tagline}>Mana People. Mana Vibes.</p>
            <div className={styles.line} />
          </div>
        </header>

        {/* Identity & Discovery Modules */}
        <div className={styles.inputGroup}>
          {/* Name Input */}
          <div className={styles.fieldWrapper}>
            <div className={styles.fieldBg} />
            <div className={styles.fieldInner}>
              <User size={18} className={styles.fieldIcon} />
              <input
                type="text"
                placeholder="What's your name?"
                className={styles.input}
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
            </div>
          </div>

          {/* Copyable ID Card */}
          <div className={styles.idCard} onClick={handleCopy}>
            <div className={styles.idInfo}>
              <div className={styles.idIconBox}>
                <Fingerprint size={16} />
              </div>
              <div className={styles.idTextStack}>
                <span className={styles.idLabel}>Digital Signature</span>
                <span className={styles.idValue}>{myId || 'Initializing...'}</span>
              </div>
            </div>
            <Copy size={14} className={styles.copyIcon} />
          </div>
        </div>

        {/* Fast Action Engine */}
        <div className={styles.actions}>
          {!waiting ? (
            <button
              className={styles.mainBtn}
              // FIX 2: Pass userName so the parent can forward it to CallScreen
              onClick={() => onJoinRandom(userName)}
              disabled={!myId}
            >
              <div className={styles.shimmer} />
              <Zap size={22} fill="currentColor" />
              <span className={styles.btnText}>DISCOVER PEERS</span>
            </button>
          ) : (
            <button className={styles.loadingBtn} onClick={onCancelRandom}>
              <div className={styles.dotPulse}>
                <div className={styles.dot} />
                <div className={styles.dot} />
                <div className={styles.dot} />
              </div>
              <span className={styles.btnText}>SCANNING</span>
              {/* FIX 3: cancelIcon class is now defined in the CSS */}
              <X size={18} className={styles.cancelIcon} />
            </button>
          )}

          <div className={styles.quickConnect}>
            <input
              type="text"
              placeholder="Paste specific ID to connect"
              className={styles.quickInput}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            />
            <button
              className={styles.quickBtn}
              onClick={() => onConnectById(targetId.trim())}
              disabled={!targetId.trim()}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Global Stats & Status */}
        <footer className={styles.footer}>
          {status && (
            <div className={styles.statusBadge}>
              <div className={styles.statusIndicator}>
                <div className={styles.ping} style={{ backgroundColor: status.color }} />
                <div className={styles.dotSmall} style={{ backgroundColor: status.color }} />
              </div>
              <span className={styles.statusText} style={{ color: status.color }}>
                {status.msg}
              </span>
            </div>
          )}
          <div className={styles.security}>
            <ShieldCheck size={12} />
            <span>Privacy First • Secure Mesh</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
