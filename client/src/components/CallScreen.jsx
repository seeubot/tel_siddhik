import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
Mic, MicOff, Video, VideoOff,
UserPlus, Zap,
Share2, VolumeX
} from 'lucide-react';
import styles from './CallScreen.module.css';
​/**
​OREY! PRO - Call Screen Component
​Handles media streams, peer searching, and immersive UI states.
*/
​const CallScreen = () => {
const [partner, setPartner] = useState(null);
const [searching, setSearching] = useState(false);
const [audioEnabled, setAudioEnabled] = useState(true);
const [videoEnabled, setVideoEnabled] = useState(true);
const [uiVisible, setUiVisible] = useState(true);
const [countdown, setCountdown] = useState(null);
​const uiTimerRef = useRef(null);
const localVideoRef = useRef(null);
const streamRef = useRef(null);
​// Initialize and Update Local Media Stream
useEffect(() => {
async function setupMedia() {
try {
if (videoEnabled || audioEnabled) {
const stream = await navigator.mediaDevices.getUserMedia({
video: videoEnabled,
audio: audioEnabled
});
streamRef.current = stream;
if (localVideoRef.current) {
localVideoRef.current.srcObject = stream;
}
} else {
if (streamRef.current) {
streamRef.current.getTracks().forEach(track => track.stop());
}
}
} catch (err) {
console.error("Access to media devices was denied.", err);
}
}
setupMedia();
return () => {
if (streamRef.current) {
streamRef.current.getTracks().forEach(track => track.stop());
}
};
}, [videoEnabled, audioEnabled]);
​// Auto-hide UI Logic
const resetUiTimer = useCallback(() => {
clearTimeout(uiTimerRef.current);
uiTimerRef.current = setTimeout(() => setUiVisible(false), 8000);
}, []);
​useEffect(() => {
if (uiVisible) resetUiTimer();
return () => clearTimeout(uiTimerRef.current);
}, [uiVisible, resetUiTimer, searching]);
​const handleToggleUI = (e) => {
if (e.target.closest(.${styles.dock})) return;
setUiVisible(!uiVisible);
};
​const handleSkip = () => {
setPartner(null);
setSearching(true);
setCountdown(null);
setTimeout(() => {
setSearching(false);
setCountdown(3);
}, 2000);
};
​useEffect(() => {
if (countdown !== null && countdown > 0) {
const t = setTimeout(() => setCountdown(countdown - 1), 1000);
return () => clearTimeout(t);
} else if (countdown === 0) {
setPartner({ id: 'Stranger_' + Math.floor(Math.random() * 9000 + 1000) });
setCountdown(null);
}
}, [countdown]);
​return (
<div className={styles.container} onClick={handleToggleUI}>
<div className={styles.grainOverlay} />
​{/* PEER PANEL */}
<div className={${styles.panel} ${styles.strangerPanel} ${searching ? styles.searchingPanel : ''}}>
{partner ? (
<div className={styles.videoPlaceholder}>
<span className="text-white/10 text-[10px] tracking-[0.4em] uppercase font-bold italic">Secure Node Live</span>
</div>
) : (
<div className="absolute inset-0 flex flex-col items-center justify-center opacity-10 px-4 text-center">
<div className="text-[14vw] md:text-[10vw] font-black italic tracking-tighter mix-blend-difference uppercase leading-none">OREY!</div>
<div className="text-[8px] md:text-[10px] tracking-[0.6em] font-bold uppercase mt-2">{searching ? 'SCANNING' : 'ESTABLISHING'}</div>
</div>
)}
​<div className={${styles.badgeWrapper} ${uiVisible ? styles.visible : styles.hiddenTop}}>
<div className={styles.badge}>
<div className={${styles.statusDot} ${partner ? styles.online : styles.offline}} />
<span className={styles.badgeText}>
{partner ? partner.id : 'Awaiting Peer'}
</span>
</div>
</div>
</div>
​<div className={styles.divider} />
​{/* USER PANEL */}
<div className={${styles.panel} ${styles.youPanel}}>
{videoEnabled ? (
<video ref={localVideoRef} className={${styles.video} ${styles.mirror}} autoPlay playsInline muted />
) : (
<div className="absolute inset-0 flex items-center justify-center bg-zinc-950/40">
<VideoOff size={48} className="text-white/5" strokeWidth={1} />
</div>
)}
​<div className={${styles.badgeWrapper} ${uiVisible ? styles.visible : styles.hiddenBottom}}>
<div className={styles.badge}>
<div className="flex items-center gap-2">
<div className="w-1.5 h-1.5 rounded-full bg-white/40" />
<span className={styles.badgeText}>You</span>
</div>
{!audioEnabled && (
<>
<div className={styles.badgeSeparator} />
<VolumeX size={12} className="text-rose-500" />
</>
)}
</div>
</div>
</div>
​{/* --- CONTROL INTERFACE --- */}
<div className={${styles.dockWrapper} ${uiVisible ? '' : styles.dockHidden}}>
<div className={styles.dock}>
<div className={styles.dockGroup}>
<button className={styles.utilBtn}>
<Share2 size={18} strokeWidth={2} />
</button>
<button className={${styles.utilBtn} hidden sm:flex}>
<UserPlus size={18} strokeWidth={2} />
</button>
</div>
​<div className={styles.dockSeparator} />
​<div className={styles.dockGroup}>
<button
onClick={() => setVideoEnabled(!videoEnabled)}
className={${styles.mediaBtn} ${!videoEnabled ? styles.mediaActive : ''}}
>
{videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
</button>
<button
onClick={() => setAudioEnabled(!audioEnabled)}
className={${styles.mediaBtn} ${!audioEnabled ? styles.mediaActive : ''}}
>
{audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
</button>
</div>
​<button onClick={handleSkip} className={styles.skipBtn}>
<span className={styles.skipText}>Skip</span>
<div className={styles.skipIconWrapper}>
<Zap size={15} fill="currentColor" />
</div>
</button>
</div>
​<div className={styles.hintText}>Tap Screen to Focus</div>
</div>
​{/* --- TRANSITION OVERLAYS --- */}
{searching && (
<div className={styles.overlay}>
<div className={styles.loadingLine}>
<div className={styles.loadingBar} />
</div>
<div className={styles.overlayText}>Syncing Connection</div>
</div>
)}
​{countdown !== null && (
<div className={styles.overlay}>
<div className={styles.countdownValue}>{countdown}</div>
<div className={styles.countdownSub}>Establishing Secure Node</div>
</div>
)}
</div>
);
};
​export default CallScreen;
