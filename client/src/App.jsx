import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from './lib/socket';
import { useWebRTC } from './hooks/useWebRTC';
import { useDeviceIdentity } from './hooks/useDeviceIdentity';
import { useReport } from './hooks/useReport';
import DeviceIdentity from './lib/DeviceIdentity';
import Lobby from './components/Lobby';
import CallScreen from './components/CallScreen';
import BanScreen from './components/BanScreen';
import ReportModal from './components/ReportModal';
import { ShareRequestModal, RevealModal } from './components/Modals';
import Toast from './components/Toast';

export default function App() {
  const socketRef = useRef(null);

  // ── App State ──────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState('loading');
  const [userName, setUserName] = useState('');
  const [oreyId, setOreyId] = useState('');
  const [oreyIdExpiry, setOreyIdExpiry] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [partner, setPartner] = useState(null);
  const [searching, setSearching] = useState(false);
  const [autoSearchCountdown, setAutoSearchCountdown] = useState(null);
  const [autoSearchDelay, setAutoSearchDelay] = useState(null);
  const [gender, setGender] = useState(null); // 🆕 Gender state
  const [genderStats, setGenderStats] = useState(null); // 🆕 Gender queue stats
  const [notifications, setNotifications] = useState([]); // 🆕 Notifications state
  const [unreadNotifications, setUnreadNotifications] = useState(0); // 🆕 Unread count

  const [shareRequest, setShareRequest] = useState(null);
  const [revealData, setRevealData] = useState(null);
  const [reportModal, setReportModal] = useState(false);

  const [toast, setToast] = useState(null);

  // ── Chat State ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const socketIdRef = useRef(null);

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

  // ── 🆕 Handle Gender Change ───────────────────────────────────────────────
  const handleSetGender = useCallback((newGender) => {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('set-gender', { gender: newGender });
    }
    setGender(newGender);
  }, []);

  // ── Clear chat messages on partner change ──────────────────────────────────
  useEffect(() => {
    setMessages([]);
    setPeerTyping(false);
  }, [partner?.socketId]);

  // ── Set screen based on device state ───────────────────────────────────────
  useEffect(() => {
    if (deviceLoading) {
      setScreen('loading');
    } else if (isBanned) {
      setScreen('banned');
    } else {
      setScreen('lobby');
    }
  }, [deviceLoading, isBanned]);

  // ── Fetch Orey-ID when not banned ─────────────────────────────────────────
  useEffect(() => {
    if (isBanned || deviceLoading) return;
    
    fetch('/generate-orey-id')
      .then((r) => r.json())
      .then(({ oreyId, expiresAt, hashId }) => {
        setOreyId(oreyId); // Display format: OREY-XXXXX
        // hashId is stored internally by the server
        setOreyIdExpiry(expiresAt);
      })
      .catch(() => showToast('Could not generate Orey-ID', 'error'));
  }, [showToast, isBanned, deviceLoading]);

  // ── 🆕 Fetch Notifications ────────────────────────────────────────────────
  useEffect(() => {
    if (isBanned || deviceLoading || !deviceId) return;
    
    const fetchNotifications = () => {
      fetch(`/api/notifications?device_id=${deviceId}&platform=web`)
        .then(r => r.json())
        .then(data => {
          if (data.notifications) {
            setNotifications(data.notifications);
            setUnreadNotifications(data.unread || 0);
          }
        })
        .catch(() => {});
    };
    
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [deviceId, isBanned, deviceLoading]);

  // ── Chat: Send Message ────────────────────────────────────────────────────
  const handleSendMessage = useCallback((text) => {
    const socket = socketRef.current;
    if (!socket?.connected || !roomId) return;

    const messageData = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      senderId: socket.id,
      senderName: userName || 'Anonymous',
      text,
      timestamp: new Date().toISOString(),
      roomId,
      isOwn: true
    };

    setMessages(prev => [...prev, messageData]);
    socket.emit('chat-message', { roomId, message: text, type: 'text' });
  }, [roomId, userName]);

  // ── Chat: Handle Typing Indicator ─────────────────────────────────────────
  const handleTyping = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !roomId) return;

    socket.emit('chat-typing', { roomId, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('chat-typing', { roomId, isTyping: false });
    }, 2000);
  }, [roomId]);

  // ── Socket setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      socketIdRef.current = socket.id;
      if (deviceId) {
        socket.emit('register-device', { deviceId });
      }
      if (oreyId) {
        socket.emit('register-orey-id', { oreyId, userName: userName || 'Anonymous' });
      }
    });

    socket.on('device-banned', (serverBanInfo) => {
      DeviceIdentity.storeBan(serverBanInfo);
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

    // ── 🆕 Gender Events ────────────────────────────────────────────────────
    socket.on('gender-set', ({ gender: serverGender, accepted, message }) => {
      setGender(serverGender);
      if (message) showToast(message, accepted ? 'info' : 'warning');
    });

    socket.on('waiting-for-match', ({ gender: matchGender, genderStats: stats }) => {
      setSearching(true);
      if (stats) setGenderStats(stats);
    });

    // ── 🆕 Notification Events ──────────────────────────────────────────────
    socket.on('new-notification', (notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadNotifications(prev => prev + 1);
      showToast(notification.title, 'info');
    });

    // ── Chat Socket Events ───────────────────────────────────────────────────
    socket.on('chat-message', (msg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, {
          ...msg,
          isOwn: msg.senderId === socket.id,
          text: msg.message
        }];
      });
    });

    socket.on('peer-typing', ({ socketId, userName: typingUser, isTyping }) => {
      if (socketId !== socket.id) {
        setPeerTyping(isTyping);
        if (isTyping) {
          setTimeout(() => setPeerTyping(false), 3000);
        }
      }
    });

    socket.on('chat-error', ({ error }) => {
      showToast(error, 'error');
    });

    // ── Existing socket events ──
    socket.on('orey-id-registered', ({ oreyId: id, expiresAt }) => {
      setOreyId(id);
      setOreyIdExpiry(expiresAt);
    });

    socket.on('random-cancelled', () => setSearching(false));

    socket.on('room-joined', ({ roomId: rid, peers }) => {
      setRoomId(rid);
      setSearching(false);
      setMessages([]);
      if (peers && peers.length > 0) {
        setPartner({
          ...peers[0],
          deviceId: peers[0].deviceId || null
        });
      }
      setScreen('call');
      webrtc.startLocal();
    });

    socket.on('incoming-call', ({ fromName, fromOreyId, partnerGender, autoMatched }) => {
      setPartner((prev) => prev ? { 
        ...prev, 
        userName: fromName, 
        oreyId: fromOreyId,
        gender: partnerGender 
      } : { 
        userName: fromName, 
        oreyId: fromOreyId,
        gender: partnerGender 
      });
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
      setMessages([]);
      setPeerTyping(false);
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
      setMessages([]);
      setPeerTyping(false);
      webrtc.stopLocal();
      webrtc.closePeer();
    });

    socket.on('skip-confirmed', () => {
      webrtc.closePeer();
      setPartner(null);
      setReportModal(false);
      setMessages([]);
      setPeerTyping(false);
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
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
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

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleDiscover = () => socketRef.current?.emit('join-random');
  const handleCancelSearch = () => { socketRef.current?.emit('cancel-random'); setSearching(false); };
  const handleConnectById = (targetOreyId) => socketRef.current?.emit('connect-by-orey-id', { targetOreyId });
  const handleSkip = () => { socketRef.current?.emit('skip', { roomId }); setMessages([]); setPeerTyping(false); };
  const handleLeave = () => { socketRef.current?.emit('leave-chat', { roomId }); setAutoSearchCountdown(null); cancelAutoSearch(); setMessages([]); setPeerTyping(false); };
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
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  if (deviceLoading || screen === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#6366f1', fontSize: '1.5rem', fontWeight: 'bold' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔷</div>
          Orey! - Mana App
        </div>
      </div>
    );
  }

  if (screen === 'banned' || isBanned) {
    return (
      <BanScreen
        reason={banInfo?.reason || 'Your device has been banned due to violations of our terms of service.'}
        expiresAt={banInfo?.expiresAt || null}
        permanent={!banInfo?.expiresAt}
      />
    );
  }

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
          gender={gender}
          onSetGender={handleSetGender}
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
          onReport={handleOpenReport}
          onSendMessage={handleSendMessage}
          messages={messages}
          peerTyping={peerTyping}
          onTyping={handleTyping}
          currentUserName={userName}
          userOreyId={oreyId}
        />
      )}
      <ReportModal 
        isOpen={reportModal} 
        onClose={handleCloseReport} 
        onSubmit={handleSubmitReport} 
        reportedUserName={partner?.userName || 'Unknown User'} 
        isReporting={isReporting} 
      />
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
