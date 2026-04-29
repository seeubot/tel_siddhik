import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, Loader,
  Flag, Shield, VolumeX, Heart, Sparkles,
  X, AlertTriangle, UserX, EyeOff, SkipForward
} from 'lucide-react';
import styles from './CallScreen.module.css';

const REPORT_REASONS = [
  { id: 'nudity', label: 'Nudity or sexual content', icon: <EyeOff size={15} /> },
  { id: 'harassment', label: 'Sexual harassment', icon: <AlertTriangle size={15} /> },
  { id: 'underage', label: 'Appears to be underage', icon: <UserX size={15} /> },
  { id: 'violence', label: 'Violence or threats', icon: <AlertTriangle size={15} /> },
  { id: 'inappropriate', label: 'Inappropriate behavior', icon: <AlertTriangle size={15} /> },
  { id: 'spam', label: 'Spam or fake profile', icon: <UserX size={15} /> },
];

const CallScreen = ({
  partner = null,
  localVideoRef,
  remoteVideoRef,
  audioEnabled = true,
  videoEnabled = true,
  partnerMedia = { video: true, audio: true },
  searching = false,
  autoSearchCountdown = null,
  onToggleAudio = () => {},
  onToggleVideo = () => {},
  onSkip = () => {},
  onLeave = () => {},
  onCancelAutoSearch = () => {},
  onFindRandomPeer = () => {},
  onReport = () => {},
}) => {
  const [uiVisible, setUiVisible] = useState(true);
  const [isSkipping, setIsSkipping] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const hideTimerRef = useRef(null);

  const isRemoteConnected = !!partner;
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  const handleScreenTap = useCallback(() => {
    setUiVisible(prev => !prev);
  }, []);

  useEffect(() => {
    if (!uiVisible) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    return () => clearTimeout(hideTimerRef.current);
  }, [uiVisible]);

  useEffect(() => {
    const resetTimer = () => {
      if (!uiVisible) setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    };
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('touchmove', resetTimer);
    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('touchmove', resetTimer);
      clearTimeout(hideTimerRef.current);
    };
  }, [uiVisible]);

  const handleSkip = () => {
    if (isSkipping) return;
    setIsSkipping(true);
    onFindRandomPeer?.();
    setTimeout(() => {
      setIsSkipping(false);
      onSkip?.();
    }, 2000);
  };

  const handleReportClick = () => {
    setShowReportModal(true);
    setReportSubmitted(false);
    setSelectedReason('');
    setReportDescription('');
  };

  const handleSubmitReport = () => {
    if (!selectedReason) return;
    const reason = REPORT_REASONS.find(r => r.id === selectedReason);
    onReport?.({ reason: reason?.label || selectedReason, description: reportDescription });
    setReportSubmitted(true);
    setTimeout(() => setShowReportModal(false), 2200);
  };

  return (
    <div className={styles.container} onClick={handleScreenTap}>
      {/* Background */}
      <div className={styles.gradientOrb1} />
      <div className={styles.gradientOrb2} />
      <div className={styles.noiseLayer} />

      {/* Floating ambient hearts */}
      <div className={styles.floatingElements}>
        <Heart className={styles.floatHeart1} size={16} />
        <Heart className={styles.floatHeart2} size={12} />
        <Sparkles className={styles.floatSparkle1} size={14} />
        <Sparkles className={styles.floatSparkle2} size={18} />
      </div>

      {/* REMOTE VIDEO */}
      <div className={styles.remoteView}>
        <video
          ref={remoteVideoRef}
          className={`${styles.videoBase} ${searching ? styles.searchingBlur : ''}`}
          autoPlay
          playsInline
          style={{ display: isRemoteConnected && !isPartnerVideoOff ? 'block' : 'none' }}
        />

        {isRemoteConnected && isPartnerVideoOff && (
          <div className={styles.partnerCameraOff}>
            <div className={styles.cameraOffIconWrapper}>
              <VideoOff size={40} className={styles.cameraOffIconLarge} />
            </div>
            <h3 className={styles.partnerCameraOffTitle}>Camera off</h3>
            <p className={styles.partnerCameraOffText}>Your match turned their camera off</p>
            <div className={styles.cameraOffStatus}>
              <span className={styles.statusDot} />
              Audio still connected
            </div>
          </div>
        )}

        {/* Partner muted chip */}
        {isRemoteConnected && isPartnerMuted && (
          <div className={`${styles.statusChip} ${styles.chipLeft}`}>
            <VolumeX size={13} />
            <span>Their mic is off</span>
          </div>
        )}

        {!isRemoteConnected && !searching && (
          <div className={styles.placeholder}>
            <div className={styles.logoWrapper}>
              <div className={styles.logoGlow} />
              <div className={styles.brandText}>Orey!</div>
            </div>
            <div className={styles.waitingText}>
              <Sparkles size={16} className={styles.sparkleIcon} />
              Ready to meet someone new?
            </div>
            <div className={styles.loadingDots}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        )}
      </div>

      {/* LOCAL VIDEO */}
      <div className={styles.localView}>
        <video
          ref={localVideoRef}
          className={`${styles.videoBase} ${styles.mirrored}`}
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />

        {/* You muted chip */}
        {!audioEnabled && (
          <div className={`${styles.statusChip} ${styles.chipRight}`}>
            <MicOff size={13} />
            <span>Your mic is off</span>
          </div>
        )}

        {!videoEnabled && (
          <div className={styles.localCameraOff}>
            <div className={styles.cameraOffIconWrapper}>
              <VideoOff size={28} className={styles.cameraOffIconSmall} />
            </div>
            <span className={styles.cameraOffText}>Camera off</span>
            <p className={styles.cameraOffSubtext}>Turn on to share your vibe</p>
          </div>
        )}
      </div>

      {/* ── CONTROL BAR ── */}
      <div
        className={`${styles.controlBar} ${!uiVisible ? styles.controlBarHidden : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Left cluster */}
        <div className={styles.cluster}>
          <button
            onClick={onToggleAudio}
            className={`${styles.iconBtn} ${!audioEnabled ? styles.iconBtnDanger : ''}`}
            aria-label={audioEnabled ? 'Mute mic' : 'Unmute mic'}
          >
            <span className={styles.iconWrap}>
              {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </span>
            <span className={styles.btnLabel}>{audioEnabled ? 'Mute' : 'Unmute'}</span>
          </button>

          <button
            onClick={onToggleVideo}
            className={`${styles.iconBtn} ${!videoEnabled ? styles.iconBtnDanger : ''}`}
            aria-label={videoEnabled ? 'Stop video' : 'Start video'}
          >
            <span className={styles.iconWrap}>
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </span>
            <span className={styles.btnLabel}>{videoEnabled ? 'Camera' : 'No cam'}</span>
          </button>
        </div>

        {/* Center: Next pill (prominent CTA) */}
        <button
          onClick={handleSkip}
          disabled={isSkipping}
          className={styles.nextPill}
        >
          {isSkipping ? (
            <>
              <Loader size={17} className={styles.spinner} />
              <span>Finding…</span>
            </>
          ) : (
            <>
              <SkipForward size={17} />
              <span>Next</span>
            </>
          )}
        </button>

        {/* Right cluster */}
        <div className={styles.cluster}>
          <button
            onClick={handleReportClick}
            className={`${styles.iconBtn} ${styles.iconBtnFlag}`}
            aria-label="Report this person"
          >
            <span className={styles.iconWrap}>
              <Flag size={17} />
            </span>
            <span className={styles.btnLabel}>Report</span>
          </button>

          <button
            onClick={onLeave}
            className={styles.endBtn}
            aria-label="End call"
          >
            <span className={styles.iconWrap}>
              <PhoneOff size={18} />
            </span>
            <span className={styles.btnLabel}>End</span>
          </button>
        </div>
      </div>

      {/* ── REPORT MODAL ── */}
      {showReportModal && (
        <div className={styles.modalOverlay} onClick={e => e.stopPropagation()}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <Shield size={19} className={styles.modalShield} />
              <h2 className={styles.modalTitle}>Report this person</h2>
              <button onClick={() => setShowReportModal(false)} className={styles.modalClose}>
                <X size={18} />
              </button>
            </div>

            {!reportSubmitted ? (
              <>
                <p className={styles.modalSubtitle}>
                  All reports are reviewed privately. Pick what best describes the situation.
                </p>

                <div className={styles.reasonsGrid}>
                  {REPORT_REASONS.map(reason => (
                    <button
                      key={reason.id}
                      onClick={() => setSelectedReason(reason.id)}
                      className={`${styles.reasonChip} ${selectedReason === reason.id ? styles.reasonChipSelected : ''}`}
                    >
                      <span className={styles.reasonChipIcon}>{reason.icon}</span>
                      <span>{reason.label}</span>
                    </button>
                  ))}
                </div>

                <textarea
                  value={reportDescription}
                  onChange={e => setReportDescription(e.target.value)}
                  placeholder="Anything else we should know? (optional)"
                  className={styles.reportTextarea}
                  rows={3}
                />

                <div className={styles.modalActions}>
                  <button onClick={() => setShowReportModal(false)} className={styles.cancelBtn}>
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitReport}
                    disabled={!selectedReason}
                    className={styles.submitBtn}
                  >
                    <Flag size={14} />
                    Send report
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.reportSuccess}>
                <div className={styles.successIconRing}>
                  <Shield size={30} />
                </div>
                <h3 className={styles.successTitle}>Report received</h3>
                <p className={styles.successText}>
                  Thanks for helping keep Orey safe. We'll review this right away.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── OVERLAYS ── */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay}>
          <div className={styles.overlayGradient} />

          {autoSearchCountdown !== null ? (
            <div className={styles.countdownOverlay}>
              <div className={styles.countdownText}>{autoSearchCountdown}</div>
              <div className={styles.encryptionBadge}>
                <Shield size={15} className={styles.shieldIcon} />
                <span className={styles.encryptionText}>Secure connection ready</span>
              </div>
              <button onClick={onCancelAutoSearch} className={styles.terminateBtn}>
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.searchingOverlay}>
              <div className={styles.orbitingHearts}>
                <div className={styles.orbitRing}>
                  <Heart size={16} className={styles.orbitHeart1} fill="currentColor" />
                  <Heart size={12} className={styles.orbitHeart2} fill="currentColor" />
                  <Heart size={14} className={styles.orbitHeart3} fill="currentColor" />
                </div>
                <div className={styles.spinnerCenter}>
                  <Loader size={30} className={styles.spinnerIcon} />
                </div>
              </div>
              <div className={styles.searchingTextContainer}>
                <div className={styles.synchronizingText}>Looking for your match</div>
                <p className={styles.searchingSubtext}>Someone great is just around the corner…</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallScreen;
