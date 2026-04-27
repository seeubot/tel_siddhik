import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, Zap, Hash, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import styles from './Lobby.module.css';

// ─── Replace with your Web OAuth 2.0 Client ID from Google Cloud Console ──────
// Go to: console.cloud.google.com → APIs & Services → Credentials
// Create "OAuth 2.0 Client ID" → type: Web application
// Add Authorized JS origin: https://parallel-elsi-seeutech-50a3ab2e.koyeb.app
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

export default function Lobby({
  userName, setUserName,
  oreyId, oreyIdExpiry,
  searching,
  onDiscover, onCancelSearch, onConnectById,
  // ── New auth props ──────────────────────────────────────────────────────────
  googleUser,    // { name, email, picture, sessionToken } | null
  onGoogleAuth,  // (userData) => void  – called after successful backend verify
  onSignOut,     // () => void
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [scriptReady, setScriptReady] = useState(false);
  const googleBtnRef = useRef(null);

  // ── 1. Load Google Identity Services script ─────────────────────────────────
  useEffect(() => {
    if (window.google?.accounts) { setScriptReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptReady(true);
    script.onerror = () => setAuthError('Failed to load Google Sign-In. Check your connection.');
    document.head.appendChild(script);
    return () => { /* cleanup not needed – script persists */ };
  }, []);

  // ── 2. Initialize & render Google button once script is ready ───────────────
  useEffect(() => {
    if (!scriptReady || googleUser || !googleBtnRef.current) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'center',
      width: 280,
    });
  }, [scriptReady, googleUser]);

  // ── 3. Handle the Google credential → verify with Koyeb backend ────────────
  const handleGoogleCredential = async (response) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: response.credential }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      // data = { sessionToken, user: { name, email, picture, googleId } }

      setUserName(data.user.name);   // auto-populate name from Google account
      onGoogleAuth(data);             // pass full data up to App for socket auth
    } catch (err) {
      setAuthError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Existing helpers ────────────────────────────────────────────────────────
  const copyId = () => {
    navigator.clipboard?.writeText(oreyId).catch(() => {
      const el = document.createElement('textarea');
      el.value = oreyId;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnect = () => {
    const trimmed = targetId.trim().toUpperCase();
    if (trimmed.length === 8) onConnectById(trimmed);
  };

  const expiryStr = oreyIdExpiry
    ? new Date(oreyIdExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  // ══════════════════════════════════════════════════════════════════════════════
  // AUTH GATE – shown when user is NOT signed in
  // ══════════════════════════════════════════════════════════════════════════════
  if (!googleUser) {
    return (
      <div className={styles.root}>
        <div className={styles.grid} />
        <div className={styles.scanline} />
        <div className={styles.orb} />

        <div className={styles.authContainer}>
          {/* Brand */}
          <header className={styles.header}>
            <div className={styles.logo}>
              <span className={styles.logoText}>Orey</span>
              <span className={styles.logoAccent}>!</span>
            </div>
            <p className={styles.tagline}>Mana People • Mana Vibes</p>
          </header>

          {/* Auth Card */}
          <div className={styles.authCard}>
            <div className={styles.authIconRow}>
              <ShieldCheck size={28} className={styles.accentText} />
              <span className={styles.authTitle}>Secure Sign-In</span>
            </div>
            <p className={styles.authSubtitle}>
              Use your Google account to join. Your display name is pulled
              automatically — no passwords, no forms.
            </p>

            {/* Google Sign-In Button rendered here by GIS */}
            <div className={styles.googleBtnWrap}>
              {authLoading ? (
                <div className={styles.authLoadingRow}>
                  <Loader2 size={20} className={styles.spin} />
                  <span>Verifying with server…</span>
                </div>
              ) : (
                <div ref={googleBtnRef} className={styles.googleBtnInner} />
              )}
            </div>

            {authError && (
              <p className={styles.authError}>{authError}</p>
            )}

            {!scriptReady && !authLoading && (
              <p className={styles.authHint}>Loading Google Sign-In…</p>
            )}
          </div>

          <footer className={styles.footer}>
            ENCRYPTED PEER-TO-PEER NETWORK
            <span className={styles.footerMuted}> NO LOGS • NO ACCOUNTS • NO BS</span>
          </footer>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MAIN LOBBY – shown when user IS signed in
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className={styles.root}>
      <div className={styles.grid} />
      <div className={styles.scanline} />
      <div className={styles.orb} />

      <div className={styles.container}>
        {/* Brand Header */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoText}>Orey</span>
            <span className={styles.logoAccent}>!</span>
          </div>
          <p className={styles.tagline}>Mana People • Mana Vibes</p>
        </header>

        {/* ── Profile Card (replaces the old name input) ── */}
        <div className={styles.card}>
          <div className={styles.profileRow}>
            <div className={styles.avatarWrap}>
              {googleUser.picture ? (
                <img
                  src={googleUser.picture}
                  alt={googleUser.name}
                  className={styles.avatar}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className={styles.avatarFallback}>
                  {googleUser.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className={styles.onlineDot} />
            </div>

            <div className={styles.profileInfo}>
              <span className={styles.profileName}>{googleUser.name}</span>
              <span className={styles.profileEmail}>{googleUser.email}</span>
              <div className={styles.verifiedBadge}>
                <ShieldCheck size={10} />
                Google Verified
              </div>
            </div>

            <button
              className={styles.signOutBtn}
              onClick={onSignOut}
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>

          {/* Orey-ID */}
          <div className={styles.idBox}>
            <div className={styles.idHeader}>
              <span className={styles.idLabel}>Your Public ID</span>
              {expiryStr && <span className={styles.expiry}>Expires {expiryStr}</span>}
            </div>
            <div className={styles.idRow}>
              <span className={styles.idValue}>{oreyId || '········'}</span>
              <button className={styles.copyBtn} onClick={copyId} title="Copy ID">
                {copied ? <Check size={18} className={styles.accentText} /> : <Copy size={18} />}
              </button>
            </div>
            <p className={styles.hint}>Valid for 24 hours</p>
          </div>
        </div>

        {/* Action Section */}
        <div className={styles.actions}>
          {!searching ? (
            <button className={styles.discoverBtn} onClick={onDiscover}>
              <Zap size={22} fill="currentColor" />
              DISCOVER PEERS
            </button>
          ) : (
            <div className={styles.searchingRow}>
              <div className={styles.statusBox}>
                <Loader2 size={20} className={styles.spin} />
                MATCHMAKING...
              </div>
              <button className={styles.cancelBtn} onClick={onCancelSearch}>STOP</button>
            </div>
          )}
        </div>

        {/* Direct Connection */}
        <div className={styles.card}>
          <label className={styles.label}>
            <Hash size={14} className={styles.accentText} /> Direct Connection
          </label>
          <div className={styles.connectRow}>
            <input
              className={`${styles.input} ${styles.mono}`}
              type="text"
              placeholder="Orey-ID"
              maxLength={8}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value.toUpperCase())}
            />
            <button
              className={styles.callBtn}
              onClick={handleConnect}
              disabled={targetId.length !== 8}
            >
              Call
            </button>
          </div>
        </div>

        <footer className={styles.footer}>
          ENCRYPTED PEER-TO-PEER NETWORK
          <span className={styles.footerMuted}> NO LOGS • NO ACCOUNTS • NO BS</span>
        </footer>
      </div>
    </div>
  );
}
