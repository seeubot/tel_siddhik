
import React, { useState } from 'react';
import styles from './Lobby.module.css';
import { Zap, Copy, Plus, ChevronRight, User } from 'lucide-react';

export default function Lobby({ myId, onJoinRandom, onConnectById, waiting, onCancelRandom, status }) {
  const [userName, setUserName] = useState('');
  const [targetId, setTargetId] = useState('');
  const [vibe, setVibe] = useState('Flirty');

  const name = userName.trim() || 'Stranger';
  const vibes = ['Friendly', 'Flirty', 'Deep', 'Chill'];

  const handleCopy = () => {
    if (myId) {
      const el = document.createElement('textarea');
      el.value = myId;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  return (
    <div className={styles.container}>
      {/* Dynamic Background */}
      <div className={styles.glow} />
      
      <div className={styles.content}>
        {/* Top Navigation / Status */}
        <header className={styles.header}>
          <div className={styles.logo}>OREY</div>
          <div className={styles.liveIndicator}>
            <span className={styles.pulse} />
            LIVE
          </div>
        </header>

        {/* Profile Card */}
        <section className={styles.profileSection}>
          <div className={styles.inputWrapper}>
            <User size={18} className={styles.inputIcon} />
            <input
              type="text"
              placeholder="Your name..."
              className={styles.nameInput}
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              maxLength={12}
            />
          </div>

          <div className={styles.vibeGrid}>
            {vibes.map((v) => (
              <button
                key={v}
                onClick={() => setVibe(v)}
                className={`${styles.vibeBtn} ${vibe === v ? styles.vibeActive : ''}`}
              >
                {v}
              </button>
            ))}
          </div>
        </section>

        {/* Main Actions */}
        <div className={styles.actionArea}>
          {!waiting ? (
            <button 
              className={styles.mainCta} 
              onClick={() => onJoinRandom(`${name} • ${vibe}`)}
              disabled={!myId}
            >
              <span>FIND MATCH</span>
              <Zap size={24} fill="currentColor" />
            </button>
          ) : (
            <button className={styles.waitingBtn} onClick={onCancelRandom}>
              <div className={styles.spinner} />
              <span>SEARCHING...</span>
              <Plus size={20} style={{ transform: 'rotate(45deg)' }} />
            </button>
          )}

          <div className={styles.idConnector}>
            <input
              type="text"
              placeholder="Enter Partner ID"
              className={styles.idInput}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            />
            <button 
              className={styles.idSubmit}
              onClick={() => onConnectById(targetId.trim(), name)}
              disabled={!targetId.trim()}
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>

        {/* User Identity Footer */}
        <footer className={styles.footer}>
          <div className={styles.idTag} onClick={handleCopy}>
            <span className={styles.idLabel}>YOUR ID:</span>
            <span className={styles.idCode}>{myId || 'LOADING...'}</span>
            <Copy size={14} />
          </div>
          {status && (
            <p className={styles.statusMsg} style={{ color: status.color }}>
              {status.msg}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}

