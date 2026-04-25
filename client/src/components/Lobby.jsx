import { useState } from 'react';
import { Copy, Check, Zap, Hash, Loader2 } from 'lucide-react';
import styles from './Lobby.module.css';

export default function Lobby({
  userName, setUserName,
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
    });
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
      {/* Background grid */}
      <div className={styles.grid} />

      {/* Glow orbs */}
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={styles.container}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoAccent}>O</span>rey
          </div>
          <p className={styles.tagline}>Mana People. Mana Vibes.</p>
        </header>

        {/* Name input */}
        <div className={styles.card}>
          <label className={styles.label}>Your Name</label>
          <input
            className={styles.input}
            type="text"
            placeholder="Anonymous"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            maxLength={32}
          />
        </div>

        {/* Orey-ID card */}
        <div className={`${styles.card} ${styles.idCard}`}>
          <div className={styles.idHeader}>
            <span className={styles.label}>Your Orey-ID</span>
            {expiryStr && (
              <span className={styles.expiry}>expires {expiryStr}</span>
            )}
          </div>
          <div className={styles.idRow}>
            <span className={styles.idValue}>{oreyId || '········'}</span>
            <button className={styles.copyBtn} onClick={copyId} title="Copy ID">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <p className={styles.idHint}>Share this ID for direct calls. Valid 24 h.</p>
        </div>

        {/* Discover button */}
        <div className={styles.actions}>
          {!searching ? (
            <button className={styles.discoverBtn} onClick={onDiscover}>
              <Zap size={20} />
              Discover Peers
            </button>
          ) : (
            <div className={styles.searchingRow}>
              <div className={styles.searchingPulse}>
                <Loader2 size={20} className={styles.spin} />
                Searching for a match…
              </div>
              <button className={styles.cancelBtn} onClick={onCancelSearch}>Cancel</button>
            </div>
          )}
        </div>

        {/* Direct connect */}
        <div className={styles.card}>
          <label className={styles.label}>
            <Hash size={14} /> Connect by Orey-ID
          </label>
          <div className={styles.connectRow}>
            <input
              className={styles.input}
              type="text"
              placeholder="XXXXXXXX"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value.toUpperCase())}
              maxLength={8}
            />
            <button
              className={styles.connectBtn}
              onClick={handleConnect}
              disabled={targetId.trim().length !== 8}
            >
              Call
            </button>
          </div>
        </div>

        <footer className={styles.footer}>
          <span>🛡️ No accounts &nbsp;·&nbsp; No logs &nbsp;·&nbsp; Peer-to-peer encrypted</span>
        </footer>
      </div>
    </div>
  );
}
