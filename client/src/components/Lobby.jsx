
import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Check, Clock, ArrowRight, Sparkles } from 'lucide-react';
import styles from './Lobby.module.css';

/**
 * Orey! Lobby Component
 * Handlers connection logic to switch to Video Call Screen.
 */
const Lobby = ({ oreyId, oreyIdExpiry, onConnectById }) => {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [timeLeft, setTimeLeft] = useState('00:00');
  const [lineIdx, setLineIdx] = useState(0);

  const pickupLines = [
    "Your vibe is calling.",
    "The universe wants a link.",
    "Ready for a connection?",
    "Don't let the spark expire.",
    "One code away from magic.",
    "Find your frequency."
  ];

  // Rotate pickup lines
  useEffect(() => {
    const interval = setInterval(() => {
      setLineIdx(prev => (prev + 1) % pickupLines.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  // Update Expiry Countdown
  useEffect(() => {
    const updateClock = () => {
      const diff = oreyIdExpiry - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
      } else {
        const mins = Math.floor((diff / 1000 / 60) % 60);
        const secs = Math.floor((diff / 1000) % 60);
        setTimeLeft(`${mins}m ${secs.toString().padStart(2, '0')}s`);
      }
    };
    
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [oreyIdExpiry]);

  // Fast ID Input Handler
  const handleInput = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (val.length <= 5) setTargetId(val);
  };

  // Launch the Video Call
  const triggerCall = useCallback(() => {
    if (targetId.length === 5) {
      // Logic: Prepend OREY- and pass to parent handler to switch screen
      onConnectById(`OREY-${targetId}`);
    }
  }, [targetId, onConnectById]);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(oreyId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for some environments
      const textArea = document.createElement("textarea");
      textArea.value = oreyId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.background}>
        <div className={styles.glowBlue} />
        <div className={styles.glowPurple} />
      </div>

      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.logoBox}>OREY!</div>
          <div className={styles.pickupLine} key={lineIdx}>
            {pickupLines[lineIdx]}
          </div>
        </header>

        <div className={styles.idCard}>
          <div className={styles.idRow}>
            <div>
              <span className={styles.idLabel}>Your Key</span>
              <h2 className={styles.idValue}>{oreyId?.split('-')[1] || '-----'}</h2>
            </div>
            <div className={styles.expiryBadge}>
              <Clock size={12} />
              <span>{timeLeft}</span>
            </div>
          </div>
          
          <button 
            onClick={copyId}
            className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ''}`}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'Linked!' : 'Copy Key'}
          </button>
        </div>

        <div className={styles.joinSection}>
          <input 
            type="text"
            className={styles.inputField}
            placeholder="ENTER KEY..."
            value={targetId}
            onChange={handleInput}
            onKeyDown={(e) => e.key === 'Enter' && triggerCall()}
          />
          <button 
            className={styles.joinBtn}
            disabled={targetId.length !== 5}
            onClick={triggerCall}
            aria-label="Join Call"
          >
            <ArrowRight size={28} strokeWidth={3} />
          </button>
        </div>

        <footer className={styles.footer} style={{ marginTop: '1rem', opacity: 0.4 }}>
          <Sparkles size={12} />
          <span>Secured Session</span>
        </footer>
      </div>
    </div>
  );
};

export default Lobby;

