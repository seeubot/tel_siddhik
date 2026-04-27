import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  UserPlus, Zap, MoreHorizontal,
  ShieldCheck
} from 'lucide-react';

/**
 * Orey! Pro — Enhanced Premium Call Interface
 * Fixed: Consolidated styles to Tailwind for environment compatibility.
 */

const CallScreen = ({
  partner = null,
  roomId = "BR-772-XP",
  audioEnabled = true,
  videoEnabled = true,
  partnerMedia = { video: true, audio: true },
  searching = false,
  autoSearchCountdown = null,
  onToggleAudio = () => {},
  onToggleVideo = () => {},
  onSkip = () => {},
  onLeave = () => {},
  onShareId = () => {},
  onCancelAutoSearch = () => {},
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const uiTimerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const isPartnerVideoEnabled = partnerMedia?.video !== false;
  const isRemoteConnected = partner && isPartnerVideoEnabled;

  const resetUiTimer = useCallback(() => {
    clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 6000);
  }, []);

  useEffect(() => {
    resetUiTimer();
    return () => clearTimeout(uiTimerRef.current);
  }, [resetUiTimer]);

  const handleRootClick = (e) => {
    if (e.target.closest('button')) return;
    setUiVisible((prev) => {
      if (!prev) resetUiTimer();
      return !prev;
    });
  };

  return (
    <div 
      className={`fixed inset-0 bg-[#020202] overflow-hidden flex flex-col lg:flex-row transition-all duration-700 ease-in-out font-sans ${!uiVisible ? 'cursor-none' : ''}`}
      onClick={handleRootClick}
    >
      {/* Texture Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none opacity-20 mix-blend-screen bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22150%22 height=%22150%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22150%22 height=%22150%22 filter=%22url(%23n)%22 opacity=%220.07%22/%3E%3C/svg%3E')]" />

      {/* REMOTE PANEL */}
      <div className={`relative flex-1 bg-[#050508] transition-all duration-1000 ${searching ? 'blur-3xl scale-110 opacity-50' : ''}`}>
        <video
          ref={remoteVideoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          style={{ display: isRemoteConnected ? 'block' : 'none' }}
        />

        {!isRemoteConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-[clamp(4rem,15vw,10rem)] font-black italic tracking-tighter text-white opacity-[0.03] uppercase animate-pulse">
              OREY!
            </div>
            <p className="text-[9px] font-black tracking-[0.6em] uppercase text-white/10 -mt-4">
              {searching ? 'Syncing Mesh' : 'Secure Node'}
            </p>
          </div>
        )}

        <div className="absolute top-6 left-6 z-30">
          <div className="bg-black/40 backdrop-blur-2xl border border-white/5 px-4 py-2 rounded-full flex items-center gap-3">
             <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
             <span className="font-mono text-[10px] text-white/30 tracking-[0.2em]">{roomId}</span>
          </div>
        </div>
      </div>

      {/* LOCAL PANEL */}
      <div className="relative flex-1 bg-[#08080a] border-t lg:border-t-0 lg:border-l border-white/5">
        <video
          ref={localVideoRef}
          className="w-full h-full object-cover scale-x-[-1]"
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />

        {!audioEnabled && (
          <div className="absolute top-6 right-6 z-40 p-3 bg-red-500/10 backdrop-blur-md border border-red-500/30 rounded-full text-red-500 animate-pulse">
            <MicOff size={18} />
          </div>
        )}

        {!videoEnabled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
             <div className="text-[clamp(4rem,15vw,10rem)] font-black italic tracking-tighter text-white opacity-[0.02] uppercase">
              OREY!
            </div>
            <p className="text-[9px] font-black tracking-[0.6em] uppercase text-white/10 -mt-4">Camera Off</p>
          </div>
        )}

        <div className="absolute bottom-6 lg:bottom-auto lg:top-6 left-6 z-30">
          <div className="bg-black/40 backdrop-blur-2xl border border-white/5 px-4 py-2 rounded-full flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-white/20 rounded-full" />
              <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Preview</span>
          </div>
        </div>
      </div>

      {/* PREMIUM CONTROL BAR */}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-4 transition-all duration-700 ease-[cubic-bezier(0.2,1,0.2,1)] ${!uiVisible ? 'translate-y-32 opacity-0' : 'translate-y-0 opacity-100'}`}>
        
        {/* The Omni-Pill */}
        <div className="group relative p-[1px] rounded-[32px] bg-gradient-to-b from-white/10 to-transparent hover:from-white/20 transition-all duration-500">
          <div className="flex items-center gap-1 bg-[#0f0f0f]/80 backdrop-blur-[40px] px-2 py-2 rounded-[31px] border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            
            {/* Media Group */}
            <div className="flex items-center bg-white/5 rounded-full p-1 border border-white/5">
              <button 
                onClick={onToggleVideo}
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 ${!videoEnabled ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
              >
                {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
              <button 
                onClick={onToggleAudio}
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 ${!audioEnabled ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
              >
                {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            </div>

            {/* Next Button - High Contrast */}
            <button 
              onClick={onSkip}
              className="relative h-12 px-8 bg-white text-black rounded-full flex items-center gap-3 group/btn overflow-hidden transition-all duration-500 hover:bg-red-500 hover:text-white active:scale-95 shadow-lg"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite] pointer-events-none" />
              <span className="font-black text-[11px] tracking-[0.3em] uppercase transition-transform duration-300 group-hover/btn:translate-x-[-2px]">Next</span>
              <Zap size={14} fill="currentColor" className="transition-all duration-300 group-hover/btn:scale-125 group-hover/btn:rotate-12" />
            </button>

            {/* Actions Group */}
            <div className="flex items-center gap-1">
              <button 
                onClick={onShareId}
                className="w-10 h-10 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all duration-300"
              >
                <UserPlus size={18} />
              </button>
              <button className="w-10 h-10 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all duration-300">
                <MoreHorizontal size={18} />
              </button>
            </div>

          </div>
        </div>
        
        {/* Footnote Badge */}
        <div className="flex items-center gap-2 px-3 py-1 bg-white/[0.03] border border-white/5 rounded-full opacity-40 hover:opacity-100 transition-opacity duration-300 cursor-default">
            <ShieldCheck size={10} className="text-red-500" />
            <span className="text-[7px] font-black uppercase tracking-[0.4em] text-white">Peer-to-Peer Encrypted Node</span>
        </div>
      </div>

      {/* SEARCHING OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-500" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col items-center">
            {autoSearchCountdown !== null ? (
              <div className="text-center">
                <div className="text-[clamp(8rem,25vw,12rem)] font-black italic text-white leading-none tracking-tighter">
                  {autoSearchCountdown}<span className="text-red-500">!</span>
                </div>
                <p className="text-[10px] font-black tracking-[1em] uppercase text-red-500 my-4 animate-pulse">Peer Sync Imminent</p>
                <button 
                  onClick={onCancelAutoSearch} 
                  className="w-full mt-8 py-4 px-12 rounded-full border border-white/10 text-white/20 hover:text-white hover:border-white/30 text-[9px] font-black uppercase tracking-[0.4em] transition-all"
                >
                  Abort Connection
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="text-2xl font-black italic tracking-[0.5em] text-white/5 mb-8">OREY!</div>
                <div className="flex gap-2">
                  {[0, 0.2, 0.4].map((delay, i) => (
                    <div 
                      key={i} 
                      className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" 
                      style={{ animationDelay: `${delay}s` }} 
                    />
                  ))}
                </div>
                <p className="text-[8px] font-black tracking-[0.8em] text-white/10 uppercase mt-8">Scanning Mesh Infrastructure</p>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
};

export default CallScreen;
