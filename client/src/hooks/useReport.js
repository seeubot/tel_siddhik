// Custom hook for reporting users
import { useState } from 'react';
import { submitReport } from '../lib/api';

export function useReport(deviceId) {
  const [isReporting, setIsReporting] = useState(false);

  const reportUser = async (reportedUserId, reason, description) => {
    setIsReporting(true);
    try {
      const result = await submitReport(deviceId, reportedUserId, reason, description);
      return result;
    } catch (error) {
      throw error;
    } finally {
      setIsReporting(false);
    }
  };

  return { reportUser, isReporting };
}
