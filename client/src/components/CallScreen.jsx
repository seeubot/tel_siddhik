import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
  localStream = null,
  partnerStream = null,
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
  const [isReporting, setIsReporting] = useState(false);
  const hideTimerRef = useRef(null);
  const skipTimerRef = useRef(null);

  const isRemoteConnected = !!partner;
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  // Handle video stream sources
  useEffect(() => {
    if (remoteVideoRef.current && partnerStream) {
      remoteVideoRef.current.srcObject = partnerStream;
    }
  }, [partnerStream, remoteVideoRef]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, localVideoRef]);

  // Auto-hide UI controls
  useEffect(() => {
    if (!uiVisible) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    return () => clearTimeout(hideTimerRef.current);
  }, [uiVisible]);

  // Handle user activity to show/hide controls
  useEffect(() => {
    const resetTimer = () => {
      if (!uiVisible) setUiVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setUiVisible(false), 4000);
    };

    const events = ['mousemove', 'touchstart', 'touchmove', 'scroll'];
    events.forEach(event => window.addEventListener(event, resetTimer));

    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      clearTimeout(hideTimerRef.current);
    };
  }, [uiVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(hideTimerRef.current);
      clearTimeout(skipTimerRef.current);
    };
  }, []);

  const handleScreenTap = useCallback(() => {
    setUiVisible(prev => !prev);
  }, []);

  const handleSkip = useCallback(() => {
    if (isSkipping) return;
    setIsSkipping(true);
    onFindRandomPeer?.();
    
    skipTimerRef.current = setTimeout(() => {
      setIsSkipping(false);
      onSkip?.();
    }, 2000);
  }, [isSkipping, onFindRandomPeer, onSkip]);

  const handleReportClick = useCallback(() => {
    setShowReportModal(true);
    setReportSubmitted(false);
    setSelectedReason('');
    setReportDescription('');
    setIsReporting(false);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowReportModal(false);
  }, []);

  const handleSubmitReport = useCallback(async () => {
    if (!selectedReason || isReporting) return;
    
    setIsReporting(true);
    try {
      const reason = REPORT_REASONS.find(r => r.id === selectedReason);
      await onReport?.({ 
        reason: reason?.label || selectedReason, 
        description: reportDescription 
      });
      setReportSubmitted(true);
      setTimeout(() => setShowReportModal(false), 2200);
    } catch (error) {
      console.error('Failed to submit report:', error);
      // You could show an error state here
    } finally {
      setIsReporting(false);
    }
  }, [selectedReason, reportDescription, isReporting, onReport]);

  // Memoized floating elements
  const floatingElements = useMemo(() => (
    <div className={styles.floatingElements}>
      <Heart className={styles.floatHeart1} size={16} aria-hidden="true" />
      <Heart className={styles.floatHeart2} size={12} aria-hidden="true" />
      <Sparkles className={styles.floatSparkle1} size={14} aria-hidden="true" />
      <Sparkles className={styles.floatSparkle2} size={18} aria-hidden="true" />
    </div>
  ), []);

  // Memoized background effects
  const backgroundEffects = useMemo(() => (
    <>
      <div className={styles.gradientOrb1} aria-hidden="true" />
      <div className={styles.gradientOrb2} aria-hidden="true" />
      <div className={styles.noiseLayer} aria-hidden="true" />
    </>
  ), []);

  return (
    <div 
      className={styles.container} 
      onClick={handleScreenTap}
      role="main"
      aria-label="Video call screen"
    >
      {/* Background Effects */}
      {backgroundEffects}
      
      {/* Floating ambient elements */}
      {floatingElements}

      {/* REMOTE VIDEO */}
      <div className={styles.remoteView}>
        <video
          ref={remoteVideoRef}
          className={`${styles.videoBase} ${searching ? styles.searchingBlur : ''}`}
          autoPlay
          playsInline
          style={{ display: isRemoteConnected && !isPartnerVideoOff ? 'block' : 'none' }}
          aria-label="Remote video stream"
        />

        {isRemoteConnected && isPartnerVideoOff && (
          <div className={styles.partnerCameraOff}>
            <div className={styles.cameraOffIconWrapper}>
              <VideoOff size={40} className={styles.cameraOffIconLarge} aria-hidden="true" />
            </div>
            <h3 className={styles.partnerCameraOffTitle}>Camera off</h3>
            <p className={styles.partnerCameraOffText}>Your match turned their camera off</p>
            <div className={styles.cameraOffStatus}>
              <span className={styles.statusDot} aria-hidden="true" />
              Audio still connected
            </div>
          </div>
        )}

        {/* Partner muted chip */}
        {isRemoteConnected && isPartnerMuted && (
          <div className={`${styles.statusChip} ${styles.chipLeft}`} role="status">
            <VolumeX size={13} aria-hidden="true" />
            <span>Their mic is off</span>
          </div>
        )}

        {!isRemoteConnected && !searching && (
          <div className={styles.placeholder}>
            <div className={styles.logoWrapper}>
              <div className={styles.logoGlow} aria-hidden="true" />
              <div className={styles.brandText} aria-label="Orey">Orey!</div>
            </div>
            <div className={styles.waitingText}>
              <Sparkles size={16} className={styles.sparkleIcon} aria-hidden="true" />
              Ready to meet someone new?
            </div>
            <div className={styles.loadingDots} aria-label="Loading">
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
          aria-label="Local video stream"
        />

        {/* You muted chip */}
        {!audioEnabled && (
          <div className={`${styles.statusChip} ${styles.chipRight}`} role="status">
            <MicOff size={13} aria-hidden="true" />
            <span>Your mic is off</span>
          </div>
        )}

        {!videoEnabled && (
          <div className={styles.localCameraOff}>
            <div className={styles.cameraOffIconWrapper}>
              <VideoOff size={28} className={styles.cameraOffIconSmall} aria-hidden="true" />
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
        role="toolbar"
        aria-label="Call controls"
      >
        {/* Left cluster */}
        <div className={styles.cluster}>
          <button
            onClick={onToggleAudio}
            className={`${styles.iconBtn} ${!audioEnabled ? styles.iconBtnDanger : ''}`}
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={!audioEnabled}
          >
            <span className={styles.iconWrap}>
              {audioEnabled ? <Mic size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />}
            </span>
            <span className={styles.btnLabel}>{audioEnabled ? 'Mute' : 'Unmute'}</span>
          </button>

          <button
            onClick={onToggleVideo}
            className={`${styles.iconBtn} ${!videoEnabled ? styles.iconBtnDanger : ''}`}
            aria-label={videoEnabled ? 'Stop video' : 'Start video'}
            aria-pressed={!videoEnabled}
          >
            <span className={styles.iconWrap}>
              {videoEnabled ? <Video size={18} aria-hidden="true" /> : <VideoOff size={18} aria-hidden="true" />}
            </span>
            <span className={styles.btnLabel}>{videoEnabled ? 'Camera' : 'No cam'}</span>
          </button>
        </div>

        {/* Center: Next pill (prominent CTA) */}
        <button
          onClick={handleSkip}
          disabled={isSkipping}
          className={styles.nextPill}
          aria-label={isSkipping ? 'Finding next match' : 'Skip to next match'}
        >
          {isSkipping ? (
            <>
              <Loader size={17} className={styles.spinner} aria-hidden="true" />
              <span>Finding…</span>
            </>
          ) : (
            <>
              <SkipForward size={17} aria-hidden="true" />
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
              <Flag size={17} aria-hidden="true" />
            </span>
            <span className={styles.btnLabel}>Report</span>
          </button>

          <button
            onClick={onLeave}
            className={styles.endBtn}
            aria-label="End call"
          >
            <span className={styles.iconWrap}>
              <PhoneOff size={18} aria-hidden="true" />
            </span>
            <span className={styles.btnLabel}>End</span>
          </button>
        </div>
      </div>

      {/* ── REPORT MODAL ── */}
      {showReportModal && (
        <div 
          className={styles.modalOverlay} 
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <Shield size={19} className={styles.modalShield} aria-hidden="true" />
              <h2 id="report-modal-title" className={styles.modalTitle}>
                Report this person
              </h2>
              <button 
                onClick={handleCloseModal} 
                className={styles.modalClose}
                aria-label="Close report modal"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {!reportSubmitted ? (
              <>
                <p className={styles.modalSubtitle}>
                  All reports are reviewed privately. Pick what best describes the situation.
                </p>

                <div className={styles.reasonsGrid} role="radiogroup" aria-label="Report reasons">
                  {REPORT_REASONS.map(reason => (
                    <button
                      key={reason.id}
                      onClick={() => setSelectedReason(reason.id)}
                      className={`${styles.reasonChip} ${selectedReason === reason.id ? styles.reasonChipSelected : ''}`}
                      role="radio"
                      aria-checked={selectedReason === reason.id}
                    >
                      <span className={styles.reasonChipIcon} aria-hidden="true">
                        {reason.icon}
                      </span>
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
                  aria-label="Additional report details"
                  maxLength={500}
                />

                <div className={styles.modalActions}>
                  <button 
                    onClick={handleCloseModal} 
                    className={styles.cancelBtn}
                    disabled={isReporting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitReport}
                    disabled={!selectedReason || isReporting}
                    className={styles.submitBtn}
                    aria-label="Submit report"
                  >
                    {isReporting ? (
                      <Loader size={14} className={styles.spinner} aria-hidden="true" />
                    ) : (
                      <Flag size={14} aria-hidden="true" />
                    )}
                    {isReporting ? 'Sending...' : 'Send report'}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.reportSuccess}>
                <div className={styles.successIconRing} aria-hidden="true">
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
        <div className={styles.overlay} role="alert" aria-live="polite">
          <div className={styles.overlayGradient} aria-hidden="true" />

          {autoSearchCountdown !== null ? (
            <div className={styles.countdownOverlay}>
              <div className={styles.countdownText} aria-label={`${autoSearchCountdown} seconds`}>
                {autoSearchCountdown}
              </div>
              <div className={styles.encryptionBadge}>
                <Shield size={15} className={styles.shieldIcon} aria-hidden="true" />
                <span className={styles.encryptionText}>Secure connection ready</span>
              </div>
              <button 
                onClick={onCancelAutoSearch} 
                className={styles.terminateBtn}
                aria-label="Cancel auto search"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.searchingOverlay}>
              <div className={styles.orbitingHearts} aria-hidden="true">
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
                <p className={styles.searchingSubtext}>
                  Someone great is just around the corner…
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallScreen;
