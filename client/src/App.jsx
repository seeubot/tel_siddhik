import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from './lib/socket';
import { useWebRTC } from './hooks/useWebRTC';
import Lobby from './components/Lobby';
import CallScreen from './components/CallScreen';
import { ShareRequestModal, RevealModal } from './components/Modals';
import Toast from './components/Toast';

export default function App() {
  const socketRef = useRef(null);

  const [screen, setScreen] = useState('lobby'); // 'lobby' | 'call'
  const [userName, setUserName] = useState('');
  const [oreyId, setOreyId] = useState('');
  const [oreyIdExpiry, setOreyIdExpiry] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [partner, setPartner] = useState(null); // { socketId, userName, oreyId }
  const [searching, setSearching] = useState(false);
  const [autoSearchCountdown, setAutoSearchCountdown] = useState(null);
  const [autoSearchDelay, setAutoSearchDelay] = useState(null);

  const [shareRequest, setShareRequest] = useState(null); // { fromId, fromName }
  const [revealData, setRevealData] = useState(null);     // { oreyId, userName }

  const [toast, setToast] = useState(null);

  const webrtc = useWebRTC(socketRef);

  // ── Toast helper ───────────────────────────────────────────────────────────

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  // ── Fetch Orey-ID on mount ─────────────────────────────────────────────────

  useEffect(() => {
    fetch('/generate-orey-id')
      .then((r) => r.json())
      .then(({ oreyId, expiresAt }) => {
        setOreyId(oreyId);
        setOreyIdExpiry(expiresAt);
      })
      .catch(() => showToast('Could not generate Orey-ID', 'error'));
  }, [showToast]);

  // ── Socket setup ───────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      if (oreyId) {
        socket.emit('register-orey-id', { oreyId, userName: userName || 'Anonymous' });
      }
    });

    socket.on('orey-id-registered', ({ oreyId: id, expiresAt }) => {
      setOreyId(id);
      setOreyIdExpiry(expiresAt);
    });

    socket.on('waiting-for-match', () => {
      setSearching(true);
    });

    socket.on('random-cancelled', () => {
      setSearching(false);
    });

    socket.on('room-joined', ({ roomId: rid, peers }) => {
      setRoomId(rid);
      setSearching(false);
      if (peers && peers.length > 0) {
        setPartner(peers[0]);
      }
      setScreen('call');
      webrtc.startLocal();
    });

    socket.on('incoming-call', ({ fromName, fromOreyId, autoMatched }) => {
      setPartner((prev) => prev ? { ...prev, userName: fromName, oreyId: fromOreyId } : { userName: fromName, oreyId: fromOreyId });
      if (!autoMatched) {
        showToast(`${fromName} is calling…`, 'info');
      }
    });

    socket.on('user-joined', ({ socketId, userName: pName }) => {
      setPartner({ socketId, userName: pName, oreyId: null });
    });

    socket.on('offer', async ({ offer, fromId, fromName }) => {
      await webrtc.handleOffer(fromId, offer);
    });

    socket.on('answer', async ({ answer }) => {
      await webrtc.handleAnswer(answer);
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      await webrtc.handleIceCandidate(candidate);
    });

    socket.on('peer-media-state', ({ audioEnabled, videoEnabled }) => {
      webrtc.setPartnerMedia({ audio: audioEnabled, video: videoEnabled });
    });

    socket.on('partner-left', ({ userName: pName, reason }) => {
      showToast(`${pName || 'Partner'} ${reason === 'skip' ? 'skipped' : 'left'}`, 'warning');
      webrtc.closePeer();
      setPartner(null);
    });

    socket.on('auto-search-scheduled', ({ delay }) => {
      setAutoSearchDelay(delay);
      setAutoSearchCountdown(Math.ceil(delay / 1000));
    });

    socket.on('auto-search-cancelled', () => {
      setAutoSearchCountdown(null);
      setAutoSearchDelay(null);
    });

    socket.on('left-chat-confirmed', () => {
      setScreen('lobby');
      setPartner(null);
      setRoomId('');
      webrtc.stopLocal();
      webrtc.closePeer();
    });

    socket.on('skip-confirmed', () => {
      webrtc.closePeer();
      setPartner(null);
      setSearching(true);
    });

    socket.on('share-id-request', ({ fromId, fromName }) => {
      setShareRequest({ fromId, fromName });
    });

    socket.on('share-id-reveal', ({ oreyId: rid, userName: rName }) => {
      setRevealData({ oreyId: rid, userName: rName });
    });

    socket.on('share-id-declined', () => {
      showToast('Partner declined to share ID', 'warning');
    });

    socket.on('orey-id-not-found', () => showToast('Orey-ID not found', 'error'));
    socket.on('orey-id-expired', () => showToast('Orey-ID has expired', 'error'));
    socket.on('orey-id-offline', () => showToast('User is offline', 'error'));
    socket.on('orey-id-invalid', () => showToast('Invalid Orey-ID', 'error'));
    socket.on('room-full', () => showToast('Room is full', 'error'));

    return () => {
      socket.removeAllListeners();
    };
  }, [oreyId, userName, webrtc, showToast]);

  // ── Register Orey-ID when it's available ──────────────────────────────────

  useEffect(() => {
    const socket = socketRef.current;
    if (socket?.connected && oreyId) {
      socket.emit('register-orey-id', { oreyId, userName: userName || 'Anonymous' });
    }
  }, [oreyId, userName]);

  // ── Auto-search countdown ─────────────────────────────────────────────────

  useEffect(() => {
    if (autoSearchCountdown === null) return;
    if (autoSearchCountdown <= 0) {
      setAutoSearchCountdown(null);
      return;
    }
    const t = setTimeout(() => setAutoSearchCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [autoSearchCountdown]);

  // ── WebRTC: make offer when both in room ──────────────────────────────────
  // Caller is whoever joined as the "first" peer received via user-joined
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleUserJoined = ({ socketId }) => {
      // We are the one already in the room → we make the offer
      webrtc.makeOffer(socketId);
    };

    socket.on('user-joined', handleUserJoined);
    return () => socket.off('user-joined', handleUserJoined);
  }, [webrtc]);

  // Auto-offer when auto-matched (server sends room-joined with peers already populated)
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleRoomJoined = ({ peers, autoMatched }) => {
      if (autoMatched && peers && peers.length > 0) {
        // Small delay to ensure both sides have set up listeners
        setTimeout(() => {
          // Only one side makes the offer — lower socket ID wins
          if (socket.id < peers[0].socketId) {
            webrtc.makeOffer(peers[0].socketId);
          }
        }, 300);
      }
    };

    socket.on('room-joined', handleRoomJoined);
    return () => socket.off('room-joined', handleRoomJoined);
  }, [webrtc]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleDiscover = () => {
    socketRef.current?.emit('join-random');
  };

  const handleCancelSearch = () => {
    socketRef.current?.emit('cancel-random');
    setSearching(false);
  };

  const handleConnectById = (targetOreyId) => {
    socketRef.current?.emit('connect-by-orey-id', { targetOreyId });
  };

  const handleSkip = () => {
    socketRef.current?.emit('skip', { roomId });
  };

  const handleLeave = () => {
    socketRef.current?.emit('leave-chat', { roomId });
    setAutoSearchCountdown(null);
    cancelAutoSearch();
  };

  const cancelAutoSearch = () => {
    socketRef.current?.emit('cancel-auto-search');
    setAutoSearchCountdown(null);
    setAutoSearchDelay(null);
  };

  const handleShareId = () => {
    socketRef.current?.emit('share-id-request', { roomId });
    showToast('ID share request sent', 'info');
  };

  const handleAcceptShare = () => {
    socketRef.current?.emit('share-id-accept', { roomId, targetId: shareRequest.fromId });
    setShareRequest(null);
  };

  const handleDeclineShare = () => {
    socketRef.current?.emit('share-id-decline', { roomId });
    setShareRequest(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {screen === 'lobby' && (
        <Lobby
          userName={userName}
          setUserName={setUserName}
          oreyId={oreyId}
          oreyIdExpiry={oreyIdExpiry}
          searching={searching}
          onDiscover={handleDiscover}
          onCancelSearch={handleCancelSearch}
          onConnectById={handleConnectById}
        />
      )}

      {screen === 'call' && (
        <CallScreen
          partner={partner}
          roomId={roomId}
          oreyId={oreyId}
          localVideoRef={webrtc.localVideoRef}
          remoteVideoRef={webrtc.remoteVideoRef}
          audioEnabled={webrtc.audioEnabled}
          videoEnabled={webrtc.videoEnabled}
          partnerMedia={webrtc.partnerMedia}
          searching={searching}
          autoSearchCountdown={autoSearchCountdown}
          onToggleAudio={() => webrtc.toggleAudio(roomId)}
          onToggleVideo={() => webrtc.toggleVideo(roomId)}
          onSkip={handleSkip}
          onLeave={handleLeave}
          onShareId={handleShareId}
          onCancelAutoSearch={cancelAutoSearch}
        />
      )}

      {shareRequest && (
        <ShareRequestModal
          fromName={shareRequest.fromName}
          onAccept={handleAcceptShare}
          onDecline={handleDeclineShare}
        />
      )}

      {revealData && (
        <RevealModal
          oreyId={revealData.oreyId}
          userName={revealData.userName}
          onClose={() => setRevealData(null)}
        />
      )}

      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </>
  );
}
