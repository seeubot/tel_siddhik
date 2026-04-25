
import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Video, VideoOff, Mic, MicOff, PhoneOff, RefreshCw, User, Copy, 
  Check, Users, Search, Share2, X, Shield, Globe, MessageCircle 
} from 'lucide-react';

// --- Constants & Socket Initialization ---
const SOCKET_URL = window.location.origin;
const socket = io(SOCKET_URL);
const AUTO_SEARCH_DELAY = 3000;

// --- Custom Hook: useWebRTC ---
const useWebRTC = ({ localVideoRef, remoteVideoRef, onRemoteStream, onCallTimer }) => {
  const pc = useRef(null);
  const localStreamRef = useRef(null);

  const stopLocal = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  }, [localVideoRef]);

  const startLocal = useCallback(async () => {
    try {
      if (localStreamRef.current) return localStreamRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (err) {
      console.error("Error accessing media devices:", err);
      return null;
    }
  }, [localVideoRef]);

  const closePC = useCallback(() => {
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, [remoteVideoRef]);

  const createPC = useCallback((targetId) => {
    closePC();
    const newPc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        newPc.addTrack(track, localStreamRef.current);
      });
    }

    newPc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { targetId, candidate: e.candidate });
      }
    };

    newPc.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
        onRemoteStream();
      }
    };

    pc.current = newPc;
    return newPc;
  }, [closePC, onRemoteStream, remoteVideoRef]);

  const makeOffer = useCallback(async (targetId) => {
    const _pc = createPC(targetId);
    const offer = await _pc.createOffer();
    await _pc.setLocalDescription(offer);
    socket.emit('offer', { targetId, offer });
  }, [createPC]);

  const handleOffer = useCallback(async (offer, fromId) => {
    const _pc = createPC(fromId);
    await _pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await _pc.createAnswer();
    await _pc.setLocalDescription(answer);
    socket.emit('answer', { targetId: fromId, answer });
  }, [createPC]);

  const handleAnswer = useCallback(async (answer) => {
    if (pc.current) {
      await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }, []);

  const handleIce = useCallback(async (candidate) => {
    if (pc.current) {
      await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  return { 
    startLocal, stopLocal, makeOffer, handleOffer, 
    handleAnswer, handleIce, closePC, localStreamRef 
  };
};

// --- Sub-components ---

const Toast = forwardRef((props, ref) => {
  const [msg, setMsg] = useState(null);
  useImperativeHandle(ref, () => ({
    show: (text, dur = 3000) => {
      setMsg(text);
      setTimeout(() => setMsg(null), dur);
    }
  }));
  if (!msg) return null;
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-indigo-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-bold animate-bounce">
      {msg}
    </div>
  );
});

const ModalWrapper = ({ children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl">
      {children}
    </div>
  </div>
);

// --- Main App Component ---

export default function App() {
  const [myId, setMyId] = useState(null);
  const myIdRef = useRef(null);
  const userNameRef = useRef(localStorage.getItem('orey_name') || 'Stranger');
  const [screen, setScreen] = useState('lobby');
  const [waiting, setWaiting] = useState(false);
  const [lobStatus, setLobStatus] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [peerId, setPeerId] = useState(null);
  const [peerName, setPeerName] = useState(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [remoteVideoOn, setRemoteVideoOn] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [shareModal, setShareModal] = useState(null);
  const [revealModal, setRevealModal] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const roomIdRef = useRef(null);
  const peerIdRef = useRef(null);
  const toastRef = useRef(null);
  const searchTimerRef = useRef(null);
  const pendingPeerRef = useRef(null);

  const toast = useCallback((msg, dur) => toastRef.current?.show(msg, dur), []);

  useEffect(() => { roomIdRef.current = roomId }, [roomId]);
  useEffect(() => { peerIdRef.current = peerId }, [peerId]);

  const { startLocal, stopLocal, makeOffer, handleOffer, handleAnswer, handleIce, closePC, localStreamRef } =
    useWebRTC({
      localVideoRef,
      remoteVideoRef,
      onRemoteStream: () => setRemoteVideoOn(true),
      onCallTimer: () => {},
    });

  const cancelSearchTimer = useCallback(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = null;
    setSearching(false);
    setSearchMessage('');
  }, []);

  const cleanupCall = useCallback(() => {
    closePC();
    stopLocal();
    cancelSearchTimer();
    setPeerId(null);
    setPeerName(null);
    setRemoteVideoOn(false);
    pendingPeerRef.current = null;
  }, [closePC, stopLocal, cancelSearchTimer]);

  const goLobby = useCallback(() => {
    cleanupCall();
    setRoomId(null);
    setWaiting(false);
    setScreen('lobby');
  }, [cleanupCall]);

  useEffect(() => {
    if (screen === 'call' && pendingPeerRef.current && localStreamRef.current) {
      const { socketId } = pendingPeerRef.current;
      pendingPeerRef.current = null;
      makeOffer(socketId);
    }
  }, [screen, makeOffer, localStreamRef]);

  useEffect(() => {
    fetch(`${SOCKET_URL}/generate-orey-id`)
      .then(r => r.json())
      .then(d => {
        setMyId(d.oreyId);
        myIdRef.current = d.oreyId;
      })
      .catch(console.error);

    socket.on('waiting-for-match', () => setWaiting(true));
    socket.on('random-cancelled', () => { setWaiting(false); cancelSearchTimer(); });

    socket.on('room-joined', async ({ roomId: r, peers, autoMatched }) => {
      setRoomId(r);
      setWaiting(false);
      cancelSearchTimer();
      setSearching(false);
      await startLocal();
      if (peers?.length) {
        const p = peers[0];
        setPeerId(p.socketId);
        setPeerName(p.userName || 'Stranger');
        pendingPeerRef.current = { socketId: p.socketId };
      }
      setScreen('call');
      if (autoMatched) toast('Matched with a stranger!');
    });

    socket.on('user-joined', ({ socketId, userName }) => {
      setPeerId(socketId);
      setPeerName(userName || 'Stranger');
    });

    socket.on('offer', async ({ offer, fromId, fromName }) => {
      setPeerId(fromId);
      setPeerName(fromName || 'Stranger');
      await handleOffer(offer, fromId);
    });

    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIce);
    socket.on('peer-media-state', ({ videoEnabled }) => setRemoteVideoOn(videoEnabled));

    socket.on('partner-left', ({ userName, reason }) => {
      closePC();
      setRemoteVideoOn(false);
      toast(reason === 'skipped' ? 'Partner skipped' : 'Partner left');
      setSearchMessage('Partner left. Searching...');
      setSearching(true);
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        if (roomIdRef.current) socket.emit('join-random');
      }, AUTO_SEARCH_DELAY);
    });

    socket.on('auto-search-scheduled', () => {
      setSearching(true);
      setSearchMessage('Finding a new partner...');
    });

    socket.on('auto-search-cancelled', cancelSearchTimer);
    socket.on('left-chat-confirmed', goLobby);
    socket.on('skip-confirmed', () => {
      setRemoteVideoOn(false);
      setSearching(true);
      setSearchMessage('Skipping...');
    });

    socket.on('share-id-request', ({ fromId, fromName }) => setShareModal({ fromId, fromName }));
    socket.on('share-id-reveal', ({ oreyId, userName }) => {
      setShareModal(null);
      setRevealModal({ oreyId, userName });
      toast(`Revealed: ${userName}`);
    });

    socket.on('share-id-declined', () => toast('ID request declined'));

    return () => { socket.removeAllListeners(); };
  }, [startLocal, handleOffer, handleAnswer, handleIce, closePC, cancelSearchTimer, goLobby, toast]);

  // Handlers
  const handleJoinRandom = (name) => {
    userNameRef.current = name;
    localStorage.setItem('orey_name', name);
    socket.emit('register-orey-id', { oreyId: myIdRef.current, userName: name });
    socket.emit('join-random');
    setWaiting(true);
  };

  const handleConnectById = async (targetId, name) => {
    if (!targetId) return;
    userNameRef.current = name;
    socket.emit('register-orey-id', { oreyId: myIdRef.current, userName: name });
    await startLocal();
    setScreen('call');
    socket.emit('connect-by-orey-id', { targetOreyId: targetId });
  };

  const handleToggleCam = () => {
    setVideoOn(prev => {
      const next = !prev;
      localStreamRef.current?.getVideoTracks().forEach(t => (t.enabled = next));
      socket.emit('media-state', { roomId: roomIdRef.current, audioEnabled: audioOn, videoEnabled: next });
      return next;
    });
  };

  const handleToggleMic = () => {
    setAudioOn(prev => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach(t => (t.enabled = next));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      <Toast ref={toastRef} />

      {screen === 'lobby' ? (
        <div className="max-w-4xl mx-auto px-6 py-12 min-h-screen flex flex-col justify-center">
          <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="inline-flex p-4 bg-indigo-600 rounded-3xl shadow-2xl shadow-indigo-500/20 mb-6">
              <Globe className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-6xl font-black italic tracking-tighter text-white mb-4">OREY</h1>
            <p className="text-slate-400 text-lg max-w-md mx-auto">
              Encrypted peer-to-peer video encounters. Connect instantly, leave no trace.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Random Search Card */}
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-xl hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                  <Search className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-white">Stranger Mode</h2>
              </div>
              <input 
                type="text" 
                defaultValue={userNameRef.current}
                onChange={(e) => userNameRef.current = e.target.value}
                placeholder="Enter Alias..."
                className="w-full bg-slate-800 border-none rounded-2xl px-6 py-4 mb-4 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
              />
              <button 
                onClick={() => handleJoinRandom(userNameRef.current)}
                disabled={waiting}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
              >
                {waiting ? <RefreshCw className="animate-spin" /> : <Users />}
                {waiting ? 'Searching...' : 'Find a Match'}
              </button>
            </div>

            {/* Private Call Card */}
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-xl hover:border-emerald-500/50 transition-colors">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center">
                  <Shield className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-white">Private Room</h2>
              </div>
              <input 
                type="text" 
                id="targetId"
                placeholder="Partner Orey-ID..."
                className="w-full bg-slate-800 border-none rounded-2xl px-6 py-4 mb-4 focus:ring-2 focus:ring-emerald-500 transition-all outline-none font-mono text-sm"
              />
              <button 
                onClick={() => handleConnectById(document.getElementById('targetId').value, userNameRef.current)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Video /> Connect Direct
              </button>
            </div>
          </div>

          {myId && (
            <div className="mt-12 p-4 bg-slate-900/50 border border-slate-800 rounded-2xl flex items-center justify-between max-w-sm mx-auto">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Your Permanent ID</p>
                <p className="font-mono text-indigo-400">{myId}</p>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(myId); toast('ID Copied!'); }} className="p-3 hover:bg-slate-800 rounded-xl transition-colors">
                <Copy size={18} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="h-screen bg-black flex flex-col md:flex-row relative overflow-hidden">
          {/* Main Video Area */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 p-2 relative">
            {/* Remote */}
            <div className="bg-slate-900 rounded-3xl overflow-hidden relative shadow-2xl flex items-center justify-center">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              {(!remoteVideoOn || !peerId) && (
                <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center">
                  {searching ? (
                    <div className="text-center animate-pulse">
                      <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-indigo-400 font-bold uppercase tracking-widest text-sm">{searchMessage}</p>
                    </div>
                  ) : (
                    <div className="text-center text-slate-700">
                      <User size={80} className="mx-auto mb-2 opacity-20" />
                      <p className="font-bold uppercase tracking-widest text-xs opacity-50">Waiting for Remote Stream</p>
                    </div>
                  )}
                </div>
              )}
              <div className="absolute bottom-6 left-6 bg-black/60 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/5 text-sm font-bold flex items-center gap-2">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                {peerName}
              </div>
            </div>

            {/* Local */}
            <div className="bg-slate-900 rounded-3xl overflow-hidden relative shadow-2xl flex items-center justify-center">
              <video ref={localVideoRef} autoPlay muted playsInline className={`w-full h-full object-cover ${!videoOn ? 'hidden' : ''}`} />
              {!videoOn && <User size={80} className="text-slate-800" />}
              <div className="absolute bottom-6 left-6 bg-indigo-600/60 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/5 text-sm font-bold">
                You
              </div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="h-24 md:h-full md:w-24 bg-slate-950 border-t md:border-t-0 md:border-l border-slate-800 flex md:flex-col items-center justify-center gap-4 p-4">
            <button onClick={handleToggleMic} className={`p-4 rounded-2xl transition-all ${audioOn ? 'bg-slate-800' : 'bg-red-500 text-white'}`}>
              {audioOn ? <Mic size={24} /> : <MicOff size={24} />}
            </button>
            <button onClick={handleToggleCam} className={`p-4 rounded-2xl transition-all ${videoOn ? 'bg-slate-800' : 'bg-red-500 text-white'}`}>
              {videoOn ? <Video size={24} /> : <VideoOff size={24} />}
            </button>
            <div className="h-px w-8 bg-slate-800 hidden md:block"></div>
            <button 
              onClick={() => { closePC(); setRemoteVideoOn(false); socket.emit('skip', { roomId: roomIdRef.current }); }}
              className="p-4 bg-indigo-600 rounded-2xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 group"
            >
              <RefreshCw size={24} className="group-active:rotate-180 transition-transform duration-500" />
            </button>
            <button onClick={() => { socket.emit('share-id-request', { roomId: roomIdRef.current }); toast('ID Request Sent'); }} className="p-4 bg-slate-800 rounded-2xl text-amber-500">
              <Share2 size={24} />
            </button>
            <button onClick={() => { cancelSearchTimer(); socket.emit('leave-chat', { roomId: roomIdRef.current }); }} className="p-4 bg-slate-800 rounded-2xl hover:bg-red-600 transition-colors">
              <PhoneOff size={24} />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {shareModal && (
        <ModalWrapper>
          <div className="text-center">
            <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-400">
              <Shield size={32} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Identify Partner?</h3>
            <p className="text-slate-400 text-sm mb-6">
              <span className="text-indigo-400 font-bold">{shareModal.fromName}</span> wants to reveal their permanent Orey-ID to you. Accepting will reveal yours to them.
            </p>
            <div className="flex gap-3">
              <button onClick={() => { socket.emit('share-id-decline', { roomId: roomIdRef.current }); setShareModal(null); }} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold">Decline</button>
              <button onClick={() => { socket.emit('share-id-accept', { roomId: roomIdRef.current, targetId: shareModal.fromId }); setShareModal(null); }} className="flex-1 py-3 bg-indigo-600 rounded-xl font-bold">Accept</button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {revealModal && (
        <ModalWrapper>
          <div className="text-center">
            <Check className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-1">Identity Revealed</h3>
            <p className="text-slate-400 text-sm mb-6">Partner: <span className="text-white font-bold">{revealModal.userName}</span></p>
            <div className="bg-black/50 p-4 rounded-2xl mb-6 flex items-center justify-between">
              <span className="font-mono text-xs text-indigo-400">{revealModal.oreyId}</span>
              <button onClick={() => { navigator.clipboard.writeText(revealModal.oreyId); toast('Copied!'); }}><Copy size={16} /></button>
            </div>
            <button onClick={() => setRevealModal(null)} className="w-full py-3 bg-slate-800 rounded-xl font-bold">Close</button>
          </div>
        </ModalWrapper>
      )}
    </div>
  );
}
