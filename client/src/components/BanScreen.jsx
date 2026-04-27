import React from 'react';
import { ShieldOff, Clock } from 'lucide-react';
import styles from './BanScreen.module.css';

export default function BanScreen({ reason, expiresAt }) {
  const isPermanent = !expiresAt;
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const isExpired = expiryDate && expiryDate < new Date();

  if (isExpired) return null; // Don't show if temporary ban expired

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <ShieldOff size={64} className={styles.icon} />
        <h1 className={styles.title}>Access Denied</h1>
        
        <div className={styles.reasonBox}>
          <p className={styles.reason}>{reason}</p>
        </div>

        {!isPermanent && expiryDate && (
          <div className={styles.expiryBox}>
            <Clock size={16} />
            <span>Ban expires: {expiryDate.toLocaleDateString()}</span>
          </div>
        )}

        {isPermanent && (
          <p className={styles.permanent}>This is a permanent ban.</p>
        )}

        <p className={styles.contact}>
          If you believe this is a mistake, please contact us at{' '}
          <a href="mailto:appeal@orey.app">appeal@orey.app</a>
        </p>
      </div>
    </div>
  );
}
