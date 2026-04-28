import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from './lib/socket';
import { useWebRTC } from './hooks/useWebRTC';
import { useDeviceIdentity } from './hooks/useDeviceIdentity';
import { useReport } from './hooks/useReport';
import DeviceIdentity from './lib/DeviceIdentity'; // ADD THIS IMPORT
import Lobby from './components/Lobby';
import CallScreen from './components/CallScreen';
import BanScreen from './components/BanScreen';
import ReportModal from './components/ReportModal';
import { ShareRequestModal, RevealModal } from './components/Modals';
import Toast from './components/Toast';

export default function App() {
  const socketRef = useRef(null);

  // ── App State ──────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState('loading'); // START AS LOADING
  const [userName, setUserName] = useState('');
  const [oreyId, setOreyId] = useState('');
  const [oreyIdExpiry, setOreyIdExpiry] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [partner, setPartner] = useState(null);
  const [searching, setSearching] = useState(false);
  const [autoSearchCountdown, setAutoSearchCountdown] = useState(null);
  const [autoSearchDelay, setAutoSearchDelay] = useState(null);

  const [shareRequest, setShareRequest] = useState(null);
  const [revealData, setRevealData] = useState(null);
  const [reportModal, setReportModal] = useState(false);

  const [toast, setToast] = useState(null);

  const webrtc = useWebRTC(socketRef);

  // ── Device Identity & Ban State ───────────────────────────────────────────
  const { 
    deviceId, 
    isBanned, 
    banInfo, 
    isLoading: deviceLoading 
  } = useDeviceIdentity(socketRef);

  // ── Report Hook ───────────────────────────────────────────────────────────
  const { reportUser, isReporting } = useReport(deviceId);

  // ── Toast helper ───────────────────────────────────────────────────────────
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  // ── FIXED: Set screen based on device state ───────────────────────────────
  useEffect(() => {
    console.log('🔄 Screen effect running:', { deviceLoading, isBanned, currentScreen: screen });
    
    if (deviceLoading) {
      console.log('⏳ Device still loading...');
      setScreen('loading');
    } else if (isBanned) {
      console.log('🚫 Device is BANNED - showing ban screen');
      setScreen('banned');
    } else {
      console.log('✅ Device OK - showing lobby');
      setScreen('lobby');
    }
  }, [deviceLoading, isBanned]); // Remove 'screen' from dependency to avoid loops

  // ── Fetch Orey-ID when not banned ─────────────────────────────────────────
  useEffect(() => {
    if (isBanned || deviceLoading) return;
    
    fetch('/generate-orey-id')
      .then((r) => r.json())
      .then(({ oreyId, expiresAt }) => {
        setOreyId(oreyId);
        setOreyIdExpiry(expiresAt);
      })
      .catch(() => showToast('Could not generate Orey-ID', 'error'));
  }, [showToast, isBanned, deviceLoading]);

  // ── Socket setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      if (deviceId) {
        socket.emit('register-device', { deviceId });
      }
      if (oreyId) {
        socket.emit('register-orey-id', { oreyId, userName: userName || 'Anonymous' });
      }
    });

    // FIXED: Ban event - also update local ban storage
    socket.on('device-banned', (serverBanInfo) => {
      console.log('🚫 Received ban from server:', serverBanInfo);
      DeviceIdentity.storeBan(serverBanInfo); // Store ban locally
      showToast('Your device has been banned', 'error');
      setScreen('banned');
    });

    socket.on('device-registered', ({ deviceId: registeredId }) => {
      console.log('Device registered:', registeredId?.substring(0, 12) + '...');
    });

    socket.on('device-error', ({ error }) => {
      showToast(error, 'error');
    });

    socket.on('warning', ({ reason, message }) => {
      showToast(message || `Warning: ${reason}`, 'warning');
    });

    socket.on('report-submitted', ({ success, autoBanned }) => {
      if (autoBanned) {
        showToast('User has been automatically banned due to multiple reports', 'warning');
      } else {
        showToast('Report submitted successfully', 'info');
      }
    });

    socket.on('report-error', ({ error }) => {
      showToast(error, 'error');
    });

    // ── Existing socket events (unchanged) ──
    socket.on('orey-id-registered', ({ oreyId: id, expiresAt }) => {
      setOreyId(id);
      setOreyIdExpiry(expiresAt);
    });

    socket.on('waiting-for-match', () => setSearching(true));
    socket.on('random-cancelled', () => setSearching(false));

    socket.on('room-joined', ({ roomId: rid, peers }) => {
      setRoomId(rid);
      setSearching(false);
      if (peers && peers.length > 0) {
        setPartner({
          ...peers[0],
          deviceId: peers[0].deviceId || null
        });
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
      setPartner((prev) => ({ ...prev, socketId, userName: pName }));
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
      setReportModal(false);
      webrtc.stopLocal();
      webrtc.closePeer();
    });

    socket.on('skip-confirmed', () => {
      webrtc.closePeer();
      setPartner(null);
      setReportModal(false);
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
  }, [oreyId, userName, deviceId, webrtc, showToast]);

  // ── Register IDs when available ───────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (socket?.connected && oreyId) {
      socket.emit('register-orey-id', { oreyId, userName: userName || 'Anonymous' });
    }
  }, [oreyId, userName]);

  useEffect(() => {
    const socket = socketRef.current;
    if (socket?.connected && deviceId) {
      socket.emit('register-device', { deviceId });
    }
  }, [deviceId]);

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

  // ── WebRTC offer handling ─────────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const handleUserJoined = ({ socketId }) => webrtc.makeOffer(socketId);
    socket.on('user-joined', handleUserJoined);
    return () => socket.off('user-joined', handleUserJoined);
  }, [webrtc]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const handleRoomJoined = ({ peers, autoMatched }) => {
      if (autoMatched && peers && peers.length > 0) {
        setTimeout(() => {
          if (socket.id < peers[0].socketId) {
            webrtc.makeOffer(peers[0].socketId);
          }
        }, 300);
      }
    };
    socket.on('room-joined', handleRoomJoined);
    return () => socket.off('room-joined', handleRoomJoined);
  }, [webrtc]);

  // ── Actions (unchanged) ───────────────────────────────────────────────────
  const handleDiscover = () => socketRef.current?.emit('join-random');
  const handleCancelSearch = () => { socketRef.current?.emit('cancel-random'); setSearching(false); };
  const handleConnectById = (targetOreyId) => socketRef.current?.emit('connect-by-orey-id', { targetOreyId });
  const handleSkip = () => socketRef.current?.emit('skip', { roomId });
  const handleLeave = () => { socketRef.current?.emit('leave-chat', { roomId }); setAutoSearchCountdown(null); cancelAutoSearch(); };
  const cancelAutoSearch = () => { socketRef.current?.emit('cancel-auto-search'); setAutoSearchCountdown(null); setAutoSearchDelay(null); };
  const handleShareId = () => { socketRef.current?.emit('share-id-request', { roomId }); showToast('ID share request sent', 'info'); };
  const handleAcceptShare = () => { socketRef.current?.emit('share-id-accept', { roomId, targetId: shareRequest.fromId }); setShareRequest(null); };
  const handleDeclineShare = () => { socketRef.current?.emit('share-id-decline', { roomId }); setShareRequest(null); };
  const handleOpenReport = () => setReportModal(true);
  const handleCloseReport = () => setReportModal(false);

  const handleSubmitReport = async (reason, description) => {
    if (!partner) { showToast('No partner to report', 'error'); return; }
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit('report-user', {
          reportedDeviceId: partner.deviceId || partner.socketId,
          reportedUserId: partner.oreyId || null,
          reason, description
        });
      } else {
        const response = await fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': 'oryx_2024_secure_key_change_this' },
          body: JSON.stringify({ reporterDeviceId: deviceId, reportedDeviceId: partner.deviceId || partner.socketId, reportedUserId: partner.oreyId || null, reason, description })
        });
        const result = await response.json();
        if (result.autoBanned) showToast('User has been automatically banned', 'warning');
        else showToast('Report submitted successfully', 'info');
      }
      setReportModal(false);
    } catch (error) { showToast('Failed to submit report', 'error'); }
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER - FIXED: Uses isBanned directly
  // ═══════════════════════════════════════════════════════════════

  console.log('🎨 Render:', { screen, isBanned, deviceLoading, banInfo }); // DEBUG

  // Loading screen
  if (deviceLoading || screen === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#FF2D55', fontSize: '1.5rem', fontWeight: 'bold' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          Initializing...
        </div>
      </div>
    );
  }

  // FIXED: Check BOTH screen AND isBanned
  if (screen === 'banned' || isBanned) {
    return (
      <BanScreen
        reason={banInfo?.reason || 'Your device has been banned due to violations of our terms of service.'}
        expiresAt={banInfo?.expiresAt || null}
        permanent={!banInfo?.expiresAt}
      />
    );
  }

  // Normal app
  return (
    <>
      {screen === 'lobby' && (
        <Lobby userName={userName} setUserName={setUserName} oreyId={oreyId} oreyIdExpiry={oreyIdExpiry} searching={searching} onDiscover={handleDiscover} onCancelSearch={handleCancelSearch} onConnectById={handleConnectById} />
      )}
      {screen === 'call' && (
        <CallScreen partner={partner} roomId={roomId} oreyId={oreyId} localVideoRef={webrtc.localVideoRef} remoteVideoRef={webrtc.remoteVideoRef} audioEnabled={webrtc.audioEnabled} videoEnabled={webrtc.videoEnabled} partnerMedia={webrtc.partnerMedia} searching={searching} autoSearchCountdown={autoSearchCountdown} onToggleAudio={() => webrtc.toggleAudio(roomId)} onToggleVideo={() => webrtc.toggleVideo(roomId)} onSkip={handleSkip} onLeave={handleLeave} onShareId={handleShareId} onCancelAutoSearch={cancelAutoSearch} onReport={handleOpenReport} />
      )}
      <ReportModal isOpen={reportModal} onClose={handleCloseReport} onSubmit={handleSubmitReport} reportedUserName={partner?.userName || 'Unknown User'} isReporting={isReporting} />
      {shareRequest && <ShareRequestModal fromName={shareRequest.fromName} onAccept={handleAcceptShare} onDecline={handleDeclineShare} />}
      {revealData && <RevealModal oreyId={revealData.oreyId} userName={revealData.userName} onClose={() => setRevealData(null)} />}
      {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </>
  );
}
