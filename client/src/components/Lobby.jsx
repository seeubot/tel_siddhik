import { useState } from 'react';
import { Copy, Check, Zap, Hash, Loader2 } from 'lucide-react';
import styles from './Lobby.module.css';

export default function Lobby({
  userName, setUserName, oreyId, searching, 
  onDiscover, onCancelSearch, onConnectById
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');

  return (
    <div className={styles.root}>
      <div className={styles.grid} />
      <div className={styles.orb1} />

      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoAccent}>O</span>rey
            <span style={{ color: '#FF2D55' }}>!</span>
          </div>
          <p className={styles.tagline}>Mana People. Mana Vibes.</p>
        </header>

        {/* User Card */}
        <div className={styles.card}>
          <label className={styles.label}>Your Name</label>
          <input 
            className={styles.input} 
            value={userName} 
            onChange={(e) => setUserName(e.target.value)} 
          />
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          {!searching ? (
            <button className={styles.discoverBtn} onClick={onDiscover}>
              <Zap size={20} /> Discover Peers
            </button>
          ) : (
            <div className={styles.searchingRow}>
              <div className={styles.searchingPulse}>
                <Loader2 size={20} className={styles.spin} /> 
                Searching...
              </div>
              <button className={styles.cancelBtn} onClick={onCancelSearch}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
