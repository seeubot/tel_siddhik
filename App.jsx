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
  const [remoteVideoOn, setRemoteVideoOn] = useState(true)

  // ── Auto-search state ──────────────────────────────────────────────────────
  const [searching, setSearching] = useState(false)
  const [searchMessage, setSearchMessage] = useState('')
  const searchTimerRef = useRef(null)

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [shareModal, setShareModal] = useState(null) // { fromId, fromName }
  const [revealModal, setRevealModal] = useState(null) // { oreyId, userName }

  // ── Refs ───────────────────────────────────────────────────────────────────
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const roomIdRef = useRef(null)
  const peerIdRef = useRef(null)
  const toastRef = useRef(null)

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
    setRemoteVideoOn(true)
  }, [closePC, stopLocal, cancelSearchTimer])

  const goLobby = useCallback(() => {
    cleanupCall()
    setRoomId(null)
    setWaiting(false)
    setScreen('lobby')
  }, [cleanupCall])

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

      await startLocal()
      setScreen('call')

      if (autoMatched) toast('Connected with a new partner!', 2000)

      if (peers?.length) {
        const p = peers[0]
        setPeerId(p.socketId)
        peerIdRef.current = p.socketId
        updatePeer(p.userName)
        await makeOffer(p.socketId)
      }
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

    // Unified partner-left event (reason: 'left' | 'skipped' | 'disconnected')
    socket.on('partner-left', ({ userName, reason }) => {
      closePC()

      const msgs = {
        left: 'Partner left',
        skipped: 'Partner skipped',
        disconnected: 'Partner disconnected',
      }
      toast(msgs[reason] || 'Partner left')

      // Trigger auto-search for remaining user
      setSearchMessage('Partner left. Finding a new match…')
      setSearching(true)
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(() => {
        if (roomIdRef.current) {
          socket.emit('join-random')
        }
      }, AUTO_SEARCH_DELAY)
    })

    // Server-initiated auto-search (e.g. on disconnect)
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
