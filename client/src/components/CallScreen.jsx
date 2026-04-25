import { useEffect, useRef } from 'react';
import {
  Mic, MicOff, Video, VideoOff,
  PhoneOff, SkipForward, Share2, X,
} from 'lucide-react';
import styles from './CallScreen.module.css';

export default function CallScreen({
  partner,
  roomId,
  oreyId,
  localVideoRef,
  remoteVideoRef,
  audioEnabled,
  videoEnabled,
  partnerMedia,
  searching,
  autoSearchCountdown,
  onToggleAudio,
  onToggleVideo,
  onSkip,
  onLeave,
  onShareId,
  onCancelAutoSearch,
}) {
  const initials = (partner?.userName || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className={styles.root}>
      {/* Background */}
      <div className={styles.bg} />

      {/* Remote video */}
      <div className={styles.remoteCard}>
        <video
          ref={remoteVideoRef}
          className={styles.remoteVideo}
          autoPlay
          playsInline
          style={{ display: partner && partnerMedia.video ? 'block' : 'none' }}
        />

        {/* Avatar fallback when no video */}
        {(!partner || !partnerMedia.video) && (
          <div className={styles.avatarFallback}>
            <div className={styles.avatar}>
              <span className={styles.avatarInitials}>{initials}</span>
              <div className={styles.avatarRing} />
            </div>
            <span className={styles.partnerName}>{partner?.userName || 'Waiting…'}</span>
            {partner && !partnerMedia.video && (
              <span className={styles.mediaOff}>Camera off</span>
            )}
          </div>
        )}

        {/* Partner info badge */}
        {partner && (
          <div className={styles.partnerBadge}>
            <span className={styles.partnerBadgeName}>{partner.userName}</span>
            {!partnerMedia.audio && <MicOff size={12} className={styles.mutedIcon} />}
          </div>
        )}
      </div>

      {/* Local video (PiP) */}
      <div className={styles.localCard}>
        <video
          ref={localVideoRef}
          className={styles.localVideo}
          autoPlay
          playsInline
          muted
          style={{ display: videoEnabled ? 'block' : 'none' }}
        />
        {!videoEnabled && (
          <div className={styles.localNoVideo}>
            <VideoOff size={18} className={styles.noVideoIcon} />
          </div>
        )}
      </div>

      {/* Auto-search overlay */}
      {(searching || autoSearchCountdown !== null) && (
        <div className={styles.searchOverlay}>
          <div className={styles.searchBox}>
            {autoSearchCountdown !== null ? (
              <>
                <div className={styles.countdown}>{autoSearchCountdown}</div>
                <p className={styles.searchLabel}>Finding next match…</p>
                <button className={styles.cancelSearchBtn} onClick={onCancelAutoSearch}>
                  <X size={14} /> Cancel
                </button>
              </>
            ) : (
              <>
                <div className={styles.searchSpinner} />
                <p className={styles.searchLabel}>Searching…</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className={styles.controls}>
        <button
          className={`${styles.ctrlBtn} ${!audioEnabled ? styles.ctrlOff : ''}`}
          onClick={onToggleAudio}
          title={audioEnabled ? 'Mute' : 'Unmute'}
        >
          {audioEnabled ? <Mic size={22} /> : <MicOff size={22} />}
        </button>

        <button
          className={`${styles.ctrlBtn} ${!videoEnabled ? styles.ctrlOff : ''}`}
          onClick={onToggleVideo}
          title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {videoEnabled ? <Video size={22} /> : <VideoOff size={22} />}
        </button>

        <button
          className={`${styles.ctrlBtn} ${styles.ctrlSkip}`}
          onClick={onSkip}
          title="Skip to next"
        >
          <SkipForward size={22} />
        </button>

        <button
          className={`${styles.ctrlBtn} ${styles.ctrlShare}`}
          onClick={onShareId}
          title="Share your Orey-ID"
        >
          <Share2 size={22} />
        </button>

        <button
          className={`${styles.ctrlBtn} ${styles.ctrlEnd}`}
          onClick={onLeave}
          title="End call"
        >
          <PhoneOff size={22} />
        </button>
      </div>

      {/* Room ID badge */}
      <div className={styles.roomBadge}>
        Room: <code>{roomId}</code>
      </div>
    </div>
  );
}
