
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Video, Mic, MicOff, VideoOff, PhoneOff, SkipForward, 
  User, Search, Copy, Check, Users, Shield, 
  Settings, Loader2, RefreshCw, X, Zap, 
  Globe, Lock, Heart, Info, Menu, MoreVertical,
  MessageSquare, UserPlus
} from 'lucide-react';

/**
 * OREY V2.1 - REDESIGNED VIDEO ENGINE
 * Changes:
 * 1. Dual-Stack Video Cards: Rounded cards inspired by high-end communication apps.
 * 2. Integrated HUD: Labels and status icons directly on video frames.
 * 3. Modernized Control Bar: Streamlined action buttons.
 */

const DEMO_PARTNERS = [
  { name: "Sophia", location: "London", avatar: "S", bio: "Tech enthusiast & traveler" },
  { name: "Marcus", location: "Berlin", avatar: "M", bio: "UI Designer" },
  { name: "Yuki", location: "Tokyo", avatar: "Y", bio: "Gamer & Developer" }
];

export default function App() {
  const [view, setView] = useState('landing');
  const [isDemo, setIsDemo] = useState(true);
  const [userName, setUserName] = useState(localStorage.getItem('orey-name') || '');
  const [oreyId, setOreyId] = useState('OREY-XXXX-XXXX');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [partner, setPartner] = useState(null);
  const [matchProgress, setMatchProgress] = useState(0);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);

  const notify = (msg, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return true;
    } catch (err) {
      notify("Camera access denied", "error");
      return false;
    }
  };

  const handleJoin = async () => {
    if (!userName) return notify("Please enter a name", "error");
    setIsLoading(true);
    localStorage.setItem('orey-name', userName);
    setTimeout(() => {
      setOreyId(`OREY-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
      setView('lobby');
      setIsLoading(false);
    }, 1200);
  };

  const startMatching = async () => {
    const success = await startCamera();
    if (!success) return;
    setView('matching');
    setMatchProgress(0);
    const interval = setInterval(() => {
      setMatchProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(completeMatch, 800);
          return 100;
        }
        return prev + Math.random() * 20;
      });
    }, 300);
  };

  const completeMatch = () => {
    const randomPartner = DEMO_PARTNERS[Math.floor(Math.random() * DEMO_PARTNERS.length)];
    setPartner(randomPartner);
    setView('call');
    notify(`Encrypted line established`, "success");
  };

  const skipMatch = () => {
    setView('matching');
    setPartner(null);
    startMatching();
  };

  const exitCall = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    setView('lobby');
    setPartner(null);
  };

  // --- UI Components ---
  const ControlButton = ({ icon: Icon, onClick, active = true, danger = false, size = "large" }) => (
    <button 
      onClick={onClick}
      className={`transition-all duration-300 transform active:scale-90 flex items-center justify-center rounded-full
        ${size === "large" ? 'p-5 w-16 h-16' : 'p-3 w-12 h-12'}
        ${danger 
          ? 'bg-[#FF3B30] text-white shadow-lg shadow-rose-500/20' 
          : active 
            ? 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-xl border border-white/10' 
            : 'bg-white/5 text-white/40 border border-white/5'}`}
    >
      <Icon className={size === "large" ? "w-7 h-7" : "w-5 h-5"} />
    </button>
  );

  return (
    <div className="min-h-screen bg-[#000] text-white font-sans selection:bg-indigo-500/30 overflow-hidden">
      
      {/* Notifications */}
      <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-xs pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="bg-white/10 backdrop-blur-3xl border border-white/10 p-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <div className={`w-1.5 h-1.5 rounded-full ${n.type === 'error' ? 'bg-rose-500' : 'bg-indigo-400'}`} />
            <p className="text-[13px] font-semibold tracking-tight">{n.msg}</p>
          </div>
        ))}
      </div>

      {/* 1. LANDING VIEW */}
      {view === 'landing' && (
        <div className="relative h-screen flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-900/20 via-black to-purple-900/20" />
          <div className="relative z-10 w-full max-w-lg text-center space-y-12">
            <div className="space-y-4">
               <h1 className="text-6xl font-black tracking-tighter">OREY<span className="text-indigo-500">.</span></h1>
               <p className="text-slate-400 font-medium">Next-gen peer-to-peer video discovery.</p>
            </div>
            <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem] backdrop-blur-3xl space-y-4">
              <input 
                type="text"
                placeholder="Choose a display name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 focus:border-indigo-500/50 rounded-2xl px-6 py-4 outline-none transition-all text-center font-bold"
              />
              <button 
                onClick={handleJoin}
                disabled={isLoading}
                className="w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="animate-spin" /> : "JOIN NETWORK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. LOBBY VIEW */}
      {view === 'lobby' && (
        <div className="min-h-screen p-6 md:p-12 max-w-4xl mx-auto flex flex-col justify-center gap-8">
          <div className="text-center space-y-4 mb-8">
            <h2 className="text-4xl font-black tracking-tight">Welcome, {userName}</h2>
            <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 rounded-full">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">E2E Secure Channel</span>
            </div>
          </div>

          <button 
            onClick={startMatching}
            className="w-full aspect-[16/9] md:aspect-[21/9] bg-gradient-to-br from-indigo-600 to-indigo-900 rounded-[3rem] relative group overflow-hidden transition-transform active:scale-95"
          >
            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
            <div className="relative h-full flex flex-col items-center justify-center space-y-4">
              <div className="p-6 bg-white/20 rounded-full backdrop-blur-xl group-hover:scale-110 transition-transform">
                <Video className="w-12 h-12 fill-white" />
              </div>
              <span className="text-3xl font-black tracking-tighter">START DISCOVERY</span>
            </div>
            <div className="absolute bottom-6 flex items-center gap-2 px-6 py-2 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 text-[10px] font-bold tracking-widest uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              14,203 Peers Online
            </div>
          </button>
        </div>
      )}

      {/* 3. MATCHING VIEW */}
      {view === 'matching' && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center gap-12">
          <div className="relative">
            <div className="w-64 h-64 rounded-full border border-white/5 flex items-center justify-center">
              <div className="w-48 h-48 rounded-full border border-white/10 flex items-center justify-center animate-pulse">
                <Search className="w-16 h-16 text-indigo-500" />
              </div>
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-ping" />
          </div>
          <div className="text-center space-y-4 w-full max-w-xs">
            <h3 className="text-2xl font-black">Finding Peer...</h3>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${matchProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* 4. CALL VIEW (REDESIGNED) */}
      {view === 'call' && (
        <div className="fixed inset-0 bg-black z-[60] flex flex-col p-4 md:p-6 pb-12">
          
          {/* Main Video Grid */}
          <div className="flex-1 grid grid-rows-2 gap-4 h-full">
            
            {/* Top Card: Remote Peer */}
            <div className="relative rounded-[2.5rem] overflow-hidden bg-neutral-900 border border-white/5 shadow-2xl">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-4 opacity-20 group">
                   <User className="w-24 h-24 mx-auto" />
                   <p className="font-bold text-sm tracking-widest uppercase">Initializing Remote Signal...</p>
                </div>
              </div>
              
              <video 
                ref={remoteVideoRef}
                autoPlay 
                className="w-full h-full object-cover"
              />

              {/* Top Card HUD Overlay */}
              <div className="absolute top-6 left-6 flex items-center gap-3">
                <div className="bg-black/40 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                  <span className="font-bold text-sm tracking-tight">{partner?.name}</span>
                </div>
                <div className="bg-black/40 backdrop-blur-xl border border-white/10 px-3 py-2 rounded-2xl text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  {partner?.location}
                </div>
              </div>

              <div className="absolute top-6 right-6 flex gap-2">
                <button className="p-3 rounded-xl bg-black/40 backdrop-blur-xl border border-white/10 hover:bg-white/10 transition-colors">
                  <UserPlus className="w-4 h-4" />
                </button>
                <button className="p-3 rounded-xl bg-black/40 backdrop-blur-xl border border-white/10 hover:bg-white/10 transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Bottom Card: Local Peer */}
            <div className="relative rounded-[2.5rem] overflow-hidden bg-neutral-900 border border-white/5 shadow-2xl">
              <video 
                ref={localVideoRef} 
                autoPlay 
                muted 
                className={`w-full h-full object-cover transition-opacity duration-1000 ${isVideoOff ? 'opacity-0' : 'opacity-100'}`}
              />
              
              {isVideoOff && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]">
                  <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                    <VideoOff className="w-8 h-8 text-slate-600" />
                  </div>
                </div>
              )}

              {/* Bottom Card HUD Overlay */}
              <div className="absolute bottom-6 left-6 flex items-center gap-3">
                <div className="bg-black/40 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2">
                   <span className="font-bold text-sm tracking-tight">{userName} (You)</span>
                   <Badge>E2EE</Badge>
                </div>
                {isMuted && (
                  <div className="bg-rose-500 px-3 py-2 rounded-2xl flex items-center">
                    <MicOff className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* New Control Dock */}
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[80] w-full max-w-sm px-6">
            <div className="bg-[#1a1a1a]/80 backdrop-blur-3xl border border-white/10 p-4 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-between">
              
              <div className="flex gap-2">
                <ControlButton 
                  size="small"
                  icon={isMuted ? MicOff : Mic} 
                  active={!isMuted}
                  onClick={() => setIsMuted(!isMuted)} 
                />
                <ControlButton 
                  size="small"
                  icon={isVideoOff ? VideoOff : Video} 
                  active={!isVideoOff}
                  onClick={() => setIsVideoOff(!isVideoOff)} 
                />
              </div>

              <button 
                onClick={skipMatch}
                className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-6 rounded-2xl flex items-center gap-2 font-bold tracking-tight transition-all active:scale-95 shadow-lg shadow-indigo-600/30"
              >
                <RefreshCw className="w-4 h-4 animate-spin-slow" />
                NEXT
              </button>

              <ControlButton 
                size="small"
                icon={PhoneOff} 
                danger 
                onClick={exitCall}
              />
            </div>
          </div>
          
        </div>
      )}

      {/* Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 5s linear infinite;
        }
      `}} />
    </div>
  );
}

const Badge = ({ children }) => (
  <span className="text-[9px] font-black tracking-widest text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded uppercase">
    {children}
  </span>
);
