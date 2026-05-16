import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Copy, Check, X, ArrowRight, Bell, ShieldCheck, Settings, User, Users } from 'lucide-react';
import './styles.css';

const LOVE_PICKUP_LINES = [
  "Are you a camera? Because every time I look at you, I smile.",
  "I'm not a photographer, but I can definitely picture us together.",
  "You must be a magician, because whenever I look at you, everyone else disappears.",
  "I'd say God Bless You, but it looks like He already did.",
  "Are you made of copper and tellurium? Because you're CuTe.",
  "I'm learning about important dates in history. Do you want to be one of them?",
  "If beauty were time, you'd be an eternity."
];

const PERM = {
  IDLE: 'idle',
  REQUESTING: 'requesting',
  DENIED: 'denied',
  GRANTED: 'granted'
};

function resolvePermState(granted: boolean) {
  return granted ? PERM.GRANTED : PERM.DENIED;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead?: boolean;
  icon?: string;
}

interface LobbyProps {
  oreyId?: string;
  searching?: boolean;
  matchStage?: string | null;
  matchTimer?: number;
  onDiscover?: () => void;
  onCancelSearch?: () => void;
  onConnectById?: (id: string) => void;
  gender?: string | null;
  onSetGender?: (g: string | null) => void;
  notifications?: Notification[];
  unreadCount?: number;
  onViewNotifications?: () => void;
}

// ── Globe Component (Pure Canvas) ───────────────────────────────────────────

const GLOBE_MARKERS = [
  { lat: 40.7128, lng: -74.006 },
  { lat: 51.5074, lng: -0.1278 },
  { lat: 35.6762, lng: 139.6503 },
  { lat: -33.8688, lng: 151.2093 },
  { lat: 55.7558, lng: 37.6173 },
  { lat: -1.2921, lng: 36.8219 },
];

