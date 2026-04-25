import { Copy, Check, X, Share2, UserCheck } from 'lucide-react';
import { useState } from 'react';
import styles from './Modals.module.css';

export function ShareRequestModal({ fromName, onAccept, onDecline }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalIcon}>
          <Share2 size={24} />
        </div>
        <h3 className={styles.modalTitle}>ID Share Request</h3>
        <p className={styles.modalBody}>
          <strong>{fromName}</strong> wants to exchange Orey-IDs with you.
        </p>
        <div className={styles.modalActions}>
          <button className={styles.declineBtn} onClick={onDecline}>
            <X size={16} /> Decline
          </button>
          <button className={styles.acceptBtn} onClick={onAccept}>
            <UserCheck size={16} /> Accept
          </button>
        </div>
      </div>
    </div>
  );
}

export function RevealModal({ oreyId, userName, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!oreyId) return;
    navigator.clipboard.writeText(oreyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>
        <div className={styles.modalIcon} style={{ background: 'rgba(34, 211, 238, 0.1)', borderColor: 'rgba(34, 211, 238, 0.3)' }}>
          <UserCheck size={24} style={{ color: '#22d3ee' }} />
        </div>
        <h3 className={styles.modalTitle}>ID Exchanged!</h3>
        <p className={styles.modalBody}>
          {userName}'s Orey-ID:
        </p>
        {oreyId ? (
          <div className={styles.idDisplay}>
            <span className={styles.idText}>{oreyId}</span>
            <button className={styles.copyInline} onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        ) : (
          <p className={styles.noId}>Partner hasn't registered an Orey-ID.</p>
        )}
        <button className={styles.acceptBtn} onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
          Done
        </button>
      </div>
    </div>
  );
}
