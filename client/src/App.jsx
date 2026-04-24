
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Video, 
  Mic, 
  MicOff, 
  VideoOff, 
  SkipForward, 
  LogOut, 
  UserPlus, 
  Copy, 
  X,
  Loader2,
  ShieldCheck
} from 'lucide-react';

/**
 * MOCK SOCKET & HOOKS 
 * (In your real app, these are imported from './lib/socket' and './hooks/useWebRTC')
 */
const AUTO_SEARCH_DELAY = 3000;

// --- DUMMY COMPONENTS FOR DEMONSTRATION ---
// In your project, these are separate .jsx files.

const Lobby = ({ myId, waiting, onJoinRandom, onConnectById }) => {
  const [name, setName] = useState('');
  const [targetId, setTargetId] = useState('');
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-indigo-600 p-3 rounded-2xl"><Video size={24} /></div>
          <h1 className="text-2xl font-bold italic tracking-tighter text-indigo-400">OREY</h1>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Your Display Name</label>
            <input 
              className="w-full bg-slate-800 border-none rounded-xl p-3 mt-1 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Guest User"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <p className="text-xs text-slate-400">Your Unique ID</p>
            <p className="font-mono text-indigo-300 select-all cursor-pointer">{myId || 'Generating...'}</p>
          </div>

          <button 
            disabled={waiting}
            onClick={() => onJoinRandom(name)}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 p-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
          >
            {waiting ? <Loader2 className="animate-spin" /> : <UserPlus size={20} />}
            {waiting ? 'Searching...' : 'Random Match'}
          </button>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-2 text-slate-500">Or Connect via ID</span></div>
          </div>

          <div className="flex gap-2">
            <input 
              className="flex-1 bg-slate-800 border-none rounded-xl p-3 outline-none"
              placeholder="Orey-XXXX-XXXX"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            />
            <button 
              onClick={() => onConnectById(targetId, name)}
              className="bg-slate-700 hover:bg-slate-600 p-3 rounded-xl"
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CallScreen = ({ 
  localVideoRef, remoteVideoRef, peerName, remoteVideoOn, 
  audioOn, videoOn, onToggleMic, onToggleCam, onSkip, onLeave,
  searching, searchMessage
}) => (
  <div className="min-h-screen bg-black text-white relative overflow-hidden flex flex-col">
    {/* Video Grid */}
    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 p-2 h-full">
      <div className="relative bg-slate-900 rounded-3xl overflow-hidden border border-slate-800">
         <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
         <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium">You</div>
      </div>
      <div className="relative bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 flex items-center justify-center">
         {remoteVideoOn ? (
           <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
         ) : (
           <div className="text-center">
             <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
               <UserPlus size={40} className="text-slate-600" />
             </div>
             <p className="text-slate-500 font-medium">{searching ? 'Searching...' : `Waiting for ${peerName}`}</p>
           </div>
         )}
         <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium">{peerName}</div>
         
         {searching && (
           <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-center items-center justify-center z-20">
             <div className="text-center p-6">
                <Loader2 className="animate-spin mx-auto text-indigo-500 mb-4" size={40} />
                <p className="text-lg font-bold">{searchMessage}</p>
             </div>
           </div>
         )}
      </div>
    </div>

    {/* Controls */}
    <div className="p-6 flex justify-center items-center gap-4 bg-gradient-to-t from-black/80 to-transparent">
       <button onClick={onToggleMic} className={`p-4 rounded-full transition-all ${audioOn ? 'bg-slate-800 hover:bg-slate-700' : 'bg-red-500'}`}>
         {audioOn ? <Mic size={24} /> : <MicOff size={24} />}
       </button>
       <button onClick={onToggleCam} className={`p-4 rounded-full transition-all ${videoOn ? 'bg-slate-800 hover:bg-slate-700' : 'bg-red-500'}`}>
         {videoOn ? <Video size={24} /> : <VideoOff size={24} />}
       </button>
       <button onClick={onSkip} className="bg-indigo-600 hover:bg-indigo-500 p-4 rounded-2xl flex items-center gap-2 font-bold px-8">
         <SkipForward size={24} /> Skip
       </button>
       <button onClick={onLeave} className="bg-slate-800 hover:bg-red-600 p-4 rounded-full transition-all">
         <LogOut size={24} />
       </button>
    </div>
  </div>
);

/**
 * MAIN APP COMPONENT
 */
export default function App() {
  // Logic from your provided code integrated with functional UI
  const [screen, setScreen] = useState('lobby');
  const [myId, setMyId] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [peerName, setPeerName] = useState('Partner');
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [remoteVideoOn, setRemoteVideoOn] = useState(false);

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  // --- Mock Socket Events ---
  // In your real code, these are handled by the large useEffect you provided.
  useEffect(() => {
    // Generate dummy ID
    setMyId("Orey-ABCD-1234");
  }, []);

  const handleJoinRandom = (name) => {
    setWaiting(true);
    // Simulate finding a match
    setTimeout(() => {
      setWaiting(false);
      setScreen('call');
      setPeerName("Random User");
      setRemoteVideoOn(true);
    }, 2000);
  };

  const handleConnectById = (id, name) => {
    if(!id) return;
    setScreen('call');
    setPeerName("User " + id.slice(-4));
  };

  const handleToggleMic = () => setAudioOn(!audioOn);
  const handleToggleCam = () => setVideoOn(!videoOn);
  
  const handleSkip = () => {
    setSearching(true);
    setSearchMessage("Finding next person...");
    setRemoteVideoOn(false);
    setTimeout(() => {
      setSearching(false);
      setRemoteVideoOn(true);
      setPeerName("Next Partner");
    }, 1500);
  };

  const handleLeave = () => {
    setScreen('lobby');
    setRemoteVideoOn(false);
  };

  return (
    <div className="selection:bg-indigo-500 selection:text-white">
      {screen === 'lobby' ? (
        <Lobby 
          myId={myId} 
          waiting={waiting} 
          onJoinRandom={handleJoinRandom}
          onConnectById={handleConnectById}
        />
      ) : (
        <CallScreen 
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          peerName={peerName}
          remoteVideoOn={remoteVideoOn}
          audioOn={audioOn}
          videoOn={videoOn}
          onToggleMic={handleToggleMic}
          onToggleCam={handleToggleCam}
          onSkip={handleSkip}
          onLeave={handleLeave}
          searching={searching}
          searchMessage={searchMessage}
        />
      )}
    </div>
  );
}

