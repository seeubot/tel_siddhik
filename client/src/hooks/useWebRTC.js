import { useRef, useCallback } from 'react'
import { socket, ICE } from '../lib/socket'

export function useWebRTC({ localVideoRef, remoteVideoRef, onRemoteStream, onCallTimer }) {
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)

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

  const makePC = useCallback((targetId) => {
    // FIX #2 & #3: Close any existing PC before creating a new one
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    const pc = new RTCPeerConnection(ICE)

    // FIX #2: Guard — only add tracks if localStream is actually populated
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

    // FIX #3: If remote ref isn't mounted yet, retry once it becomes available
    pc.ontrack = ({ streams }) => {
      const attach = () => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = streams[0]
          onRemoteStream?.()
          onCallTimer?.()
        } else {
          // Ref not mounted yet — retry on next frame
          requestAnimationFrame(attach)
        }
      }
      attach()
    }

    pcRef.current = pc
    return pc
  }, [remoteVideoRef, onRemoteStream, onCallTimer])

  const makeOffer = useCallback(async (targetId) => {
    const pc = makePC(targetId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit('offer', { targetId, offer })
  }, [makePC])

  const handleOffer = useCallback(async (offer, fromId) => {
    const pc = makePC(fromId)
    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket.emit('answer', { targetId: fromId, answer })
  }, [makePC])

  const handleAnswer = useCallback(async (answer) => {
    await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer))
  }, [])

  const handleIce = useCallback(async (candidate) => {
    if (pcRef.current) await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
  }, [])

  const closePC = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject?.getTracks().forEach(t => t.stop())
      remoteVideoRef.current.srcObject = null
    }
  }, [remoteVideoRef])

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
