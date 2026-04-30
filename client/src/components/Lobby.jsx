
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Copy, Check, Sparkles, Clock, ArrowRight, Shield 
} from 'lucide-react';
import styles from './Lobby.module.css';

/**
 * Lobby Component for Orey!
 * Clean, fast, and brand-focused.
 */
const Lobby = ({ oreyId = 'OREY-K7X2P', oreyIdExpiry = Date.now() + 3595000, onConnectById }) => {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [timeLeft, setTimeLeft] = useState('--:--');
  const [lineIdx, setLineIdx] = useState(0);

  const pickupLines = [
    "Your vibe is calling.",
    "The universe wants you to link up.",
    "Ready for a cosmic connection?",
    "Don't let this spark expire.",
    "One code away from magic.",
    "Find your missing frequency."
  ];

  // Fast navigation & State handling
  const handleInputChange = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (val.length <= 5) setTargetId(val);
  };

  const handleConnect = useCallback(() => {
    if (targetId.length === 5 && onConnectById) {
      onConnectById(`OREY-${targetId}`);
    }
  }, [targetId, onConnectById]);

  // UI Timers
  useEffect(() => {
    const lineInterval = setInterval(() => {
      setLineIdx(prev => (prev + 1) % pickupLines.length);
    }, 4000);

    const clockInterval = setInterval(() => {
      const diff = oreyIdExpiry - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        clearInterval(clockInterval);
      } else {
        const mins = Math.floor((diff / 1000 / 60) % 60);
        const secs = Math.floor((diff / 1000) % 60);
        setTimeLeft(`${mins}m ${secs}s`);
      }
    }, 1000);

    return () => {
      clearInterval(lineInterval);
      clearInterval(clockInterval);
    };
  }, [oreyIdExpiry]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(oreyId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.background}>
        <div className={styles.glowBlue} />
        <div className={styles.glowPurple} />
        <div className={styles.grid} />
      </div>

      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.logoWrapper}>
            <div className={styles.logoGlow} />
            <div className={styles.logo}>OREY!</div>
          </div>
          <div className={styles.pickupLine} key={lineIdx}>
            {pickupLines[lineIdx]}
          </div>
        </header>

        <div className={styles.idCard}>
          <div className={styles.idHeader}>
            <div>
              <span className={styles.label}>
                <Sparkles size={10} /> Identity Key
              </span>
              <h2 className={styles.idValue}>{oreyId.split('-')[1]}</h2>
            </div>
            <div className={styles.timer}>
              <Clock size={10} />
              <span>{timeLeft}</span>
            </div>
          </div>
          
          <button 
            onClick={copyToClipboard}
            className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : styles.copyBtnActive}`}
          >
            {copied ? <Check size={18} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy Invitation'}
          </button>
        </div>

        <div className={styles.linkContainer}>
          <div className={styles.linkInner}>
            <div className={styles.inputWrapper}>
              <span className={styles.inputPrefix}>LINK:</span>
              <input 
                type="text"
                placeholder="•••••"
                value={targetId}
                onChange={handleInputChange}
                className={styles.input}
              />
            </div>
            <button 
              disabled={targetId.length !== 5}
              onClick={handleConnect}
              className={`${styles.goBtn} ${targetId.length === 5 ? styles.goBtnEnabled : styles.goBtnDisabled}`}
            >
              <ArrowRight size={24} />
            </button>
          </div>
        </div>

        <footer className={styles.footer}>
          <Shield size={10} />
          <span>End-to-End Tunnel</span>
        </footer>
      </div>
    </div>
  );
};

export default Lobby;

