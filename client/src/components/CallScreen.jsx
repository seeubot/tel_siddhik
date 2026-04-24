import { useRef, useEffect, useState } from 'react'
import styles from './CallScreen.module.css'

export default function CallScreen({
  localVideoRef,
  remoteVideoRef,
  peerName,
  remoteVideoOn,
  audioOn,
  videoOn,
  onToggleMic,
  onToggleCam,
  onShareId,
  onSkip,
  onLeave,
  searching,       // auto-search countdown active
  searchDelay,     // ms for countdown
  onCancelSearch,
  searchMessage,
}) {
  const [timer, setTimer] = useState('00:00')
  const timerRef = useRef(null)
  const t0Ref = useRef(null)

  // Start timer when remote video appears
  useEffect(() => {
    if (!remoteVideoOn && !searching) {
      if (!t0Ref.current) {
        t0Ref.current = Date.now()
        timerRef.current = setInterval(() => {
          const s = Math.floor((Date.now() - t0Ref.current) / 1000)
          setTimer(
            `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
          )
        }, 1000)
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [remoteVideoOn, searching])

  // Reset timer on new connection
  useEffect(() => {
    clearInterval(timerRef.current)
    timerRef.current = null
    t0Ref.current = null
    setTimer('00:00')
  }, [peerName])

  // Countdown state for auto-search
  const [countdown, setCountdown] = useState(null)
  useEffect(() => {
    if (!searching || !searchDelay) { setCountdown(null); return }
    const end = Date.now() + searchDelay
    const iv = setInterval(() => {
      const left = Math.ceil((end - Date.now()) / 1000)
      setCountdown(left > 0 ? left : 0)
    }, 200)
    return () => clearInterval(iv)
  }, [searching, searchDelay])

  const initials = (peerName || '?')[0].toUpperCase()

  // Icons (inline SVGs)
  const MicIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      {!audioOn && (
        <line x1="4" y1="4" x2="20" y2="20" strokeWidth="2.5" />
      )}
    </svg>
  )

  const CameraIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 10v2m-3-3v6" strokeLinecap="round" />
    </svg>
  )

  const ShareIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16,6 12,2 8,6" />
      <line x1="12" y1="22" x2="12" y2="11" />
    </svg>
  )

  const SkipIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" strokeWidth="2" fill="none" />
    </svg>
  )

  const EndCallIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M21 16.4V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h3.5" />
      <path d="M16.5 12.5L18 11M18 11L16.5 9.5M18 11H21" />
    </svg>
  )

  return (
    <div className={styles.call}>
      {/* Remote video */}
      <div className={styles.remoteStage}>
        <video ref={remoteVideoRef} autoPlay playsInline className={styles.remoteVideo} />
        <div className={`${styles.remoteOff} ${remoteVideoOn === false ? styles.on : ''}`}>
          <div className={styles.bigAv}>{initials}</div>
          <p style={{ opacity: 0.6 }}>Waiting for video…</p>
        </div>
      </div>

      {/* Top bar */}
      <div className={styles.topbar}>
        <div className={styles.pill} onClick={onLeave} style={{ cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Leave</span>
        </div>
        <div className={styles.pill}>
          <div style={{ width: 6, height: 6, background: 'var(--green)', borderRadius: '50%' }} />
          <span style={{ fontFamily: 'var(--font-m)', fontSize: '0.8rem' }}>{timer}</span>
        </div>
        <div className={styles.pill}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{peerName || '—'}</span>
        </div>
      </div>

      {/* PiP local video */}
      <div className={styles.pip}>
        <video ref={localVideoRef} autoPlay muted playsInline className={styles.localVideo} />
      </div>

      {/* Control bar */}
      <div className={styles.ctrlBar}>
        <div className={styles.ctrlPill}>
          {/* Left group: Mic, Camera */}
          <button className={`${styles.cBtn} ${!audioOn ? styles.off : ''}`} onClick={onToggleMic} title="Microphone">
            <MicIcon />
          </button>

          <button className={`${styles.cBtn} ${!videoOn ? styles.off : ''}`} onClick={onToggleCam} title="Camera">
            <CameraIcon />
          </button>

          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

          {/* Right group: Share, Skip */}
          <button className={styles.cBtn} onClick={onShareId} title="Share Orey-ID">
            <ShareIcon />
          </button>

          <button className={`${styles.cBtn} ${styles.skipBtn}`} onClick={onSkip} title="Skip to next person">
            <SkipIcon />
          </button>

          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

          {/* End call */}
          <button className={`${styles.cEnd}`} onClick={onLeave}>
            <EndCallIcon />
          </button>
        </div>
      </div>

      {/* Auto-search overlay */}
      {searching && (
        <div className={styles.searchOverlay}>
          <div className={styles.spinner} />
          <h3 className={styles.searchMsg}>{searchMessage || 'Finding a new partner…'}</h3>
          {countdown !== null && (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Auto-connecting in {countdown}s
            </p>
          )}
          <button className={styles.cancelSearchBtn} onClick={onCancelSearch}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
