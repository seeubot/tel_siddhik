import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import styles from './ReportModal.module.css';

const REPORT_REASONS = [
  'Inappropriate Content',
  'Harassment',
  'Spam',
  'Fake Identity',
  'Underage User',
  'Other'
];

export default function ReportModal({ 
  isOpen, 
  onClose, 
  onSubmit,
  reportedUserName 
}) {
  const [selectedReason, setSelectedReason] = useState('');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (selectedReason) {
      onSubmit(selectedReason, description);
      onClose();
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <AlertTriangle size={24} className={styles.icon} />
          <h2>Report User</h2>
          <button onClick={onClose} className={styles.closeBtn}>
            <X size={20} />
          </button>
        </div>

        <p className={styles.subtitle}>
          Reporting: <strong>{reportedUserName}</strong>
        </p>

        <div className={styles.reasons}>
          {REPORT_REASONS.map(reason => (
            <button
              key={reason}
              className={`${styles.reasonBtn} ${selectedReason === reason ? styles.selected : ''}`}
              onClick={() => setSelectedReason(reason)}
            >
              {reason}
            </button>
          ))}
        </div>

        <textarea
          className={styles.textarea}
          placeholder="Additional details (optional)..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />

        <button 
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={!selectedReason}
        >
          Submit Report
        </button>

        <p className={styles.disclaimer}>
          False reports may result in action against your account.
        </p>
      </div>
    </div>
  );
}
