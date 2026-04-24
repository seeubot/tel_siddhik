
import React, { useState } from 'react';
import styles from './Lobby.module.css';
import { Sparkles, Zap, Copy, ArrowRight, X } from 'lucide-react';

export default function Lobby({ myId, onJoinRandom, onConnectById, waiting, onCancelRandom, status }) {
  const [userName, setUserName] = useState('');
  const [targetId, setTargetId] = useState('');
  const [vibe, setVibe] = useState('Friendly');

  const name = userName.trim() || 'Stranger';
  const vibes = ['Friendly', 'Flirty', 'Deep Talk', 'Chill'];

  const handleCopy = () => {
    if (myId) {
      // Compatibility fallback for clipboard
      const el = document.createElement('textarea');
      el.value = myId;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  return (
    <div className={styles.lobby}>
      {/* Animated Background Elements */}
      <div className={styles.ambient}>
        <div className={styles.ab1} />
        <div className={styles.ab2} />
      </div>

      {/* Header Area */}
      <header className={styles.wordmark}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
          <span className="text-[10px] tracking-[0.3em] font-bold text-rose-500 uppercase">Live Now</span>
        </div>
        <h1>Orey</h1>
        <p>MEET YOUR NEXT CRUSH</p>
      </header>

      {/* Main Action Area */}
      <main className={`${styles.panel} ${styles.animate}`}>
        
        {/* Profile Section */}
        <section className="space-y-4">
          <div className={styles.inputGroup}>
            <input
              type="text"
              placeholder="What's your name?"
              className={styles.input}
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              maxLength={15}
            />
            <div className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20">
              <Sparkles size={18} />
            </div>
          </div>

          {/* Vibe Selector */}
          <div className={styles.vibeScroll}>
            {vibes.map((v) => (
              <button
                key={v}
                onClick={() => setVibe(v)}
                className={`${styles.vibeChip} ${vibe === v ? styles.vibeChipActive : ''}`}
              >
                {v}
              </button>
            ))}
          </div>
        </section>

        {/* Primary CTA */}
        <section className="space-y-3">
          {!waiting ? (
            <button
              onClick={() => onJoinRandom(`${name} (${vibe})`)}
              disabled={!myId}
              className={styles.btnPrimary}
            >
              <Zap fill="currentColor" size={20} />
              START MATCHING
            </button>
          ) : (
            <div className="w-full bg-white/5 border border-white/10 h-[4.5rem] rounded-[1.25rem] flex items-center justify-between px-6 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-rose-500 rounded-full animate-bounce" />
                <span className="font-bold text-xs tracking-widest text-rose-400 italic">FINDING A VIBE...</span>
              </div>
              <button 
                onClick={onCancelRandom}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40"
              >
                <X size={20} />
              </button>
            </div>
          )}

          {/* ID Connection Row */}
          <div className="flex gap-2 h-14">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Connect by ID..."
                className={styles.input}
                style={{ height: '100%', fontSize: '0.9rem', padding: '0 1rem' }}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              />
            </div>
            <button
              onClick={() => onConnectById(targetId.trim(), name)}
              disabled={!targetId.trim()}
              className="aspect-square h-full bg-white/10 border border-white/10 rounded-xl flex items-center justify-center hover:bg-white hover:text-black transition-all disabled:opacity-30"
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </section>

        {/* Footer Identity */}
        <footer className={styles.footer}>
          <div className={styles.idDisplay}>
            <div className="flex flex-col">
              <span className={styles.idLabel}>Your Orey-ID</span>
              <span className={styles.idValue}>
                {myId || 'GENERATING...'}
              </span>
            </div>
            <button 
              onClick={handleCopy}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg transition-colors border border-white/5"
            >
              <Copy size={12} className="text-white/40" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Copy</span>
            </button>
          </div>
          
          {status && (
            <p 
              className="text-center mt-6 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: status.color || 'white' }}
            >
              {status.msg}
            </p>
          )}
        </footer>
      </main>
    </div>
  );
}

