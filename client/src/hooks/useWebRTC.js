import { useRef, useCallback } from 'react'
import { socket, ICE } from '../lib/socket'

export function useWebRTC({ localVideoRef, remoteVideoRef, onRemoteStream, onCallTimer }) {
  const pcRef              = useRef(null)
  const localStreamRef     = useRef(null)

  // FIX 2: Queue ICE candidates that arrive before setRemoteDescription completes.
  // addIceCandidate throws InvalidStateError if called before a remote description
  // is set. We drain this queue at the end of handleOffer / handleAnswer.
  const iceCandidateQueue  = useRef([])

  // FIX 1: Track the rAF handle so we can cancel it on unmount / PC close.
  const attachRafRef       = useRef(null)

  const startLocal = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    return stream
  }, [localVideoRef])

  const stopLocal = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
  }, [localVideoRef])

  // FIX 1: Cancel any in-flight rAF attach loop before creating a new PC.
  const cancelAttachLoop = useCallback(() => {
    if (attachRafRef.current !== null) {
      cancelAnimationFrame(attachRafRef.current)
      attachRafRef.current = null
    }
  }, [])

  const makePC = useCallback((targetId) => {
    // Cancel any pending remote-video attach loop from the previous call
    cancelAttachLoop()

    // Close any existing PC before creating a new one
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    // Clear the ICE queue for the new peer connection
    iceCandidateQueue.current = []

    const pc = new RTCPeerConnection(ICE)

    // Guard — only add tracks if localStream is actually populated
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t =>
        pc.addTrack(t, localStreamRef.current)
      )
    } else {
      console.warn('[useWebRTC] makePC called before localStream was ready — no tracks added')
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('ice-candidate', { targetId, candidate })
    }

    // FIX 1: Store the rAF handle so we can cancel it if the component
    // unmounts or the PC is replaced while the loop is still running.
    pc.ontrack = ({ streams }) => {
      const attach = () => {
        if (remoteVideoRef.current) {
          attachRafRef.current = null
          remoteVideoRef.current.srcObject = streams[0]
          onRemoteStream?.()
          onCallTimer?.()
        } else {
          // Ref not mounted yet — retry on next frame
          attachRafRef.current = requestAnimationFrame(attach)
        }
      }
      attach()
    }

    pcRef.current = pc
    return pc
  }, [remoteVideoRef, onRemoteStream, onCallTimer, cancelAttachLoop])

  // FIX 2: Drain the ICE candidate queue once a remote description is set.
  const drainIceQueue = useCallback(async () => {
    const pc = pcRef.current
    if (!pc) return
    for (const candidate of iceCandidateQueue.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.warn('[useWebRTC] queued addIceCandidate failed:', err)
      }
    }
    iceCandidateQueue.current = []
  }, [])

  const makeOffer = useCallback(async (targetId) => {
    const pc = makePC(targetId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit('offer', { targetId, offer })
  }, [makePC])

  const handleOffer = useCallback(async (offer, fromId) => {
    const pc = makePC(fromId)
    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    // FIX 2: Remote description is now set — safe to drain queued candidates
    await drainIceQueue()
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket.emit('answer', { targetId: fromId, answer })
  }, [makePC, drainIceQueue])

  const handleAnswer = useCallback(async (answer) => {
    await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer))
    // FIX 2: Remote description is now set — safe to drain queued candidates
    await drainIceQueue()
  }, [drainIceQueue])

  // FIX 2: Queue candidates that arrive before the remote description is ready.
  const handleIce = useCallback(async (candidate) => {
    const pc = pcRef.current
    if (!pc) return

    const hasRemote = pc.remoteDescription && pc.remoteDescription.type
    if (!hasRemote) {
      // Remote description not set yet — hold it for drainIceQueue
      iceCandidateQueue.current.push(candidate)
      return
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (err) {
      console.warn('[useWebRTC] addIceCandidate failed:', err)
    }
  }, [])

  // FIX 1 + FIX 4: Cancel rAF loop, then close PC.
  // Do NOT call t.stop() on remote tracks — we don't own them and stopping
  // them permanently kills the MediaStreamTrack on the remote side's stream
  // object. Just detach by setting srcObject = null.
  const closePC = useCallback(() => {
    cancelAttachLoop()
    pcRef.current?.close()
    pcRef.current = null
    iceCandidateQueue.current = []
    if (remoteVideoRef.current) {
      // FIX 4: Detach only — do not stop tracks we don't own
      remoteVideoRef.current.srcObject = null
    }
  }, [remoteVideoRef, cancelAttachLoop])

  return {
    localStreamRef,
    startLocal,
    stopLocal,
    makeOffer,
    handleOffer,
    handleAnswer,
    handleIce,
    closePC,
  }
}
