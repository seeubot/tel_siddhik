import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Video, VideoOff, PhoneOff, SkipForward, Copy, Check, Heart } from 'lucide-react';
import styles from './CallScreen.module.css';

const CallScreen = ({
  partner = null,
  localVideoRef,
  remoteVideoRef,
  audioEnabled = true,
  videoEnabled = true,
  partnerMedia = { video: true, audio: true },
  localStream = null,
  partnerStream = null,
  searching = false,
  autoSearchCountdown = null,
  onToggleAudio = () => {},
  onToggleVideo = () => {},
  onSkip = () => {},
  onLeave = () => {},
  onCancelAutoSearch = () => {},
  userOreyId = null,
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [copiedOreyId, setCopiedOreyId] = useState(false);
  const [showOreyIdModal, setShowOreyIdModal] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  
  const hideTimerRef = useRef(null);

  const isRemoteConnected = !!partner;
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  // Attach remote stream
  const attachRemoteStream = (stream) => {
    const video = remoteVideoRef.current;
    if (!video) return;
    video.srcObject = null;
    video.load();
    video.srcObject = stream;
    const handleCanPlay = () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.play().then(() => setRemoteVideoReady(true)).catch(() => {});
    };
    video.addEventListener('canplay', handleCanPlay);
    if (video.readyState >= 3) handleCanPlay();
  };

  // Attach local stream
  const attachLocalStream = (stream) => {
    const video = localVideoRef.current;
    if (!video) return;
    video.srcObject = null;
    video.load();
    video.srcObject = stream;
    video.play().catch(() => {});
  };

  useEffect(() => {
    if (localStream) attachLocalStream(localStream);
  }, [localStream]);

  useEffect(() => {
    if (videoEnabled && localStream) attachLocalStream(localStream);
  }, [videoEnabled]);

  useEffect(() => {
    if (partnerStream) {
      setRemoteVideoReady(false);
      attachRemoteStream(partnerStream);
    } else {
      setRemoteVideoReady(false);
    }
  }, [partnerStream]);

  useEffect(() => {
    return () => {
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Auto-hide controls after 4 seconds
  useEffect(() => {
    const resetTimer = () => {
      setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    };
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('click', resetTimer);
    resetTimer();
    return () => {
      window.removeEventListener('touchstart', resetTimer);
      window.removeEventListener('click', resetTimer);
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  const copyOreyIdToClipboard = () => {
    if (userOreyId) {
      navigator.clipboard.writeText(userOreyId);
      setCopiedOreyId(true);
      setTimeout(() => setCopiedOreyId(false), 2000);
    }
  };

  return (
    <div className={styles.container}>
      
      {/* TOP: REMOTE VIEW (60%) */}
      <div className={styles.remoteView}>
        
        {/* Orey ID Badge */}
        {userOreyId && (
          <button onClick={() => setShowOreyIdModal(true)} className={styles.idBadge}>
            <Heart size={12} />
            <span>{userOreyId}</span>
          </button>
        )}

        {searching || autoSearchCountdown !== null ? (
          <div className={styles.searchingOverlay}>
            {autoSearchCountdown !== null ? (
              <div className={styles.countdownContent}>
                <span className={styles.countdownNumber}>{autoSearchCountdown}</span>
                <p className={styles.countdownLabel}>Connecting...</p>
                <button onClick={onCancelAutoSearch} className={styles.cancelBtn}>Cancel</button>
              </div>
            ) : (
              <div className={styles.searchingContent}>
                <div className={styles.searchingRing} />
                <p className={styles.searchingTitle}>Finding your match</p>
                <p className={styles.searchingSubtitle}>Connecting you with someone amazing</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <video
              ref={remoteVideoRef}
              className={styles.video}
              autoPlay
              playsInline
              poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
              style={{ 
                visibility: isRemoteConnected && !isPartnerVideoOff ? 'visible' : 'hidden',
                position: 'absolute',
                inset: 0
              }}
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
            />

            {(!isRemoteConnected || isPartnerVideoOff) && (
              <div className={styles.brandOverlay}>
                <span className={styles.brandText}>Orey!</span>
              </div>
            )}

            {isRemoteConnected && isPartnerMuted && (
              <div className={styles.statusBadge}>
                <MicOff size={12} />
                <span>Muted</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* BOTTOM: LOCAL VIEW + CONTROLS (40%) */}
      <div className={styles.localView}>
        <video
          ref={localVideoRef}
          className={styles.localVideo}
          autoPlay
          muted
          playsInline
          poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          style={{ 
            visibility: videoEnabled ? 'visible' : 'hidden',
            position: 'absolute',
            inset: 0
          }}
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
        />

        {!videoEnabled && (
          <div className={styles.brandOverlay}>
            <span className={styles.brandText}>Orey!</span>
          </div>
        )}

        {/* iOS Style Control Bar */}
        <AnimatePresence>
          {uiVisible && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className={styles.controlBarWrapper}
            >
              <div className={styles.controlBar}>
                
                {/* Mic Button */}
                <button
                  onClick={onToggleAudio}
                  className={`${styles.controlBtn} ${!audioEnabled ? styles.controlBtnOff : ''}`}
                  aria-label={audioEnabled ? 'Mute' : 'Unmute'}
                >
                  {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                </button>

                {/* Video Button */}
                <button
                  onClick={onToggleVideo}
                  className={`${styles.controlBtn} ${!videoEnabled ? styles.controlBtnOff : ''}`}
                  aria-label={videoEnabled ? 'Camera off' : 'Camera on'}
                >
                  {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                </button>

                {/* Skip Button */}
                <button
                  onClick={onSkip}
                  className={styles.skipBtn}
                  aria-label="Skip"
                >
                  <SkipForward size={20} />
                </button>

                {/* End Call Button */}
                <button
                  onClick={onLeave}
                  className={styles.endBtn}
                  aria-label="End call"
                >
                  <PhoneOff size={24} />
                </button>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Orey ID Modal */}
      <AnimatePresence>
        {showOreyIdModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={styles.modalOverlay}
            onClick={() => setShowOreyIdModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className={styles.modal}
              onClick={e => e.stopPropagation()}
            >
              <Heart size={28} className={styles.modalHeart} />
              <h3>Your Orey ID</h3>
              <p>Share this ID to connect instantly</p>
              <div className={styles.idDisplay}>
                <code>{userOreyId}</code>
                <button onClick={copyOreyIdToClipboard} className={styles.copyBtn}>
                  {copiedOreyId ? <Check size={16} /> : <Copy size={16} />}
                  {copiedOreyId ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button onClick={() => setShowOreyIdModal(false)} className={styles.closeModalBtn}>
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CallScreen;
