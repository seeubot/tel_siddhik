import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  SkipForward,
  PhoneOff,
  Share2
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * CallScreen Component
 * Handles the video interaction interface with integrated searching overlay.
 *
 * FIX 1: attachStream() calls video.play() after setting srcObject.
 *         Some browsers (Safari, Chrome on mobile) won't autoplay without
 *         an explicit play() call even with the `autoPlay` attribute.
 *
 * FIX 2: Ref callbacks are used for local/remote video elements.
 *         The callback fires immediately when the DOM node mounts, so
 *         srcObject is set even if the stream arrived before the element
 *         rendered — no ResizeObserver / readyState guard needed.
 *
 * FIX 3: A separate useEffect re-runs whenever localStream / remoteStream
 *         changes (e.g. after camera toggle or renegotiation), so the
 *         video never goes blank.
 */
export default function CallScreen({
  localStream,
  remoteStream,
  peerName = "Syncing...",
  audioOn = true,
  videoOn = true,
  onToggleMic = () => {},
  onToggleCam = () => {},
  onShareId = () => {},
  onSkip = () => {},
  onLeave = () => {},
  searching = false,
  searchDelay = 3,
  onCancelSearch = () => {},
  searchMessage = "Finding your next vibe...",
}) {
  // Keep refs so we can call attachStream from both the ref callback and useEffect
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const [countdown, setCountdown] = useState(null);

  /**
   * Attach a MediaStream to a <video> element safely.
   * - Guards against a null element or stream.
   * - Calls .play() and swallows the AbortError that fires when the element
   *   is unmounted mid-play (common in strict-mode double-invoke).
   */
  const attachStream = useCallback((videoEl, stream) => {
    if (!videoEl || !stream) return;
    if (videoEl.srcObject === stream) return; // already attached, skip
    videoEl.srcObject = stream;
    videoEl.play().catch((err) => {
      if (err.name !== 'AbortError') {
        console.warn('[CallScreen] video.play() failed:', err.name, err.message);
      }
    });
  }, []);

  // FIX 2: Ref callbacks — fire immediately on mount so we never miss an
  //         already-available stream. Also stored in refs for useEffect below.
  const localRefCallback = useCallback(
    (el) => {
      localVideoRef.current = el;
      attachStream(el, localStream);
    },
    [localStream, attachStream]
  );

  const remoteRefCallback = useCallback(
    (el) => {
      remoteVideoRef.current = el;
      attachStream(el, remoteStream);
    },
    [remoteStream, attachStream]
  );

  // FIX 3: Re-attach whenever streams change (camera toggle, renegotiation, etc.)
  useEffect(() => {
    attachStream(localVideoRef.current, localStream);
  }, [localStream, attachStream]);

  useEffect(() => {
    attachStream(remoteVideoRef.current, remoteStream);
  }, [remoteStream, attachStream]);

  // Countdown logic for the search overlay
  useEffect(() => {
    if (!searching) {
      setCountdown(null);
      return;
    }
    setCountdown(searchDelay);
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [searching, searchDelay]);

  return (
    <div className={styles.stage}>
      {/* Remote Participant Card */}
      <div className={styles.card}>
        <video
          ref={remoteRefCallback}
          autoPlay
          playsInline
          className={styles.videoElement}
        />

        {!remoteStream && (
          <div className={styles.placeholder}>
            <div className={styles.avatarCircle}>
              <div className={styles.avatar}>{peerName[0]}</div>
            </div>
          </div>
        )}

        <div className={styles.badge}>{peerName}</div>

        {!videoOn && (
          <div className={styles.statusIcon}>
            <VideoOff size={20} />
          </div>
        )}
      </div>

      {/* Local Participant Card */}
      {/* FIX 4: localPlaceholderCard class is now defined in the CSS */}
      <div className={`${styles.card} ${!videoOn ? styles.localPlaceholderCard : ''}`}>
        <video
          ref={localRefCallback}
          autoPlay
          muted
          playsInline
          className={`${styles.videoElement} ${styles.localVideo}`}
        />

        <div className={styles.badge}>You</div>

        {!videoOn && (
          <div className={`${styles.placeholder} ${styles.localPlaceholder}`}>
            <div className={styles.avatarCircle}>
              <div className={styles.avatar}>Y</div>
            </div>
          </div>
        )}

        {!audioOn && (
          <div className={styles.statusIcon}>
            <MicOff size={20} />
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className={styles.controls}>
        <button
          onClick={onToggleCam}
          className={`${styles.btn} ${videoOn ? styles.btnDark : styles.btnLight}`}
        >
          {videoOn ? <Video size={22} /> : <VideoOff size={22} />}
        </button>

        <button
          onClick={onToggleMic}
          className={`${styles.btn} ${audioOn ? styles.btnDark : styles.btnLight}`}
        >
          {audioOn ? <Mic size={22} /> : <MicOff size={22} />}
        </button>

        <button
          onClick={onLeave}
          className={`${styles.btn} ${styles.btnEnd}`}
        >
          <PhoneOff size={28} />
        </button>

        <button
          onClick={onShareId}
          className={`${styles.btn} ${styles.btnDark}`}
        >
          <Share2 size={22} />
        </button>

        <button
          onClick={onSkip}
          className={`${styles.btn} ${styles.btnNext}`}
        >
          <SkipForward size={22} />
        </button>
      </div>

      {/* Auto-Search Overlay */}
      {searching && (
        <div className={styles.searchOverlay}>
          <div className={styles.spinnerContainer}>
            <div className={styles.spinner} />
            <div className={styles.countdownText}>{countdown}</div>
          </div>

          {/* FIX 5: Replaced undefined styles.textCenter with inline style */}
          <div className={styles.searchTextBlock}>
            <h2 className={styles.searchTitle}>{searchMessage}</h2>
            <p className={styles.searchSubtitle}>
              CALIBRATING NEURAL MESH...
            </p>
          </div>

          <button className={styles.btnCancel} onClick={onCancelSearch}>
            Cancel Search
          </button>
        </div>
      )}
    </div>
  );
}