function Globe({ size = 260 }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);
  const phiOffsetRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const pulseTimesRef = useRef(GLOBE_MARKERS.map((_, i) => i * 0.4));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 8;

    function latLngToXYZ(lat: number, lng: number, phi: number) {
      const latR = (lat * Math.PI) / 180;
      const lngR = ((lng + phi * (180 / Math.PI)) * Math.PI) / 180;
      const x = Math.cos(latR) * Math.sin(lngR);
      const y = -Math.sin(latR);
      const z = Math.cos(latR) * Math.cos(lngR);
      return { x, y, z };
    }

    function projectToCanvas(xyz: { x: number; y: number; z: number }) {
      return {
        sx: cx + xyz.x * R,
        sy: cy + xyz.y * R,
        visible: xyz.z > 0,
      };
    }

    const dots: { lat: number; lng: number }[] = [];
    for (let i = 0; i < 2200; i++) {
      const phi_rand = Math.random() * Math.PI * 2;
      const theta_rand = Math.acos(2 * Math.random() - 1);
      const lat = 90 - (theta_rand * 180) / Math.PI;
      const lng = (phi_rand * 180) / Math.PI - 180;
      if (isLand(lat, lng)) {
        dots.push({ lat, lng });
      }
    }

    function isLand(lat: number, lng: number) {
      if (lat > 15 && lat < 75 && lng > -170 && lng < -52) return Math.random() < 0.65;
      if (lat > -60 && lat < 15 && lng > -82 && lng < -34) return Math.random() < 0.6;
      if (lat > 35 && lat < 72 && lng > -12 && lng < 45) return Math.random() < 0.72;
      if (lat > -40 && lat < 38 && lng > -18 && lng < 52) return Math.random() < 0.65;
      if (lat > 0 && lat < 78 && lng > 45 && lng < 150) return Math.random() < 0.6;
      if (lat > -12 && lat < 25 && lng > 95 && lng < 145) return Math.random() < 0.45;
      if (lat > -45 && lat < -10 && lng > 112 && lng < 155) return Math.random() < 0.6;
      return false;
    }

    let t = 0;

    function draw() {
      const phi = phiRef.current + phiOffsetRef.current;
      ctx.clearRect(0, 0, size, size);

      const grad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      grad.addColorStop(0, 'rgba(200, 30, 30, 0.18)');
      grad.addColorStop(0.5, 'rgba(180, 20, 20, 0.10)');
      grad.addColorStop(1, 'rgba(100, 10, 10, 0.06)');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      for (let lat = -60; lat <= 60; lat += 30) {
        const y0 = cy + (Math.sin((lat * Math.PI) / 180) * R);
        const rx = Math.cos((lat * Math.PI) / 180) * R;
        if (rx > 0) {
          ctx.beginPath();
          ctx.ellipse(cx, y0, rx, rx * 0.15, 0, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.07)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      for (let lng = 0; lng < 360; lng += 30) {
        const lngR = ((lng + phi * (180 / Math.PI)) * Math.PI) / 180;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.abs(Math.sin(lngR)) * R, R, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.05)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      for (const d of dots) {
        const xyz = latLngToXYZ(d.lat, d.lng, phi);
        if (xyz.z < 0.05) continue;
        const { sx, sy } = projectToCanvas(xyz);
        const fade = Math.min(1, (xyz.z - 0.05) / 0.3);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(239, 68, 68, ${0.35 * fade})`;
        ctx.fill();
      }

      GLOBE_MARKERS.forEach((m, i) => {
        const xyz = latLngToXYZ(m.lat, m.lng, phi);
        if (xyz.z < 0.1) return;
        const { sx, sy } = projectToCanvas(xyz);
        const fade = Math.min(1, (xyz.z - 0.1) / 0.4);

        const pt = pulseTimesRef.current[i];
        const cycle = (t * 0.8 - pt + i * 0.7) % 2;
        if (cycle >= 0 && cycle < 1.8) {
          const progress = cycle / 1.8;
          const ringR = progress * 22;
          const alpha = (1 - progress) * 0.6 * fade;
          ctx.beginPath();
          ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          const ringR2 = progress * 14;
          const alpha2 = (1 - progress) * 0.4 * fade;
          ctx.beginPath();
          ctx.arc(sx, sy, ringR2, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239, 68, 68, ${alpha2})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * fade})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.8 * fade})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      const spec = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, 0, cx - R * 0.2, cy - R * 0.2, R * 0.55);
      spec.addColorStop(0, 'rgba(255,255,255,0.08)');
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = spec;
      ctx.fill();

      if (!isDraggingRef.current) {
        phiRef.current += 0.004;
      }
      t += 0.016;
      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [size]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastXRef.current = e.clientX;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastXRef.current;
    phiOffsetRef.current += dx / 150;
    lastXRef.current = e.clientX;
  }, []);

  const onPointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    phiRef.current += phiOffsetRef.current;
    phiOffsetRef.current = 0;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{
        cursor: 'grab',
        borderRadius: '50%',
        touchAction: 'none',
        display: 'block',
        filter: 'drop-shadow(0 20px 40px rgba(239,68,68,0.25))',
      }}
    />
  );
}

// ── Slider (no Framer Motion — plain CSS/JS approach) ───────────────────────

function SliderThumb({ onSlideComplete }: { onSlideComplete: () => void }) {
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const xRef = useRef(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startThumbXRef = useRef(0);
  const [hintOpacity, setHintOpacity] = useState(1);

  const maxDrag = 280 - 56 - 8;

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startThumbXRef.current = xRef.current;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startXRef.current;
    const newX = Math.max(0, Math.min(maxDrag, startThumbXRef.current + dx));
    xRef.current = newX;
    if (thumbRef.current) thumbRef.current.style.transform = `translateX(${newX}px)`;
    setHintOpacity(Math.max(0, 1 - newX / (maxDrag * 0.6)));
  };

  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (xRef.current > maxDrag * 0.8) {
      onSlideComplete();
    }
    xRef.current = 0;
    if (thumbRef.current) {
      thumbRef.current.style.transition = 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)';
      thumbRef.current.style.transform = 'translateX(0px)';
      setTimeout(() => { if (thumbRef.current) thumbRef.current.style.transition = ''; }, 350);
    }
    setHintOpacity(1);
  };

  return (
    <div ref={trackRef} className="sliderTrack">
      <div className="sliderHint" style={{ opacity: hintOpacity }}>
        <span className="sliderHintText">Slide to Find a Match</span>
      </div>
      <div
        ref={thumbRef}
        className="sliderThumb"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        role="slider"
        aria-label="Slide to connect"
      >
        <span className="thumbLogo">O</span>
      </div>
    </div>
  );
}

// ── Main Lobby Component ────────────────────────────────────────────────────

export default function Lobby({
  oreyId = 'OREY-X7R2P',
  searching = false,
  matchStage = null,
  matchTimer = 3,
  onDiscover = () => { console.log('Discover triggered'); },
  onCancelSearch = () => { console.log('Search cancelled'); },
  onConnectById = (id: string) => { console.log('Connecting to', id); },
  gender = null,
  onSetGender = (g: string | null) => { console.log('Gender set to', g); },
  notifications = [],
  unreadCount = 2,
  onViewNotifications = () => {},
}: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [showNotifSheet, setShowNotifSheet] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(searching);
  const [currentGender, setCurrentGender] = useState(gender);

  useEffect(() => {
    const id = setInterval(() => {
      setLineIndex((prev) => (prev + 1) % LOVE_PICKUP_LINES.length);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setIsSearching(searching);
  }, [searching]);

  const handleSlideComplete = useCallback(() => {
    setIsSearching(true);
    onDiscover();
  }, [onDiscover]);

  const handleCancelSearch = useCallback(() => {
    setIsSearching(false);
    onCancelSearch();
  }, [onCancelSearch]);

  const copyId = useCallback(() => {
    if (!oreyId) return;
    navigator.clipboard?.writeText(oreyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [oreyId]);

  const handleConnect = useCallback(() => {
    const trimmed = targetId.trim().toUpperCase();
    if (trimmed.length === 5) {
      onConnectById('OREY-' + trimmed);
      setTargetId('');
    }
  }, [targetId, onConnectById]);

  const handleGenderSelect = (selected: string | null) => {
    setCurrentGender(selected);
    onSetGender(selected);
  };

  const getSearchStatusText = () => {
    if (matchStage === 'gender') {
      const target = currentGender === 'male' ? 'Females' : 'Males';
      return `Matching ${target} · ${matchTimer}s`;
    }
    return 'Matching Anyone · Worldwide';
  };

  return (
    <>
      {/* Framework7 App shell */}
      <div className="root">
        <div className="bgGradient">
          <div className="bgGlowTop" />
          <div className="bgGlowBottom" />
        </div>

        <div className="container">

          {/* Header */}
          <header className="header">
            <div className="flex flex-col">
              <h1 className="logo">Orey<span className="logoAccent">!</span></h1>
              {!isSearching && (
                <div className="styleContainer">
                  <span className="styleLabel">Daily Spark:</span>
                  <div className="h-10 overflow-hidden">
                    <p key={lineIndex} className="styleValue sparkAnim">
                      "{LOVE_PICKUP_LINES[lineIndex]}"
                    </p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => { setShowNotifSheet(true); onViewNotifications(); }}
              className="bellBtn"
              aria-label="Notifications"
            >
              <Bell size={18} strokeWidth={2.5} />
              {unreadCount > 0 && <span className="bellBadge" />}
            </button>
          </header>

          {/* Gender selector */}
          {!isSearching && (
            <div className="genderSelector">
              <button onClick={() => handleGenderSelect('male')} className={`genderBtn ${currentGender === 'male' ? 'genderBtnActiveMale' : ''}`}>
                <User size={16} /><span>Male</span>
              </button>
              <button onClick={() => handleGenderSelect('female')} className={`genderBtn ${currentGender === 'female' ? 'genderBtnActiveFemale' : ''}`}>
                <User size={16} /><span>Female</span>
              </button>
              <button onClick={() => handleGenderSelect(null)} className={`genderBtn ${currentGender === null ? 'genderBtnActiveAny' : ''}`}>
                <Users size={16} /><span>Any</span>
              </button>
            </div>
          )}

          {/* Main area */}
          <main className="main">
            {!isSearching ? (
              <div className="flex flex-col items-center">
                <SliderThumb onSlideComplete={handleSlideComplete} />
                <p className="permHintIdle">Camera &amp; microphone required to connect</p>
              </div>
            ) : (
              <div className="searchingContent">
                <div className="globeContainer">
                  <Globe size={260} />
                  <div className="searchTimer">
                    {matchStage === 'gender' ? 'Finding Match' : 'Searching Worldwide'}
                  </div>
                  <div className="searchStatus">
                    <span className="statusDot" />
                    <span>{getSearchStatusText()}</span>
                  </div>
                </div>
                <button onClick={handleCancelSearch} className="cancelSearchBtn">
                  Cancel Search
                </button>
              </div>
            )}
          </main>

          {/* Footer */}
          <footer className="footer">
            <div className="idRow">
              <div onClick={copyId} className="idBlock">
                <span className="idLabel">My Identity</span>
                <div className="idDisplay">
                  <span className="idCode">{oreyId}</span>
                  {copied
                    ? <Check size={18} style={{ color: '#ef4444' }} />
                    : <Copy size={16} style={{ color: '#94a3b8' }} />
                  }
                </div>
              </div>
              <div className="privateBadge">
                <ShieldCheck size={18} style={{ color: '#94a3b8' }} />
                <span className="privateText">Private</span>
              </div>
            </div>

            <div className="connectCard">
              <span className="connectPrefix">OREY-</span>
              <input
                type="text"
                placeholder="ENTER PARTNER ID"
                maxLength={5}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value.toUpperCase().slice(0, 5))}
                className="connectInput"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                onClick={handleConnect}
                disabled={targetId.length !== 5}
                className="connectBtn"
                aria-label="Connect to partner"
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </footer>
        </div>

        {/* Notification Sheet */}
        {showNotifSheet && (
          <div className="overlay" onClick={() => setShowNotifSheet(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="handle" />
              <div className="sheetHeader">
                <h3 className="sheetTitle">Notifications</h3>
                <button onClick={() => setShowNotifSheet(false)} className="sheetCloseBtn" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <div className="sheetContent">
                {notifications.length === 0 ? (
                  <div className="emptyState">
                    <Bell size={40} className="emptyStateIcon" />
                    <p className="emptyStateText">No activity yet</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className="notifItem"
                      style={{
                        backgroundColor: n.isRead ? 'rgba(255,255,255,0.02)' : 'rgba(239,68,68,0.05)',
                        borderColor: n.isRead ? 'transparent' : 'rgba(239,68,68,0.2)',
                      }}
                    >
                      <div className="notifIcon">{n.icon || '✨'}</div>
                      <div className="notifContent">
                        <p className="notifTitle">{n.title}</p>
                        <p className="notifMessage">{n.message}</p>
                      </div>
                      {!n.isRead && <div className="unreadDot" />}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
