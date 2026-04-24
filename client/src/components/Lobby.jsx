
import React, { useState } from 'react';
import { Sparkles, Zap, Copy, ArrowRight, X } from 'lucide-react';

export default function Lobby({ myId, onJoinRandom, onConnectById, waiting, onCancelRandom, status }) {
  const [userName, setUserName] = useState('');
  const [targetId, setTargetId] = useState('');
  const [vibe, setVibe] = useState('Friendly');

  const name = userName.trim() || 'Stranger';
  const vibes = ['Friendly', 'Flirty', 'Deep Talk', 'Chill'];

  const handleCopy = () => {
    if (myId) {
      document.execCommand('copy');
      // In a real app, you'd trigger the Toast here
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-rose-500/30 overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[70vw] h-[70vw] bg-rose-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-amber-500/10 rounded-full blur-[100px]" />
      </div>

      {/* Header Area */}
      <header className="relative z-10 pt-12 px-6 flex flex-col items-center">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
          <span className="text-[10px] tracking-[0.3em] font-bold text-rose-500 uppercase">Live Now</span>
        </div>
        <h1 className="text-6xl font-black tracking-tighter bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent italic">
          Orey
        </h1>
        <p className="text-[11px] text-white/40 tracking-[0.2em] font-medium mt-1">
          MEET YOUR NEXT CRUSH
        </p>
      </header>

      {/* Main Action Area */}
      <main className="relative z-10 flex-1 flex flex-col justify-end px-6 pb-12 gap-8 max-w-md mx-auto w-full">
        
        {/* Profile Section */}
        <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="relative group">
            <input
              type="text"
              placeholder="Enter your name..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-lg font-semibold focus:outline-none focus:border-rose-500/50 focus:bg-white/[0.08] transition-all placeholder:text-white/20"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              maxLength={15}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-rose-500 transition-colors">
              <Sparkles size={20} />
            </div>
          </div>

          {/* Vibe Selector */}
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {vibes.map((v) => (
              <button
                key={v}
                onClick={() => setVibe(v)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                  vibe === v 
                    ? 'bg-rose-500 border-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)]' 
                    : 'bg-white/5 border-white/10 text-white/50 hover:border-white/20'
                }`}
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
              onClick={() => onJoinRandom(name)}
              disabled={!myId}
              className="group relative w-full bg-white text-black h-16 rounded-2xl font-black text-xl flex items-center justify-center gap-3 overflow-hidden transition-transform active:scale-95 disabled:opacity-50"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-rose-500 to-amber-500 opacity-0 group-hover:opacity-10 transition-opacity" />
              <Zap fill="currentColor" size={22} />
              START MATCHING
            </button>
          ) : (
            <div className="w-full bg-white/10 border border-white/20 h-16 rounded-2xl flex items-center justify-between px-6 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-rose-500 rounded-full animate-bounce" />
                <span className="font-bold text-sm tracking-wide italic">LOOKING FOR A VIBE...</span>
              </div>
              <button 
                onClick={onCancelRandom}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
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
                className="w-full h-full bg-white/5 border border-white/10 rounded-xl px-4 text-sm font-medium focus:outline-none focus:border-white/30"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              />
            </div>
            <button
              onClick={() => onConnectById(targetId.trim(), name)}
              disabled={!targetId.trim()}
              className="aspect-square h-full bg-white/10 border border-white/10 rounded-xl flex items-center justify-center hover:bg-white hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-white/10"
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </section>

        {/* Footer Identity */}
        <footer className="pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Your Private ID</span>
              <span className="font-mono text-xs text-rose-400 font-bold tracking-tighter">
                {myId || 'GENERATING...'}
              </span>
            </div>
            <button 
              onClick={handleCopy}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg transition-colors border border-white/5"
            >
              <Copy size={14} className="text-white/40" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Copy</span>
            </button>
          </div>
          
          {status && (
            <p 
              className="text-center mt-4 text-[10px] font-bold uppercase tracking-widest transition-colors"
              style={{ color: status.color || 'white' }}
            >
              {status.msg}
            </p>
          )}
        </footer>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}} />
    </div>
  );
}

