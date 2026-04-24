import styles from './Modals.module.css'

export function ShareRequestModal({ fromName, onAccept, onDecline }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.sheet}>
        <h3 className={styles.title}>🤝 Share Orey-IDs?</h3>
        <p className={styles.sub}>{fromName} wants to swap Orey-IDs.</p>
        <div className={styles.row}>
          <button className={`${styles.sbBtn} ${styles.secondary}`} onClick={onDecline}>Decline</button>
          <button className={`${styles.sbBtn} ${styles.primary}`} onClick={onAccept}>Accept &amp; Share</button>
        </div>
      </div>
    </div>
  )
}

export function RevealModal({ partnerOreyId, partnerName, onCopy, onClose }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.sheet}>
        <h3 className={styles.title}>✨ IDs Exchanged</h3>
        <div className={styles.idBox}>
          <div className={styles.idLabel}>Partner ID</div>
          <div className={styles.idValue}>{partnerOreyId}</div>
        </div>
        <button className={`${styles.sbBtn} ${styles.primary}`} onClick={onCopy}>Copy ID</button>
        <button className={`${styles.sbBtn} ${styles.ghost}`} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
