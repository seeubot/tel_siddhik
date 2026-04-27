import React, { useState } from 'react';
import { Copy, Check, Zap, Hash, Loader2 } from 'lucide-react';
import styles from './Lobby.module.css';

/**
 * Lobby Component
 * High-impact entrance UI with the #FF2D55 theme.
 */
export default function Lobby({
  userName, setUserName,
  oreyId, oreyIdExpiry,
  searching,
  onDiscover, onCancelSearch, onConnectById,
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');

  const copyId = () => {
    const el = document.createElement('textarea');
    el.value = oreyId;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnect = () => {
    const trimmed = targetId.trim().toUpperCase();
    if (trimmed.length === 8) onConnectById(trimmed);
  };

  const expiryStr = oreyIdExpiry
    ? new Date(oreyIdExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={styles.root}>
      {/* Background Visuals */}
      <div className={styles.grid} />
      <div className={styles.scanline} />
      <div className={styles.orb} />

      <div className={styles.container}>
        {/* Brand Header */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoText}>Orey</span>
            <span className={styles.logoAccent}>!</span>
          </div>
          <p className={styles.tagline}>Mana People • Mana Vibes</p>
        </header>

        {/* Identity Section */}
        <div className={styles.card}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Set Display Name</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Enter name..."
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              maxLength={24}
            />
          </div>

          <div className={styles.idBox}>
            <div className={styles.idHeader}>
              <span className={styles.idLabel}>Your Public ID</span>
              {expiryStr && <span className={styles.expiry}>Expires {expiryStr}</span>}
            </div>
            <div className={styles.idRow}>
              <span className={styles.idValue}>{oreyId || '········'}</span>
              <button className={styles.copyBtn} onClick={copyId} title="Copy ID">
                {copied ? <Check size={18} className={styles.accentText} /> : <Copy size={18} />}
              </button>
            </div>
            <p className={styles.hint}>Valid for 24 hours</p>
          </div>
        </div>

        {/* Action Section */}
        <div className={styles.actions}>
          {!searching ? (
            <button className={styles.discoverBtn} onClick={onDiscover}>
              <Zap size={22} fill="currentColor" />
              DISCOVER PEERS
            </button>
          ) : (
            <div className={styles.searchingRow}>
              <div className={styles.statusBox}>
                <Loader2 size={20} className={styles.spin} />
                MATCHMAKING...
              </div>
              <button className={styles.cancelBtn} onClick={onCancelSearch}>STOP</button>
            </div>
          )}
        </div>

        {/* Direct Access Section */}
        <div className={styles.card}>
          <label className={styles.label}>
            <Hash size={14} className={styles.accentText} /> Direct Connection
          </label>
          <div className={styles.connectRow}>
            <input
              className={`${styles.input} ${styles.mono}`}
              type="text"
              placeholder="Orey-ID"
              maxLength={8}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value.toUpperCase())}
            />
            <button
              className={styles.callBtn}
              onClick={handleConnect}
              disabled={targetId.length !== 8}
            >
              Call
            </button>
          </div>
        </div>

        <footer className={styles.footer}>
          ENCRYPTED PEER-TO-PEER NETWORK
          <span className={styles.footerMuted}>NO LOGS • NO ACCOUNTS • NO BS</span>
        </footer>
      </div>
    </div>
  );
}
