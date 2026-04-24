import { useState } from 'react'
import styles from './Lobby.module.css'

export default function Lobby({ myId, onJoinRandom, onConnectById, waiting, onCancelRandom, status }) {
  const [userName, setUserName] = useState('')
  const [targetId, setTargetId] = useState('')

  const name = userName.trim() || 'Anonymous'

  return (
    <div className={styles.lobby}>
      {/* Ambient blobs (same as before) */}
      <div className={styles.ambient}>
        <div className={`${styles.ab} ${styles.ab1}`} />
        <div className={`${styles.ab} ${styles.ab2}`} />
      </div>

      {/* Main wordmark + tagline */}
      <div className={styles.wordmark}>
        <h1>Orey</h1>
        <p>FACE‑TO‑FACE WITH THE WORLD</p>
        {/* Dating‑style  */}
       <p className={styles.tagline}>
  Your next “hi” could be your last first date.
</p>
      </div>

      {/* Main panel */}
      <div className={styles.panel}>

        {/* Username */}
        <div>
          <div className={styles.lbl}>Username</div>
          <input
            className={styles.input}
            type="text"
            placeholder="What’s your name?"
            maxLength={20}
            value={userName}
            onChange={e => setUserName(e.target.value)}
          />
        </div>

        {/* Flirty hint beneath username */}
        <p className={styles.hint} style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
          Make it cute, not cringe.
        </p>

        {/* Orey ID card */}
        <div>
          <div className={styles.lbl}>Your Orey‑ID</div>
          <div className={styles.idCard}>
            <div className={styles.idDot} />
            <div className={styles.idVal}>{myId || 'Generating…'}</div>
            <svg
              onClick={() => myId && navigator.clipboard.writeText(myId)}
              style={{ cursor: 'pointer', opacity: 0.6 }}
              width="18" height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </div>
        </div>

        {/* Flirty call‑to‑action */}
        <p
          style={{
            fontSize: '0.85rem',
            textAlign: 'center',
            color: 'var(--muted)',
            marginTop: '-0.2rem',
          }}
        >
          Your next crush is just a random call away.
        </p>

        {!waiting ? (
          <button
            className={styles.btnRand}
            onClick={() => onJoinRandom(name)}
            disabled={!myId}
          >
            Join Random Match
          </button>
        ) : (
          <div className={styles.waitBar}>
            <span style={{ color: 'var(--amber)' }}>Finding someone…</span>
            <button className={styles.cancelBtn} onClick={onCancelRandom}>Cancel</button>
          </div>
        )}

        {/* Divider */}
        <div className={styles.divider}>
          <div className={styles.line} />
          OR CONNECT BY ID
          <div className={styles.line} />
        </div>

        {/* Connect by ID */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            className={styles.input}
            type="text"
            placeholder="Orey‑XXXX‑XXXX"
            value={targetId}
            onChange={e => setTargetId(e.target.value)}
          />
          <button
            className={styles.arrowBtn}
            onClick={() => onConnectById(targetId.trim(), name)}
            disabled={!targetId.trim()}
          >
            ➔
          </button>
        </div>

        {status && (
          <div
            style={{
              textAlign: 'center',
              fontSize: '0.8rem',
              height: '1.2em',
              color: status.color,
            }}
          >
            {status.msg}
          </div>
        )}
      </div>
    </div>
  )
}
