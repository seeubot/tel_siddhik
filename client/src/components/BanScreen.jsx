import React from 'react';
import { ShieldOff, Clock } from 'lucide-react';
import styles from './BanScreen.module.css';

export default function BanScreen({ reason, expiresAt, permanent }) {
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const isExpired = expiryDate && expiryDate < new Date();

  if (isExpired) return null;

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <ShieldOff size={64} className={styles.icon} />
        <h1 className={styles.title}>Access Denied</h1>
        
        <div className={styles.reasonBox}>
          <p className={styles.reason}>
            {reason || 'Your device has been banned due to violations of our terms of service.'}
          </p>
        </div>

        {!permanent && expiryDate && (
          <div className={styles.expiryBox}>
            <Clock size={16} />
            <span>Ban expires: {expiryDate.toLocaleDateString()}</span>
          </div>
        )}

        {permanent && (
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
