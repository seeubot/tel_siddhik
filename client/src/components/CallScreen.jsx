import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  Zap, PhoneOff, Loader, 
  Flag, Shield, VolumeX, Heart, Sparkles,
  X, AlertTriangle, UserX, EyeOff, MessageCircle
} from 'lucide-react';
import styles from './CallScreen.module.css';

/**
 * Orey! - Call Screen Component
 * Dating app themed video interface with romantic aesthetics
 */

const HIGH_PRIORITY_REASONS = [
  { id: 'nudity', label: 'Nudity / Sexual Content', icon: <EyeOff size={16} /> },
  { id: 'harassment', label: 'Sexual Harassment', icon: <AlertTriangle size={16} /> },
  { id: 'underage', label: 'Underage User', icon: <UserX size={16} /> },
  { id: 'violence', label: 'Violence / Threats', icon: <AlertTriangle size={16} /> },
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [heartState, setHeartState] = useState('empty'); // 'empty', 'filling', 'full', 'broken'
  const hideTimerRef = useRef(null);

  const isRemoteConnected = !!partner;
  const isPartnerVideoOff = partner && !partnerMedia?.video;
  const isPartnerMuted = partner && !partnerMedia?.audio;

  // Heart animation states based on connection
  useEffect(() => {
    if (isRemoteConnected && !isPartnerVideoOff) {
      setHeartState('filling');
      const timer = setTimeout(() => setHeartState('full'), 1500);
      return () => clearTimeout(timer);
    } else if (isRemoteConnected && isPartnerVideoOff) {
      setHeartState('full');
    } else if (!isRemoteConnected && !searching) {
      setHeartState('empty');
    }
  }, [isRemoteConnected, isPartnerVideoOff, searching]);

  // Handle partner disconnect
  useEffect(() => {
    if (heartState === 'full' && !isRemoteConnected) {
      setHeartState('broken');
      const timer = setTimeout(() => setHeartState('empty'), 2000);
      return () => clearTimeout(timer);
    }
  }, [isRemoteConnected, heartState]);

  // Touch/Click to toggle UI visibility
  const handleScreenTap = useCallback(() => {
    setUiVisible(prev => !prev);
  }, []);

  // Auto-hide UI after 4 seconds
  useEffect(() => {
    if (!uiVisible) return;
    
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setUiVisible(false);
    }, 4000);

    return () => clearTimeout(hideTimerRef.current);
  }, [uiVisible]);

  // Reset timer on interaction
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

  const handleNextClick = () => {
    if (isConnecting) return;
    setIsConnecting(true);
    onFindRandomPeer?.();
    setTimeout(() => {
      setIsConnecting(false);
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
    
    const reason = HIGH_PRIORITY_REASONS.find(r => r.id === selectedReason);
    onReport?.({
      reason: reason?.label || selectedReason,
      description: reportDescription,
      isHighPriority: true
    });
    
    setReportSubmitted(true);
    setTimeout(() => {
      setShowReportModal(false);
    }, 2000);
  };

  return (
    <div className={styles.container} onClick={handleScreenTap}>
      {/* Background Effects */}
      <div className={styles.gradientOrb1} />
      <div className={styles.gradientOrb2} />
      <div className={styles.noiseLayer} />
      
      {/* Floating Elements */}
      <div className={styles.floatingElements}>
        <Heart className={styles.floatHeart1} size={16} />
        <Heart className={styles.floatHeart2} size={12} />
        <Sparkles className={styles.floatSparkle1} size={14} />
        <Sparkles className={styles.floatSparkle2} size={18} />
      </div>

      {/* REMOTE VIEW */}
      <div className={styles.remoteView}>
        {/* Show actual video or camera off state */}
        <video
          ref={remoteVideoRef}
          className={`${styles.videoBase} ${searching ? styles.searchingBlur : ''}`}
          autoPlay 
          playsInline
          style={{ display: isRemoteConnected && !isPartnerVideoOff ? 'block' : 'none' }}
        />

        {/* Partner Camera Off Overlay */}
        {isRemoteConnected && isPartnerVideoOff && (
          <div className={styles.partnerCameraOff}>
            <div className={styles.cameraOffIconWrapper}>
              <VideoOff size={40} className={styles.cameraOffIconLarge} />
            </div>
            <h3 className={styles.partnerCameraOffTitle}>Camera is Off</h3>
            <p className={styles.partnerCameraOffText}>
              Your match has turned off their camera
            </p>
            <div className={styles.cameraOffStatus}>
              <span className={styles.statusDot} />
              Still connected via audio
            </div>
          </div>
        )}
        
        {/* Partner Muted Indicator */}
        {isRemoteConnected && isPartnerMuted && (
          <div className={styles.partnerMutedBadge}>
            <VolumeX size={14} />
            <span className={styles.partnerMutedText}>Partner Muted</span>
          </div>
        )}

        {/* Connection Status Badge */}
        {isRemoteConnected && (
          <div className={`${styles.heartBadge} ${styles[`heart${heartState.charAt(0).toUpperCase() + heartState.slice(1)}`]}`}>
            <div className={styles.heartContainer}>
              <Heart 
                size={20} 
                className={`${styles.heartIcon} ${styles[heartState]}`}
                fill={heartState === 'full' ? 'currentColor' : 'none'}
              />
            </div>
            <span className={styles.heartText}>
              {heartState === 'full' && 'Connected'}
              {heartState === 'filling' && 'Connecting...'}
              {heartState === 'broken' && 'Disconnected'}
              {heartState === 'empty' && 'Waiting'}
            </span>
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
              Find your perfect match
            </div>
            <div className={styles.loadingDots}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        )}
      </div>

      {/* LOCAL VIEW */}
      <div className={styles.localView}>
        <video
          ref={localVideoRef}
          className={`${styles.videoBase} ${styles.mirrored}`}
          autoPlay 
          playsInline 
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />
        
        {!videoEnabled && (
          <div className={styles.localCameraOff}>
            <div className={styles.cameraOffIconWrapper}>
              <VideoOff size={28} className={styles.cameraOffIconSmall} />
            </div>
            <span className={styles.cameraOffText}>Your Camera is Off</span>
            <p className={styles.cameraOffSubtext}>Turn on to share your vibe</p>
          </div>
        )}

        {!audioEnabled && videoEnabled && (
          <div className={styles.muteIndicator}>
            <MicOff size={14} />
          </div>
        )}
      </div>

      {/* CONTROL INTERFACE */}
      <div 
        className={`${styles.controlWrapper} ${!uiVisible ? styles.uiHidden : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.mainIsland}>
          {/* Microphone */}
          <button 
            onClick={onToggleAudio}
            className={`${styles.controlBtn} ${!audioEnabled ? styles.btnDanger : styles.btnDefault}`}
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          </button>

          {/* Camera */}
          <button 
            onClick={onToggleVideo}
            className={`${styles.controlBtn} ${!videoEnabled ? styles.btnDanger : styles.btnDefault}`}
            aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          </button>

          <div className={styles.divider} />

          {/* Next Match Button */}
          <button
            onClick={handleNextClick}
            disabled={isConnecting}
            className={styles.nextBtn}
          >
            {isConnecting ? (
              <>
                <Loader size={16} className={styles.spinner} />
                <span>Finding...</span>
              </>
            ) : (
              <>
                <Heart size={16} fill="currentColor" className={styles.heartBeat} />
                <span>Next</span>
              </>
            )}
          </button>

          <div className={styles.divider} />

          {/* Report */}
          <button 
            onClick={handleReportClick}
            className={`${styles.controlBtn} ${styles.btnReport}`}
            aria-label="Report user"
          >
            <Flag size={16} />
          </button>

          {/* Leave */}
          <button 
            onClick={onLeave}
            className={`${styles.controlBtn} ${styles.btnLeave}`}
            aria-label="Leave call"
          >
            <PhoneOff size={16} />
          </button>
        </div>
      </div>

      {/* REPORT MODAL */}
      {showReportModal && (
        <div className={styles.modalOverlay} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <Shield size={20} className={styles.modalShield} />
              <h2 className={styles.modalTitle}>Report User</h2>
              <button 
                onClick={() => setShowReportModal(false)}
                className={styles.modalClose}
              >
                <X size={20} />
              </button>
            </div>

            {!reportSubmitted ? (
              <>
                <p className={styles.modalSubtitle}>
                  Your safety is our priority. All reports are anonymous.
                </p>

                <div className={styles.reasonsList}>
                  {HIGH_PRIORITY_REASONS.map((reason) => (
                    <button
                      key={reason.id}
                      onClick={() => setSelectedReason(reason.id)}
                      className={`${styles.reasonBtn} ${selectedReason === reason.id ? styles.reasonSelected : ''}`}
                    >
                      <span className={styles.reasonIcon}>{reason.icon}</span>
                      <span className={styles.reasonLabel}>{reason.label}</span>
                    </button>
                  ))}
                </div>

                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Additional details (optional)..."
                  className={styles.reportInput}
                  rows={3}
                />

                <div className={styles.modalActions}>
                  <button
                    onClick={() => setShowReportModal(false)}
                    className={styles.cancelReportBtn}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitReport}
                    disabled={!selectedReason}
                    className={styles.submitReportBtn}
                  >
                    <Flag size={14} />
                    Submit Report
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.reportSuccess}>
                <Shield size={48} className={styles.successIcon} />
                <h3 className={styles.successTitle}>Report Submitted</h3>
                <p className={styles.successText}>
                  Thank you for helping keep Orey safe. We'll review this report immediately.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OVERLAYS */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.overlay}>
          <div className={styles.overlayGradient} />
          
          {autoSearchCountdown !== null ? (
            <div className={styles.countdownOverlay}>
              <div className={styles.countdownText}>{autoSearchCountdown}</div>
              <div className={styles.encryptionBadge}>
                <Shield size={16} className={styles.shieldIcon} />
                <span className={styles.encryptionText}>Secure Connection Ready</span>
              </div>
              <button onClick={onCancelAutoSearch} className={styles.terminateBtn}>
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.searchingOverlay}>
              <div className={styles.searchingAnimation}>
                <div className={styles.orbitingHearts}>
                  <div className={styles.orbitRing}>
                    <Heart size={16} className={styles.orbitHeart1} fill="currentColor" />
                    <Heart size={12} className={styles.orbitHeart2} fill="currentColor" />
                    <Heart size={14} className={styles.orbitHeart3} fill="currentColor" />
                  </div>
                  <div className={styles.spinnerCenter}>
                    <Loader size={32} className={styles.spinnerIcon} />
                  </div>
                </div>
              </div>
              <div className={styles.searchingTextContainer}>
                <div className={styles.synchronizingText}>Finding Your Match</div>
                <p className={styles.searchingSubtext}>Someone amazing is nearby...</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallScreen;
