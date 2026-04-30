import React, { useState } from 'react';
import { Copy, Check, Zap, Hash, Loader2, Heart, Sparkles, Shield, MessageCircle, Users, Wifi, Compass } from 'lucide-react';
import styles from './Lobby.module.css';

/**
 * Lobby Component - Cosmic Connection Theme
 */
export default function Lobby({
  oreyId, oreyIdExpiry,
  searching,
  onDiscover, onCancelSearch, onConnectById,
}) {
  const [copied, setCopied] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [activeTab, setActiveTab] = useState('connect');

  const copyId = () => {
    navigator.clipboard.writeText(oreyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = oreyId;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleConnect = () => {
    const trimmed = targetId.trim().toUpperCase();
    const formattedId = trimmed.startsWith('OREY-') ? trimmed : `OREY-${trimmed}`;
    if (formattedId.length === 10) onConnectById(formattedId);
  };

  const expiryStr = oreyIdExpiry
    ? new Date(oreyIdExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={styles.root}>
      {/* Cosmic Background */}
      <div className={styles.cosmicBg}>
        <div className={styles.starField} />
        <div className={styles.nebula1} />
        <div className={styles.nebula2} />
        <div className={styles.constellation} />
        
        {/* Floating Particles */}
        <div className={styles.particles}>
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={styles.particle}
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${3 + Math.random() * 4}s`
              }}
            />
          ))}
        </div>
      </div>

      <div className={styles.container}>
        {/* Top Navigation Bar */}
        <nav className={styles.topNav}>
          <div className={styles.navBrand}>
            <Zap size={18} className={styles.brandIcon} />
            <span className={styles.brandText}>OREY</span>
          </div>
          <div className={styles.navActions}>
            <button className={styles.navBtn}>
              <MessageCircle size={18} />
              <span className={styles.navBadge}>3</span>
            </button>
            <button className={styles.navBtn}>
              <Wifi size={18} />
            </button>
          </div>
        </nav>

        {/* Hero Section with Animated Ring */}
        <div className={styles.heroSection}>
          <div className={styles.heroRing}>
            <div className={styles.heroRingInner}>
              <div className={styles.heroRingContent}>
                <Sparkles size={24} className={styles.heroSparkle} />
                <div className={styles.heroGlow} />
              </div>
            </div>
          </div>
          <h1 className={styles.heroTitle}>
            Find Your <span className={styles.gradientText}>Cosmic</span> Connection
          </h1>
          <p className={styles.heroSubtitle}>
            Real people. Real vibes. Real moments.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabNav}>
          <button
            className={`${styles.tab} ${activeTab === 'discover' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('discover')}
          >
            <Compass size={18} />
            <span>Discover</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'connect' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('connect')}
          >
            <Hash size={18} />
            <span>Connect</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'profile' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <Users size={18} />
            <span>Profile</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className={styles.contentArea}>
          {/* Discover Tab */}
          {activeTab === 'discover' && (
            <div className={styles.tabContent}>
              <div className={styles.discoverCard}>
                <div className={styles.discoverVisual}>
                  <div className={styles.orbitAnimation}>
                    <div className={styles.orbitRing}>
                      <Heart size={16} className={styles.orbitHeart1} />
                      <Heart size={12} className={styles.orbitHeart2} />
                      <Heart size={14} className={styles.orbitHeart3} />
                    </div>
                    <div className={styles.orbitCenter}>
                      <Sparkles size={32} className={styles.orbitCenterIcon} />
                    </div>
                  </div>
                </div>
                
                {!searching ? (
                  <button className={styles.cosmicBtn} onClick={onDiscover}>
                    <span className={styles.cosmicBtnContent}>
                      <Compass size={20} />
                      <span>Begin Your Journey</span>
                    </span>
                    <div className={styles.cosmicBtnGlow} />
                  </button>
                ) : (
                  <div className={styles.searchingState}>
                    <div className={styles.searchingPulse}>
                      <div className={styles.searchingRing1} />
                      <div className={styles.searchingRing2} />
                      <div className={styles.searchingRing3} />
                      <Loader2 size={32} className={styles.searchingSpinner} />
                    </div>
                    <p className={styles.searchingText}>Scanning the cosmos...</p>
                    <p className={styles.searchingSubtext}>Finding your perfect match</p>
                    <button className={styles.cancelBtn} onClick={onCancelSearch}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Connect Tab */}
          {activeTab === 'connect' && (
            <div className={styles.tabContent}>
              <div className={styles.connectCard}>
                {/* Your Code Section */}
                <div className={styles.codeSection}>
                  <div className={styles.codeLabel}>
                    <Sparkles size={14} />
                    <span>Your Unique Code</span>
                  </div>
                  <div className={styles.codeDisplay}>
                    <div className={styles.codeWrapper}>
                      <span className={styles.codeText}>
                        {oreyId || 'OREY-XXXXX'}
                      </span>
                      {expiryStr && (
                        <span className={styles.expiryPill}>Expires {expiryStr}</span>
                      )}
                    </div>
                    <button
                      className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
                      onClick={copyId}
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className={styles.codeHint}>
                    Share this code to connect instantly
                  </p>
                </div>

                {/* Divider */}
                <div className={styles.divider}>
                  <span className={styles.dividerLine} />
                  <span className={styles.dividerText}>OR</span>
                  <span className={styles.dividerLine} />
                </div>

                {/* Enter Code Section */}
                <div className={styles.enterCodeSection}>
                  <div className={styles.codeLabel}>
                    <Hash size={14} />
                    <span>Enter a Code</span>
                  </div>
                  <div className={styles.inputGroup}>
                    <div className={styles.inputContainer}>
                      <span className={styles.inputPrefix}>OREY-</span>
                      <input
                        type="text"
                        className={styles.codeInput}
                        placeholder="XXXXX"
                        maxLength={5}
                        value={targetId.replace('OREY-', '')}
                        onChange={(e) => setTargetId(e.target.value.toUpperCase().replace('OREY-', ''))}
                      />
                    </div>
                    <button
                      className={`${styles.connectBtn} ${targetId.length === 5 ? styles.connectBtnActive : ''}`}
                      onClick={handleConnect}
                      disabled={targetId.length !== 5}
                    >
                      <Zap size={16} />
                      <span>Link</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className={styles.tabContent}>
              <div className={styles.profileCard}>
                <div className={styles.profileAvatar}>
                  <div className={styles.avatarPlaceholder}>
                    <Users size={40} />
                  </div>
                  <div className={styles.onlineIndicator} />
                </div>
                <h3 className={styles.profileName}>Cosmic Explorer</h3>
                <p className={styles.profileBio}>Ready to connect with the universe</p>
                <div className={styles.profileStats}>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>0</span>
                    <span className={styles.statLabel}>Connections</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>0</span>
                    <span className={styles.statLabel}>Vibes</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>Active</span>
                    <span className={styles.statLabel}>Status</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Safety Footer */}
        <footer className={styles.safetyFooter}>
          <div className={styles.safetyBadge}>
            <Shield size={12} />
            <span>Quantum Encrypted</span>
          </div>
          <p className={styles.safetyText}>
            No screenshots. No recordings. Pure connections.
          </p>
        </footer>
      </div>
    </div>
  );
}
