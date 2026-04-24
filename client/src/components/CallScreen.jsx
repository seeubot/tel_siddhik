
import React, { useRef, useEffect, useState } from 'react'
import styles from './CallScreen.module.css'
import { Mic, MicOff, Video, VideoOff, UserPlus, SkipForward, X, Timer } from 'lucide-react'

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
  searching,
  searchDelay,
  onCancelSearch,
  searchMessage,
}) {
  const [timer, setTimer] = useState('00:00')
  const timerRef = useRef(null)
  const t0Ref = useRef(null)

  useEffect(() => {
    if (remoteVideoOn && !searching) {
      if (!t0Ref.current) {
        t0Ref.current = Date.now()
        timerRef.current = setInterval(() => {
          const s = Math.floor((Date.now() - t0Ref.current) / 1000)
          setTimer(
            `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
          )
        }, 1000)
      }
    } else {
      clearInterval(timerRef.current)
      timerRef.current = null
      t0Ref.current = null
      setTimer('00:00')
    }
    return () => clearInterval(timerRef.current)
  }, [remoteVideoOn, searching])

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

  return (
    <div className={styles.stage}>
      {/* Remote Video Canvas */}
      <div className={styles.remoteWrapper}>
        <video ref={remoteVideoRef} autoPlay playsInline className={styles.remoteVideo} />
        {!remoteVideoOn && (
          <div className={styles.fallbackOverlay}>
            <div className={styles.avatarCircle}>{initials}</div>
            <p className={styles.fallbackText}>Connecting with {peerName || 'someone'}...</p>
          </div>
        )}
      </div>

      {/* Top Navigation Overlay */}
      <div className={styles.topHud}>
        <div className={styles.hudPill}>
          <div className={styles.statusDot} />
          <span className={styles.timerText}>{timer}</span>
        </div>
        
        <div className={styles.peerBadge}>
          <span className={styles.peerName}>{peerName || 'Searching...'}</span>
        </div>

        <button className={styles.exitBtn} onClick={onLeave}>
          <X size={20} />
        </button>
      </div>

      {/* Picture in Picture Local Preview */}
      <div className={styles.pipWindow}>
        <video ref={localVideoRef} autoPlay muted playsInline className={styles.localVideo} />
        {!videoOn && <div className={styles.pipOff}><VideoOff size={16} /></div>}
      </div>

      {/* Interaction Bar */}
      <div className={styles.bottomHud}>
        <div className={styles.controlsPill}>
          <button 
            className={`${styles.iconBtn} ${!audioOn ? styles.iconBtnOff : ''}`} 
            onClick={onToggleMic}
          >
            {audioOn ? <Mic size={22} /> : <MicOff size={22} />}
          </button>

          <button 
            className={`${styles.iconBtn} ${!videoOn ? styles.iconBtnOff : ''}`} 
            onClick={onToggleCam}
          >
            {videoOn ? <Video size={22} /> : <VideoOff size={22} />}
          </button>

          <button className={styles.iconBtn} onClick={onShareId}>
            <UserPlus size={22} />
          </button>

          <div className={styles.separator} />

          <button className={styles.skipBtn} onClick={onSkip}>
            <SkipForward size={24} fill="currentColor" />
            <span className={styles.skipLabel}>NEXT</span>
          </button>
        </div>
      </div>

      {/* Auto-Search Blocking Overlay */}
      {searching && (
        <div className={styles.searchModal}>
          <div className={styles.searchGlow} />
          <div className={styles.spinner} />
          <h2 className={styles.searchTitle}>{searchMessage || 'Finding your next vibe...'}</h2>
          {countdown !== null && (
            <p className={styles.searchCountdown}>Next match in {countdown}s</p>
          )}
          <button className={styles.cancelSearch} onClick={onCancelSearch}>
            Stop Searching
          </button>
        </div>
      )}
    </div>
  )
}

