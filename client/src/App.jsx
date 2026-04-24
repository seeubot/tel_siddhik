import { useEffect, useRef, useState, useCallback } from 'react'
import { socket } from './lib/socket'
import { useWebRTC } from './hooks/useWebRTC'
import Lobby from './components/Lobby.jsx'
import CallScreen from './components/CallScreen.jsx'
import { ShareRequestModal, RevealModal } from './components/Modals.jsx'
import Toast from './components/Toast.jsx'

const AUTO_SEARCH_DELAY = 3000

export default function App() {
  // ── Identity ───────────────────────────────────────────────────────────────
  const [myId, setMyId] = useState(null)
  const myIdRef = useRef(null)
  const userNameRef = useRef('Anonymous')

  // ── Screen state ───────────────────────────────────────────────────────────
  const [screen, setScreen] = useState('lobby') // 'lobby' | 'call'

  // ── Lobby state ────────────────────────────────────────────────────────────
  const [waiting, setWaiting] = useState(false)
  const [lobStatus, setLobStatus] = useState(null)

  // ── Call state ─────────────────────────────────────────────────────────────
  const [roomId, setRoomId] = useState(null)
  const [peerId, setPeerId] = useState(null)
  const [peerName, setPeerName] = useState(null)
  const [audioOn, setAudioOn] = useState(true)
  const [videoOn, setVideoOn] = useState(true)
  // FIX #4: Default to false so fallback avatar shows until remote stream arrives
  const [remoteVideoOn, setRemoteVideoOn] = useState(false)

  // ── Auto-search state ──────────────────────────────────────────────────────
  const [searching, setSearching] = useState(false)
  const [searchMessage, setSearchMessage] = useState('')
  const searchTimerRef = useRef(null)

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [shareModal, setShareModal] = useState(null)
  const [revealModal, setRevealModal] = useState(null)

  // ── Refs ───────────────────────────────────────────────────────────────────
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const roomIdRef = useRef(null)
  const peerIdRef = useRef(null)
  const toastRef = useRef(null)

  // FIX: Track pending peer to make offer after screen mounts
  const pendingPeerRef = useRef(null)

  const toast = useCallback((msg, dur) => toastRef.current?.show(msg, dur), [])

  // Keep refs in sync
  useEffect(() => { roomIdRef.current = roomId }, [roomId])
  useEffect(() => { peerIdRef.current = peerId }, [peerId])

  // ── WebRTC ─────────────────────────────────────────────────────────────────
  const { startLocal, stopLocal, makeOffer, handleOffer, handleAnswer, handleIce, closePC, localStreamRef } =
    useWebRTC({
      localVideoRef,
      remoteVideoRef,
      onRemoteStream: () => setRemoteVideoOn(true),
      onCallTimer: () => {},
    })

  // ── Helpers ────────────────────────────────────────────────────────────────
  const updatePeer = useCallback((name) => {
    setPeerName(name || 'Anonymous')
  }, [])

  const cancelSearchTimer = useCallback(() => {
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = null
    setSearching(false)
    setSearchMessage('')
  }, [])

  const cleanupCall = useCallback(() => {
    closePC()
    stopLocal()
    cancelSearchTimer()
    setPeerId(null)
    setPeerName(null)
    // FIX #4: Reset to false on cleanup so next call starts fresh
    setRemoteVideoOn(false)
    pendingPeerRef.current = null
  }, [closePC, stopLocal, cancelSearchTimer])

  const goLobby = useCallback(() => {
    cleanupCall()
    setRoomId(null)
    setWaiting(false)
    setScreen('lobby')
  }, [cleanupCall])

  // FIX #1 & #2: After screen === 'call' renders, React has mounted the video
  // elements and localStreamRef is populated. NOW it is safe to makeOffer.
  useEffect(() => {
    if (screen === 'call' && pendingPeerRef.current && localStreamRef.current) {
      const { socketId } = pendingPeerRef.current
      pendingPeerRef.current = null
      makeOffer(socketId)
    }
  }, [screen, makeOffer, localStreamRef])

  // ── Socket events ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Generate ID on mount
    fetch('/generate-orey-id')
      .then(r => r.json())
      .then(d => {
        setMyId(d.oreyId)
        myIdRef.current = d.oreyId
      })
      .catch(() => {})

    socket.on('connect', () => {
      if (myIdRef.current) {
        socket.emit('register-orey-id', { oreyId: myIdRef.current, userName: userNameRef.current })
      }
    })

    socket.on('waiting-for-match', () => {
      setWaiting(true)
    })

    socket.on('random-cancelled', () => {
      setWaiting(false)
      cancelSearchTimer()
    })

    socket.on('room-joined', async ({ roomId: r, peers, autoMatched }) => {
      setRoomId(r)
      roomIdRef.current = r
      setWaiting(false)
      cancelSearchTimer()
      setSearching(false)

      // FIX #1 & #2: Start local stream first, THEN switch screen.
      // Store the peer in a ref so the useEffect above can call makeOffer
      // only after React has mounted CallScreen and video refs are live.
      await startLocal()

      if (peers?.length) {
        const p = peers[0]
        setPeerId(p.socketId)
        peerIdRef.current = p.socketId
        updatePeer(p.userName)
        // Store peer for deferred makeOffer (triggered by screen useEffect)
        pendingPeerRef.current = { socketId: p.socketId }
      }

      // Switch screen last — this mounts CallScreen and triggers the useEffect
      setScreen('call')

      if (autoMatched) toast('Connected with a new partner!', 2000)
    })

    socket.on('user-joined', ({ socketId, userName }) => {
      setPeerId(socketId)
      peerIdRef.current = socketId
      updatePeer(userName)
    })

    socket.on('offer', async ({ offer, fromId, fromName }) => {
      setPeerId(fromId)
      peerIdRef.current = fromId
      updatePeer(fromName)
      await handleOffer(offer, fromId)
    })

    socket.on('answer', async ({ answer }) => {
      await handleAnswer(answer)
    })

    socket.on('ice-candidate', async ({ candidate }) => {
      await handleIce(candidate)
    })

    socket.on('peer-media-state', ({ videoEnabled }) => {
      setRemoteVideoOn(videoEnabled)
    })

    socket.on('partner-left', ({ userName, reason }) => {
      closePC()
      // FIX #4: Reset remote video state when partner leaves
      setRemoteVideoOn(false)

      const msgs = {
        left: 'Partner left',
        skipped: 'Partner skipped',
        disconnected: 'Partner disconnected',
      }
      toast(msgs[reason] || 'Partner left')

      setSearchMessage('Partner left. Finding a new match…')
      setSearching(true)
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(() => {
        if (roomIdRef.current) {
          socket.emit('join-random')
        }
      }, AUTO_SEARCH_DELAY)
    })

    socket.on('auto-search-scheduled', ({ delay }) => {
      setSearching(true)
      setSearchMessage('Finding a new partner…')
    })

    socket.on('auto-search-cancelled', () => {
      cancelSearchTimer()
    })

    socket.on('left-chat-confirmed', () => {
      goLobby()
    })

    socket.on('skip-confirmed', () => {
      // FIX #4: Reset remote video on skip
      setRemoteVideoOn(false)
      setSearching(true)
      setSearchMessage('Skipping… finding next person')
    })

    socket.on('share-id-request', ({ fromId, fromName }) => {
      setShareModal({ fromId, fromName })
    })

    socket.on('share-id-reveal', ({ oreyId, userName }) => {
      setShareModal(null)
      setRevealModal({ oreyId, userName })
      toast(`Now connected with ${userName || 'partner'}!`)
    })

    socket.on('share-id-declined', () => toast('They declined to share IDs'))
    socket.on('orey-id-not-found', () => setLobStatus({ msg: 'ID not found or offline', color: 'var(--red)' }))
    socket.on('orey-id-invalid', () => setLobStatus({ msg: 'Invalid Orey-ID', color: 'var(--red)' }))
    socket.on('orey-id-expired', () => setLobStatus({ msg: 'Orey-ID expired', color: 'var(--red)' }))

    return () => socket.removeAllListeners()
  }, []) // eslint-disable-line

  // ── User actions ───────────────────────────────────────────────────────────
  const handleJoinRandom = useCallback((name) => {
    userNameRef.current = name
    socket.emit('register-orey-id', { oreyId: myIdRef.current, userName: name })
    socket.emit('join-random')
    setWaiting(true)
    setLobStatus(null)
  }, [])

  const handleCancelRandom = useCallback(() => {
    socket.emit('cancel-random')
    setWaiting(false)
  }, [])

  const handleConnectById = useCallback(async (targetId, name) => {
    if (!targetId) return
    userNameRef.current = name
    socket.emit('register-orey-id', { oreyId: myIdRef.current, userName: name })
    await startLocal()
    setScreen('call')
    socket.emit('connect-by-orey-id', { targetOreyId: targetId })
    setLobStatus(null)
  }, [startLocal])

  const handleToggleMic = useCallback(() => {
    setAudioOn(prev => {
      const next = !prev
      localStreamRef.current?.getAudioTracks().forEach(t => (t.enabled = next))
      return next
    })
  }, [localStreamRef])

  const handleToggleCam = useCallback(() => {
    setVideoOn(prev => {
      const next = !prev
      localStreamRef.current?.getVideoTracks().forEach(t => (t.enabled = next))
      socket.emit('media-state', { roomId: roomIdRef.current, audioEnabled: audioOn, videoEnabled: next })
      return next
    })
  }, [localStreamRef, audioOn])

  const handleSkip = useCallback(() => {
    closePC()
    setRemoteVideoOn(false)
    socket.emit('skip', { roomId: roomIdRef.current })
  }, [closePC])

  const handleLeave = useCallback(() => {
    cancelSearchTimer()
    socket.emit('leave-chat', { roomId: roomIdRef.current })
  }, [cancelSearchTimer])

  const handleCancelSearch = useCallback(() => {
    cancelSearchTimer()
    socket.emit('cancel-auto-search')
    socket.emit('cancel-random')
  }, [cancelSearchTimer])

  const handleShareId = useCallback(() => {
    socket.emit('share-id-request', { roomId: roomIdRef.current })
    toast('Request sent')
  }, [toast])

  const handleAcceptShare = useCallback(() => {
    socket.emit('share-id-accept', { roomId: roomIdRef.current, targetId: shareModal.fromId })
    setShareModal(null)
  }, [shareModal])

  const handleDeclineShare = useCallback(() => {
    socket.emit('share-id-decline', { roomId: roomIdRef.current })
    setShareModal(null)
  }, [])

  const handleCopyRevealed = useCallback(() => {
    navigator.clipboard.writeText(revealModal?.oreyId || '')
    toast('Copied!')
  }, [revealModal, toast])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {screen === 'lobby' && (
        <Lobby
          myId={myId}
          waiting={waiting}
          status={lobStatus}
          onJoinRandom={handleJoinRandom}
          onCancelRandom={handleCancelRandom}
          onConnectById={handleConnectById}
        />
      )}

      {screen === 'call' && (
        <CallScreen
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          peerName={peerName}
          remoteVideoOn={remoteVideoOn}
          audioOn={audioOn}
          videoOn={videoOn}
          onToggleMic={handleToggleMic}
          onToggleCam={handleToggleCam}
          onShareId={handleShareId}
          onSkip={handleSkip}
          onLeave={handleLeave}
          searching={searching}
          searchDelay={AUTO_SEARCH_DELAY}
          searchMessage={searchMessage}
          onCancelSearch={handleCancelSearch}
        />
      )}

      {shareModal && (
        <ShareRequestModal
          fromName={shareModal.fromName}
          onAccept={handleAcceptShare}
          onDecline={handleDeclineShare}
        />
      )}

      {revealModal && (
        <RevealModal
          partnerOreyId={revealModal.oreyId}
          partnerName={revealModal.userName}
          onCopy={handleCopyRevealed}
          onClose={() => setRevealModal(null)}
        />
      )}

      <Toast ref={toastRef} />
    </>
  )
}
