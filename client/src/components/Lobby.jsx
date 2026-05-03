
import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { 
  Copy, Check, X, 
  ArrowRight, Bell, Globe, ShieldCheck, 
  SlidersHorizontal, Wifi
} from 'lucide-react';
import './styles.css';

const MaleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="14" r="5"/><line x1="20" y1="4" x2="13.5" y2="10.5"/><line x1="20" y1="4" x2="16" y2="4"/><line x1="20" y1="4" x2="20" y2="8"/>
  </svg>
);

const FemaleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5"/><line x1="12" y1="13" x2="12" y2="22"/><line x1="9" y1="18" x2="15" y2="18"/><line x1="7" y1="2" x2="17" y2="2"/>
  </svg>
);

const LOVE_PICKUP_LINES = [
  "Are you a camera? Because every time I look at you, I smile.",
  "I’m not a photographer, but I can definitely picture us together.",
  "You must be a magician, because whenever I look at you, everyone else disappears.",
  "I’d say God Bless You, but it looks like He already did.",
  "Are you made of copper and tellurium? Because you’re CuTe.",
  "I’m learning about important dates in history. Do you want to be one of them?",
  "If beauty were time, you’d be an eternity."
];

export default function App({
  oreyId = 'OREY-X7R2P', 
  searching = false,
  matchTimer = 3,
  onDiscover = () => console.log("Discover triggered"), 
  onCancelSearch = () => console.log("Search cancelled"), 
  onConnectById = (id) => console.log("Connecting to", id),
  gender = null,
  onSetGender = (g) => console.log("Gender set to", g),
  notifications = [],
  unreadCount = 2,
  onViewNotifications = () => {},
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [showGenderSheet, setShowGenderSheet] = useState(false);
  const [showNotifSheet, setShowNotifSheet] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);

  const x = useMotionValue(0);
  const trackWidth = 280;
  const thumbSize = 56;
  const maxDrag = trackWidth - thumbSize - 8; 
  const opacity = useTransform(x, [0, maxDrag * 0.6], [1, 0]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLineIndex((prev) => (prev + 1) % LOVE_PICKUP_LINES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const copyId = useCallback(() => {
    if (!oreyId || oreyId.includes('·')) return;
    navigator.clipboard.writeText(oreyId).then(() => {
      setCopied(true); 
      setTimeout(() => setCopied(false), 2000);
    });
  }, [oreyId]);

  const handleConnect = useCallback(() => {
    const trimmed = targetId.trim().toUpperCase();
    if (trimmed.length === 5) {
      onConnectById('OREY-' + trimmed);
      setTargetId('');
    }
  }, [targetId, onConnectById]);

  const handleDragEnd = () => {
    if (x.get() > maxDrag * 0.8) {
      onDiscover();
    }
    x.set(0);
  };

  return (
    <div className="root">
      <div className="bgGradient">
        <div className="bgGlowTop" />
        <div className="bgGlowBottom" />
      </div>

      <div className="container">
        <header className="header">
          <div className="flex flex-col">
            <h1 className="logo">
              Orey<span className="logoAccent">!</span>
            </h1>
            <div className="styleContainer">
              <span className="styleLabel">DAILY SPARK:</span>
              <div className="h-10 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p 
                    key={lineIndex}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="styleValue"
                  >
                    "{LOVE_PICKUP_LINES[lineIndex]}"
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          </div>

          <button 
            onClick={() => { setShowNotifSheet(true); onViewNotifications(); }}
            className="bellBtn"
          >
            <Bell size={18} strokeWidth={2.5} />
            {unreadCount > 0 && <span className="bellBadge" />}
          </button>
        </header>

        <main className="main">
          {!searching ? (
            <div className="flex flex-col items-center">
              <div className="sliderTrack">
                <motion.div style={{ opacity }} className="sliderHint">
                  <span className="sliderHintText">Slide to Connect</span>
                </motion.div>
                
                <motion.div
                  drag="x"
                  dragConstraints={{ left: 0, right: maxDrag }}
                  dragElastic={0.1}
                  onDragEnd={handleDragEnd}
                  style={{ x }}
                  className="sliderThumb"
                >
                  <span className="thumbLogo">O</span>
                </motion.div>
              </div>

              <button onClick={() => setShowGenderSheet(true)} className="prefsBtn">
                <SlidersHorizontal size={14} />
                <span className="prefsLabel">
                  Looking for: <span className="prefsValue">
                    {gender ? (gender === 'male' ? 'Males' : 'Females') : 'Anyone'}
                  </span>
                </span>
              </button>
            </div>
          ) : (
            <div className="searchingContent">
              <div className="pulseContainer">
                <motion.div
                  animate={{ scale: [1, 2.2], opacity: [0.3, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                  className="pulseRing"
                  style={{ width: 140, height: 140 }}
                />
                <motion.div
                  animate={{ scale: [0.95, 1.05, 0.95] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="bg-blue-600 w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/40 z-10"
                >
                  <span className="text-4xl font-black text-white">O</span>
                </motion.div>
                <div className="timer">Connecting...</div>
                <div className="statusLabel">
                  <span className="statusDot" />
                  <span>Matching {matchTimer}s</span>
                </div>
              </div>
              <button onClick={onCancelSearch} className="mt-4 px-6 py-2.5 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-500 hover:border-rose-500/30 transition-all">
                Cancel Search
              </button>
            </div>
          )}
        </main>

        <footer className="footer">
          <div className="idRow">
            <div onClick={copyId} className="idBlock">
              <span className="idLabel">My Identity</span>
              <div className="idDisplay">
                <span className="idCode">{oreyId}</span>
                {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={16} className="text-slate-700" />}
              </div>
            </div>
            <div className="flex flex-col items-end opacity-40">
              <ShieldCheck size={18} className="text-slate-500" />
              <span className="text-[8px] font-bold uppercase tracking-tighter">Private</span>
            </div>
          </div>

          <div className="connectCard">
            <span className="connectPrefix">OREY-</span>
            <input 
              type="text"
              placeholder="ENTER PARTNER ID"
              maxLength={5}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value.toUpperCase().slice(0, 5))}
              className="connectInput"
            />
            <button 
              onClick={handleConnect}
              disabled={targetId.length !== 5}
              className={`connectBtn ${targetId.length === 5 ? "bg-blue-600 text-white" : "bg-white/5 text-slate-700"}`}
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </footer>

        <AnimatePresence>
          {showGenderSheet && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overlay" onClick={() => setShowGenderSheet(false)}>
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="sheet" onClick={e => e.stopPropagation()}>
                <div className="handle" />
                <h3 className="text-lg font-black uppercase tracking-tighter text-white mb-6">Discover Settings</h3>
                <div className="space-y-3">
                  {[
                    { id: 'male', label: 'Males Only', icon: <MaleIcon />, color: 'text-blue-400' },
                    { id: 'female', label: 'Females Only', icon: <FemaleIcon />, color: 'text-rose-400' },
                    { id: null, label: 'Anyone (Global)', icon: <Globe size={18} />, color: 'text-violet-400' }
                  ].map((opt) => (
                    <button
                      key={opt.id ?? 'any'}
                      onClick={() => { onSetGender(opt.id); setShowGenderSheet(false); }}
                      className={`w-full flex items-center gap-4 p-5 rounded-2xl border transition-all ${
                        gender === opt.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/5 text-slate-400'
                      }`}
                    >
                      <span className={gender === opt.id ? 'text-white' : opt.color}>{opt.icon}</span>
                      <span className="text-xs font-black uppercase tracking-widest">{opt.label}</span>
                      {gender === opt.id && <Check size={18} className="ml-auto" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}

          {showNotifSheet && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overlay" onClick={() => setShowNotifSheet(false)}>
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="sheet" onClick={e => e.stopPropagation()}>
                <div className="handle" />
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-black uppercase tracking-tighter text-white">Notifications</h3>
                  <button onClick={() => setShowNotifSheet(false)} className="p-2 bg-white/5 rounded-full text-slate-500"><X size={18}/></button>
                </div>
                <div className="overflow-y-auto space-y-2 pr-2">
                  {notifications.length === 0 ? (
                    <div className="py-12 text-center opacity-30">
                      <Bell size={40} className="mx-auto mb-2" />
                      <p className="text-xs font-bold uppercase tracking-widest">No activity yet</p>
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={`notifItem ${n.isRead ? 'bg-white/[0.02]' : 'bg-blue-500/5 border-blue-500/20'}`}>
                        <div className="text-xl shrink-0">{n.icon || '✨'}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{n.title}</p>
                          <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{n.message}</p>
                        </div>
                        {!n.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

