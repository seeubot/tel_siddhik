/**
 * api.js
 * 
 * API helper functions for communicating with the Orey server.
 * All requests include the API key for authentication.
 */

const API_KEY = 'oryx_2024_secure_key_change_this';
const BASE_URL = ''; // Empty = same origin (Koyeb deployment)

/**
 * Make an authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...options.headers
    }
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw {
        status: response.status,
        message: data.error || 'Request failed',
        data
      };
    }
    
    return data;
  } catch (error) {
    if (error.status) throw error; // Our custom error
    throw {
      status: 0,
      message: error.message || 'Network error',
      data: null
    };
  }
}

/**
 * Admin API request (uses admin key)
 */
async function adminRequest(endpoint, options = {}) {
  const ADMIN_KEY = 'admin_secret_change_this'; // Should match server
  const url = `${BASE_URL}${endpoint}`;
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_KEY,
      ...options.headers
    }
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw {
        status: response.status,
        message: data.error || 'Admin request failed',
        data
      };
    }
    
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw {
      status: 0,
      message: error.message || 'Network error',
      data: null
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Device Endpoints
// ═══════════════════════════════════════════════════════════════

/**
 * Register device with the server
 * @param {string} deviceId - Permanent device ID
 */
export async function registerDevice(deviceId) {
  return apiRequest('/api/device/register', {
    method: 'POST',
    body: JSON.stringify({ deviceId, platform: 'webview' })
  });
}

/**
 * Check if a device is banned
 * @param {string} deviceId - Device ID to check
 */
export async function checkDeviceBan(deviceId) {
  return apiRequest('/api/device/check-ban', {
    method: 'POST',
    body: JSON.stringify({ deviceId })
  });
}

// ═══════════════════════════════════════════════════════════════
// Report Endpoints
// ═══════════════════════════════════════════════════════════════

/**
 * Submit a report against a user
 * @param {string} reporterDeviceId - Reporter's device ID
 * @param {string} reportedDeviceId - Reported user's device ID
 * @param {string} reason - Reason for report
 * @param {string} description - Additional details (optional)
 */
export async function submitReport(reporterDeviceId, reportedDeviceId, reason, description = '') {
  return apiRequest('/api/report', {
    method: 'POST',
    body: JSON.stringify({
      reporterDeviceId,
      reportedDeviceId,
      reason,
      description
    })
  });
}

// ═══════════════════════════════════════════════════════════════
// Config Endpoints
// ═══════════════════════════════════════════════════════════════

/**
 * Get app configuration (video quality, features, etc.)
 */
export async function getAppConfig(version = 0) {
  return apiRequest(`/api/config?version=${version}`);
}

/**
 * Check for app updates
 * @param {string} platform - 'android' or 'ios'
 * @param {number} version - Current version code
 */
export async function checkVersion(platform = 'android', version = 0) {
  return apiRequest(`/api/version?platform=${platform}&version=${version}`);
}

/**
 * Get notifications
 * @param {number} afterId - Get notifications after this ID
 */
export async function getNotifications(afterId = 0) {
  return apiRequest(`/api/notifications?after_id=${afterId}`);
}

// ═══════════════════════════════════════════════════════════════
// Orey-ID Endpoints
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a new Orey-ID (public, no auth needed)
 */
export async function generateOreyId() {
  try {
    const response = await fetch(`${BASE_URL}/generate-orey-id`);
    return await response.json();
  } catch (error) {
    throw {
      status: 0,
      message: 'Failed to generate Orey-ID',
      data: null
    };
  }
}

/**
 * Create a new room ID (public)
 */
export async function createRoom() {
  try {
    const response = await fetch(`${BASE_URL}/create-room`);
    return await response.json();
  } catch (error) {
    throw {
      status: 0,
      message: 'Failed to create room',
      data: null
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════

/**
 * Check server health
 */
export async function healthCheck() {
  try {
    const response = await fetch(`${BASE_URL}/health`);
    return await response.json();
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// Admin Endpoints (for admin panel)
// ═══════════════════════════════════════════════════════════════

/**
 * Get all reports (admin only)
 * @param {string} status - Filter by status: 'pending', 'banned', 'dismissed', 'auto_banned'
 */
export async function getReports(status = '') {
  const query = status ? `?status=${status}` : '';
  return adminRequest(`/admin/reports${query}`);
}

/**
 * Take action on a report (admin only)
 * @param {string} reportId - Report ID
 * @param {string} action - 'ban', 'dismiss', or 'warn'
 * @param {number} banDuration - Ban duration in hours (0 = permanent)
 * @param {string} notes - Admin notes
 */
export async function actionReport(reportId, action, banDuration = 720, notes = '') {
  return adminRequest(`/admin/reports/${reportId}/action`, {
    method: 'POST',
    body: JSON.stringify({ action, banDuration, notes })
  });
}

/**
 * Manually ban a device (admin only)
 * @param {string} deviceId - Device ID to ban
 * @param {string} reason - Reason for ban
 * @param {number} durationHours - Ban duration (0 = permanent)
 */
export async function banDevice(deviceId, reason, durationHours = 0) {
  return adminRequest('/admin/ban-device', {
    method: 'POST',
    body: JSON.stringify({ deviceId, reason, durationHours })
  });
}

/**
 * Unban a device (admin only)
 * @param {string} deviceId - Device ID to unban
 */
export async function unbanDevice(deviceId) {
  return adminRequest(`/admin/ban-device/${deviceId}`, {
    method: 'DELETE'
  });
}

/**
 * Get list of banned devices (admin only)
 */
export async function getBannedDevices() {
  return adminRequest('/admin/banned-devices');
}

/**
 * Get server stats (admin only)
 */
export async function getServerStats() {
  return adminRequest('/admin/stats');
}

/**
 * Send notification to all users (admin only)
 */
export async function sendNotification(title, message, type = 'info', priority = 'normal') {
  return adminRequest('/admin/notifications', {
    method: 'POST',
    body: JSON.stringify({ title, message, type, priority })
  });
}

/**
 * Toggle maintenance mode (admin only)
 */
export async function toggleMaintenance(enabled, message = '') {
  return adminRequest('/admin/maintenance', {
    method: 'POST',
    body: JSON.stringify({ enabled, message })
  });
}

/**
 * Update video quality settings (admin only)
 */
export async function updateVideoQuality(settings) {
  return adminRequest('/admin/video-quality', {
    method: 'PUT',
    body: JSON.stringify(settings)
  });
}
