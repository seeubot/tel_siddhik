import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { 
  Copy, Check, Sparkles, X, 
  ArrowRight, Bell, Globe, ShieldCheck, 
  ArrowRightCircle, SlidersHorizontal, Clock, Zap, Heart
} from 'lucide-react';
import styles from './Lobby.module.css';

const MaleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="14" r="5"/><line x1="20" y1="4" x2="13.5" y2="10.5"/><line x1="20" y1="4" x2="16" y2="4"/><line x1="20" y1="4" x2="20" y2="8"/>
  </svg>
);

const FemaleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5"/><line x1="12" y1="13" x2="12" y2="22"/><line x1="9" y1="18" x2="15" y2="18"/><line x1="7" y1="2" x2="17" y2="2"/>
  </svg>
);

const PICKUP_LINES = [
  "Connection is the new currency.",
  "Your digital soulmate is one tap away.",
  "Skip the swipe. Start the spark.",
  "Where mystery meets meaningful.",
  "Modern love, simplified.",
  "Your next story starts here."
];

export default function Lobby({
  oreyId = 'OREY-·····', 
  oreyIdExpiry = null,
  searching = false,
  matchStage = null,
  matchTimer = 3,
  onDiscover = () => {}, 
  onCancelSearch = () => {}, 
  onConnectById = () => {},
  gender = null,
  onSetGender = () => {},
  notifications = [],
  unreadCount = 0,
  onViewNotifications = () => {},
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [showGenderSheet, setShowGenderSheet] = useState(false);
  const [showNotifSheet, setShowNotifSheet] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);

  const x = useMotionValue(0);
  const sliderWidth = 280;
  const thumbWidth = 64;
  const opacity = useTransform(x, [0, sliderWidth - thumbWidth - 20], [1, 0]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLineIndex((prev) => (prev + 1) % PICKUP_LINES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const copyId = useCallback(() => {
    if (!oreyId || oreyId === 'OREY-·····') return;
    navigator.clipboard.writeText(oreyId).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }, [oreyId]);

  const handleConnect = useCallback(() => {
    const trimmed = targetId.trim().toUpperCase().replace('OREY-', '');
    if (trimmed.length === 5) {
      onConnectById('OREY-' + trimmed);
      setTargetId('');
    }
  }, [targetId, onConnectById]);

  const handleGenderSelect = useCallback((value) => {
    onSetGender(value);
    setShowGenderSheet(false);
  }, [onSetGender]);

  const handleNotifOpen = useCallback(() => {
    setShowNotifSheet(true);
    if (onViewNotifications) onViewNotifications();
  }, [onViewNotifications]);

  const handleDragEnd = (event, info) => {
    if (info.point.x > (window.innerWidth / 2) + 50) {
      onDiscover();
    }
    x.set(0);
  };

  const expiryStr = oreyIdExpiry 
    ? new Date(oreyIdExpiry).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) 
    : null;

  return (
    <div className="fixed inset-0 bg-[#060708] text-slate-200 overflow-hidden font-sans select-none flex flex-col">
      {/* Premium Ambient Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[70%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[60%] h-[40%] bg-white/5 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 flex flex-col h-full w-full max-w-md mx-auto px-8 pt-14 pb-10">
        
        {/* Header with Notifications */}
        <nav className="flex justify-between items-center mb-8">
          <div className="w-10" /> {/* Spacer */}
          <button 
            onClick={handleNotifOpen}
            className="relative p-2 text-slate-500 hover:text-white transition-colors"
          >
            <Bell size={22} strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#060708]" />
            )}
          </button>
        </nav>

        {/* Branding Section */}
        <header className="mb-12">
          <h1 className="text-8xl font-black tracking-tighter text-white leading-[0.85]">
            Orey<span className="text-blue-500 italic">!</span>
          </h1>
          <div className="mt-6 h-6 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p 
                key={lineIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-sm font-semibold text-slate-500 italic"
              >
                {PICKUP_LINES[lineIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </header>

        {/* Interaction Body */}
        <main className="flex-1 flex flex-col justify-center gap-14">
          {!searching ? (
            <div className="space-y-16">
              {/* Discovery Slider */}
              <div className="flex flex-col items-center gap-6">
                <div className="relative w-full max-w-[300px] h-16 bg-white/[0.03] border border-white/5 rounded-2xl p-1 flex items-center overflow-hidden">
                  <motion.div 
                    style={{ opacity }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  >
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                      Slide to Discover
                    </span>
                  </motion.div>
                  
                  <motion.div
                    drag="x"
                    dragConstraints={{ left: 0, right: 232 }}
                    dragElastic={0.1}
                    onDragEnd={handleDragEnd}
                    style={{ x }}
                    className="z-10 w-14 h-14 bg-white rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing shadow-lg shadow-white/10"
                  >
                    <ArrowRightCircle size={24} className="text-slate-900" />
                  </motion.div>
                </div>

                <button 
                  onClick={() => setShowGenderSheet(true)}
                  className="flex items-center gap-3 text-slate-500 hover:text-white transition-colors"
                >
                  <SlidersHorizontal size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    Preferences: <span className="text-blue-500">
                      {gender ? (gender === 'male' ? 'Males' : 'Females') : 'Global'}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center w-full">
              {/* Stage Badge */}
              {matchStage && (
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 ${
                  matchStage === 'gender' 
                    ? 'bg-yellow-500/10 text-yellow-400' 
                    : 'bg-blue-500/10 text-blue-400'
                }`}>
                  {matchStage === 'gender' ? (
                    <><Zap size={12} /> <span className="text-[10px] font-black uppercase tracking-wider">Gender Match • {matchTimer}s</span></>
                  ) : (
                    <><Globe size={12} /> <span className="text-[10px] font-black uppercase tracking-wider">Open Search</span></>
                  )}
                </div>
              )}

              {/* Timer & Pulse */}
              <div className="relative py-10 flex flex-col items-center">
                <div className="relative">
                  <motion.div
                    animate={{ scale: [1, 1.5], opacity: [0.3, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl"
                  />
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    className="relative z-10"
                  >
                    <Sparkles size={32} className="text-blue-500" />
                  </motion.div>
                </div>
                <div className="text-6xl font-black text-white tabular-nums tracking-tighter mt-4 mb-2">
                  {matchTimer}s
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500">
                    Searching...
                  </span>
                </div>
              </div>
              
              <button 
                onClick={onCancelSearch}
                className="mt-8 px-6 py-2 rounded-full border border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-rose-500 hover:border-rose-500/30 transition-all"
              >
                Abort Search
              </button>
            </div>
          )}
        </main>

        {/* Identity Bar */}
        <section className="mt-auto space-y-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <div onClick={copyId} className="flex flex-col cursor-pointer group">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Your ID</span>
                  {expiryStr && (
                    <span className="text-[8px] text-rose-500/50 flex items-center gap-1">
                      <Clock size={8} />{expiryStr}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black tracking-widest text-white">{oreyId}</span>
                  {copied ? (
                    <Check size={16} className="text-emerald-500" />
                  ) : (
                    <Copy size={14} className="text-slate-800" />
                  )}
                </div>
              </div>
              
              <div className="flex flex-col items-end opacity-40">
                <ShieldCheck size={16} className="text-slate-500" />
                <span className="text-[8px] font-bold uppercase tracking-tighter">Private</span>
              </div>
            </div>

            {/* Connect Input */}
            <div className="flex items-center bg-white/[0.02] border border-white/5 rounded-2xl p-1.5 focus-within:border-blue-500/30 transition-all">
              <span className="text-[10px] font-black text-slate-800 pl-3 pr-1">OREY-</span>
              <input 
                type="text"
                placeholder="ENTER ID"
                maxLength={5}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value.toUpperCase().slice(0, 5))}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                className="bg-transparent flex-1 px-2 text-xs font-black tracking-[0.2em] outline-none text-white placeholder:text-slate-800"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button 
                onClick={handleConnect}
                disabled={targetId.length !== 5}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  targetId.length === 5 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                    : 'bg-white/5 text-slate-800'
                }`}
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </section>

        {/* Gender Preference Sheet */}
        <AnimatePresence>
          {showGenderSheet && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm"
              onClick={() => setShowGenderSheet(false)}
            >
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-x-0 bottom-0 bg-[#0c0d0e] border-t border-white/10 rounded-t-[3rem] p-10 shadow-2xl"
              >
                <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-10" />
                <h3 className="text-sm font-black uppercase tracking-widest text-white mb-6">Show me</h3>
                <div className="flex flex-col gap-3">
                  {[
                    { id: 'male', label: 'Males', icon: <MaleIcon />, color: '#3b82f6' },
                    { id: 'female', label: 'Females', icon: <FemaleIcon />, color: '#ec4899' },
                    { id: null, label: 'Anyone (Global)', icon: <Globe size={18} />, color: '#8b5cf6' }
                  ].map((opt) => (
                    <button
                      key={opt.id ?? 'any'}
                      onClick={() => handleGenderSelect(opt.id)}
                      className={`flex items-center gap-6 p-6 rounded-2xl border transition-all ${
                        gender === opt.id 
                          ? 'bg-blue-600 border-blue-500 text-white' 
                          : 'bg-white/[0.02] border-white/5 text-slate-500 hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="text-xl" style={{ color: gender === opt.id ? 'white' : opt.color }}>
                        {opt.icon}
                      </span>
                      <span className="text-xs font-black uppercase tracking-widest">{opt.label}</span>
                      {gender === opt.id && <Check size={18} className="ml-auto" />}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setShowGenderSheet(false)} 
                  className="w-full mt-6 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-slate-700 hover:text-slate-500 transition-colors"
                >
                  Dismiss
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notifications Sheet */}
        <AnimatePresence>
          {showNotifSheet && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm"
              onClick={() => setShowNotifSheet(false)}
            >
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-x-0 bottom-0 bg-[#0c0d0e] border-t border-white/10 rounded-t-[3rem] p-10 shadow-2xl max-h-[70vh] flex flex-col"
              >
                <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8" />
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">Notifications</h3>
                  <button 
                    onClick={() => setShowNotifSheet(false)}
                    className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {notifications.length === 0 ? (
                    <div className="text-center py-12">
                      <Bell size={48} className="text-slate-800 mx-auto mb-4" />
                      <p className="text-sm font-bold text-slate-600">All clear!</p>
                      <p className="text-[10px] text-slate-800 mt-1">No new notifications</p>
                    </div>
                  ) : (
                    notifications.slice(0, 15).map((n) => (
                      <div 
                        key={n.id} 
                        className={`flex items-start gap-4 p-4 rounded-xl transition-colors ${
                          !n.isRead ? 'bg-blue-500/5 border border-blue-500/10' : 'bg-white/[0.02] border border-white/5'
                        }`}
                      >
                        <span className="text-xl mt-0.5">{n.icon || '📢'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white">{n.title}</p>
                          <p className="text-[10px] text-slate-500 mt-1">{n.message}</p>
                          <p className="text-[8px] text-slate-700 mt-2">
                            {new Date(n.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        {!n.isRead && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                        )}
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
