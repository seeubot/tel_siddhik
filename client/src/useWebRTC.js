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
    const pc = new RTCPeerConnection(ICE)
    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current))

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('ice-candidate', { targetId, candidate })
    }

    pc.ontrack = ({ streams }) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = streams[0]
      onRemoteStream?.()
      onCallTimer?.()
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
