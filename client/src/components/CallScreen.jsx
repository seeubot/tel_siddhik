import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, SkipForward,
  Heart, Copy, Check, Users, MicOff as MicOffIcon
} from 'lucide-react';
import styles from './CallScreen.module.css';

const transparentGif =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/* ─────────────────────────────────────────────────
   Stream attachment helpers
───────────────────────────────────────────────── */
function attachStream(videoEl, stream, onReady) {
  if (!videoEl) return;
  videoEl.srcObject = null;
  videoEl.load();
  videoEl.srcObject = stream;

  const play = () => {
    videoEl.play()
      .then(() => onReady?.())
      .catch(() => setTimeout(() => videoEl.play().catch(() => {}), 500));
  };

  if (videoEl.readyState >= 3) {
    play();
  } else {
    const handler = () => {
      videoEl.removeEventListener('canplay', handler);
      play();
    };
    videoEl.addEventListener('canplay', handler);
  }
}

/* ─────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────── */
const CallScreen = ({
  partner         = null,
  localVideoRef,
  remoteVideoRef,
  audioEnabled    = true,
  videoEnabled    = true,
  partnerMedia    = { video: true, audio: true },
  localStream     = null,
  partnerStream   = null,
  searching       = false,
  autoSearchCountdown = null,
  onToggleAudio   = () => {},
  onToggleVideo   = () => {},
  onSkip          = () => {},
  onLeave         = () => {},
  onCancelAutoSearch = () => {},
  userOreyId      = null,
}) => {
  const [uiVisible,        setUiVisible]        = useState(true);
  const [copiedOreyId,     setCopiedOreyId]     = useState(false);
  const [showOreyIdModal,  setShowOreyIdModal]  = useState(false);

  const hideTimerRef       = useRef(null);
  const localStreamRef     = useRef(localStream);
  const partnerStreamRef   = useRef(partnerStream);

  const isRemoteConnected  = !!partner;
  const isPartnerVideoOff  = partner && !partnerMedia?.video;
  const isPartnerMuted     = partner && !partnerMedia?.audio;

  /* ── Attach local stream ── */
  useEffect(() => {
    localStreamRef.current = localStream;
    if (localStream) attachStream(localVideoRef.current, localStream);
  }, [localStream]);

  /* ── Re-attach when video is toggled back on ── */
  useEffect(() => {
    if (videoEnabled && localStream) {
      attachStream(localVideoRef.current, localStream);
    }
  }, [videoEnabled]);

  /* ── Attach partner stream ── */
  useEffect(() => {
    partnerStreamRef.current = partnerStream;
    if (partnerStream) {
      attachStream(remoteVideoRef.current, partnerStream);
    }
  }, [partnerStream]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      clearTimeout(hideTimerRef.current);
      if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    };
  }, []);

  /* ── Auto-hide UI ── */
  useEffect(() => {
    const reset = () => {
      setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    };
    const events = ['mousemove', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches('input,textarea,[contenteditable]')) return;
      if (e.key === 'm') { e.preventDefault(); onToggleAudio(); }
      if (e.key === 'v') { e.preventDefault(); onToggleVideo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggleAudio, onToggleVideo]);

  /* ── Swipe-to-skip (remote video) ── */
  const dragX      = useMotionValue(0);
  const cardRot    = useTransform(dragX, [-280, 0, 280], [-12, 0, 12]);
  const cardOpac   = useTransform(dragX, [-280, -100, 0, 100, 280], [0.5, 0.95, 1, 0.95, 0.5]);
  const skipW      = typeof window !== 'undefined' ? window.innerWidth * 0.28 : 120;

  const handleDragEnd = useCallback((_, info) => {
    if (Math.abs(info.offset.x) > skipW) {
      dragX.set(info.offset.x > 0 ? 900 : -900);
      setTimeout(() => { onSkip(); dragX.set(0); }, 180);
    } else {
      dragX.set(0);
    }
  }, [onSkip, skipW]);

  /* ── Orey ID copy ── */
  const copyOreyId = () => {
    if (!userOreyId) return;
    navigator.clipboard.writeText(userOreyId);
    setCopiedOreyId(true);
    setTimeout(() => setCopiedOreyId(false), 2000);
  };

  /* ── Poster (no remote) ── */
  const Poster = () => (
    <div className={styles.posterContainer}>
      <span className={styles.oreyMark}>Orey!</span>
    </div>
  );

  return (
    <div className={styles.container}>

      {/* ══════════════ REMOTE VIEW (top 60%) ══════════════ */}
      <div className={styles.remoteView}>

        {/* Top bar */}
        <AnimatePresence>
          {uiVisible && (
            <motion.div
              className={styles.topBar}
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0,   opacity: 1 }}
              exit={{   y: -50, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <button
                className={styles.brandPill}
                onClick={() => userOreyId && setShowOreyIdModal(true)}
                style={{ cursor: userOreyId ? 'pointer' : 'default' }}
              >
                <span className={styles.brandDot} />
                <span className={styles.brandName}>Orey!</span>
              </button>

              {isRemoteConnected && (
                <div className={styles.livePill}>
                  <span className={styles.liveDot} />
                  Live
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Content ── */}
        {searching || autoSearchCountdown !== null ? (

          /* Searching / countdown */
          <div className={styles.searchingOverlay}>
            {autoSearchCountdown !== null ? (
              <div className={styles.countdownContent}>
                <motion.div
                  key={autoSearchCountdown}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1,   opacity: 1 }}
                  className={styles.countdownNumber}
                >
                  {autoSearchCountdown}
                </motion.div>
                <button onClick={onCancelAutoSearch} className={styles.cancelBtn}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className={styles.searchingAnimation}>
                <div className={styles.wave} />
                <div className={styles.wave} />
                <div className={styles.wave} />
                <Users className={styles.searchingIcon} size={26} />
              </div>
            )}
          </div>

        ) : isRemoteConnected && !isPartnerVideoOff ? (

          /* Partner video with swipe-to-skip */
          <motion.div
            className={styles.dragContainer}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.85}
            style={{ x: dragX, rotate: cardRot, opacity: cardOpac }}
            onDragEnd={handleDragEnd}
          >
            <video
              ref={remoteVideoRef}
              className={styles.video}
              autoPlay
              playsInline
              poster={transparentGif}
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
            />

            {/* Partner muted hint */}
            {isPartnerMuted && (
              <div className={styles.partnerStatus}>
                <MicOff size={11} />
                <span>Muted</span>
              </div>
            )}
          </motion.div>

        ) : (
          /* No partner / camera off poster */
          <Poster />
        )}

        {/* Partner camera off notice */}
        {isRemoteConnected && isPartnerVideoOff && (
          <div className={styles.partnerStatus}>
            <VideoOff size={11} />
            <span>Camera off</span>
          </div>
        )}
      </div>

      {/* ══════════════ LOCAL VIEW (bottom 40%) ══════════════ */}
      <div className={styles.localView}>

        {/* Local video */}
        <video
          ref={localVideoRef}
          className={styles.localVideo}
          autoPlay
          muted
          playsInline
          poster={transparentGif}
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          style={{
            visibility: videoEnabled && localStream ? 'visible' : 'hidden',
          }}
        />

        {/* Poster when camera off */}
        {(!videoEnabled || !localStream) && <Poster />}

        {/* ──────────────────────────────────────────
            iOS STYLE CONTROL BAR
        ────────────────────────────────────────── */}
        <AnimatePresence>
          {uiVisible && (
            <motion.div
              className={styles.controlBarWrapper}
              initial={{ y: 90, opacity: 0 }}
              animate={{ y: 0,  opacity: 1 }}
              exit={{   y: 90, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <div className={styles.controlBar}>

                {/* Mic */}
                <ControlBtn
                  onClick={onToggleAudio}
                  active={audioEnabled}
                  label={audioEnabled ? 'Mute' : 'Unmute'}
                >
                  {audioEnabled ? <Mic size={21} /> : <MicOff size={21} />}
                </ControlBtn>

                {/* Camera */}
                <ControlBtn
                  onClick={onToggleVideo}
                  active={videoEnabled}
                  label={videoEnabled ? 'Camera off' : 'Camera on'}
                >
                  {videoEnabled ? <Video size={21} /> : <VideoOff size={21} />}
                </ControlBtn>

                {/* Skip */}
                <button
                  onClick={onSkip}
                  className={`${styles.controlBtn} ${styles.controlBtnSkip}`}
                  aria-label="Skip"
                >
                  <SkipForward size={21} />
                </button>

                {/* Divider */}
                <div className={styles.controlDivider} />

                {/* End call */}
                <button
                  onClick={onLeave}
                  className={styles.endBtn}
                  aria-label="End call"
                >
                  <PhoneOff size={22} />
                </button>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ══════════════ OREY ID MODAL ══════════════ */}
      <AnimatePresence>
        {showOreyIdModal && (
          <motion.div
            className={styles.modalBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowOreyIdModal(false)}
          >
            <motion.div
              className={styles.modal}
              initial={{ scale: 0.88, y: 24, opacity: 0 }}
              animate={{ scale: 1,    y: 0,  opacity: 1 }}
              exit={{   scale: 0.88, y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.modalIcon}>
                <Heart size={22} />
              </div>
              <h3>Your Orey ID</h3>
              <p>Share this with friends to connect instantly</p>

              <div className={styles.oreyIdBox}>
                <code>{userOreyId || 'Not registered'}</code>
                {userOreyId && (
                  <button onClick={copyOreyId} className={styles.copyBtn}>
                    {copiedOreyId ? <Check size={14} /> : <Copy size={14} />}
                    {copiedOreyId ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowOreyIdModal(false)}
                className={styles.closeModalBtn}
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ── Small helper: standard control button ── */
const ControlBtn = ({ onClick, active, label, children }) => (
  <button
    onClick={onClick}
    className={`${styles.controlBtn} ${active ? styles.controlBtnOn : styles.controlBtnOff}`}
    aria-label={label}
  >
    {children}
  </button>
);

export default CallScreen;
