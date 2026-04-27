/**
 * DeviceIdentity.js
 * 
 * Manages permanent device ID across multiple storage locations.
 * Priority: Native Android Bridge → IndexedDB → localStorage → Cookie → sessionStorage
 * 
 * The device ID survives:
 * - App restarts ✓
 * - WebView cache clear ✓ (IndexedDB usually survives)
 * - App data clear (sometimes) ✓/✗
 * - App uninstall ✗ (unless native bridge stores externally)
 */

const DEVICE_ID_KEY = 'orey_device_identity';
const DEVICE_BACKUP_KEY = 'orey_device_backup';
const DEVICE_BAN_KEY = 'orey_device_ban';
const COOKIE_NAME = 'orey_did';
const COOKIE_EXPIRY_DAYS = 3650; // 10 years

class DeviceIdentity {
  // ═══════════════════════════════════════════════════════════════
  // ID Generation
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate a unique permanent device ID
   * Format: OREY-XXXX-XXXX-XXXX-TIMESTAMP
   */
  static generateDeviceId() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const segments = [];
    
    for (let s = 0; s < 3; s++) {
      let segment = '';
      for (let i = 0; i < 4; i++) {
        segment += chars[Math.floor(Math.random() * chars.length)];
      }
      segments.push(segment);
    }
    
    const timestamp = Date.now().toString(36).toUpperCase();
    return `OREY-${segments.join('-')}-${timestamp}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // Simple Hash (data integrity check)
  // ═══════════════════════════════════════════════════════════════

  static simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  // ═══════════════════════════════════════════════════════════════
  // Cookie Storage
  // ═══════════════════════════════════════════════════════════════

  static setCookie(name, value, days = COOKIE_EXPIRY_DAYS) {
    try {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      const expires = `expires=${date.toUTCString()}`;
      document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/;SameSite=Lax`;
    } catch (e) {
      // Silently fail
    }
  }

  static getCookie(name) {
    try {
      const nameEQ = name + "=";
      const ca = document.cookie.split(';');
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(nameEQ) === 0) {
          return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
      }
    } catch (e) {
      // Silently fail
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  // IndexedDB Storage (most persistent WebView storage)
  // ═══════════════════════════════════════════════════════════════

  static openDatabase() {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('OreyDeviceDB', 1);
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('device')) {
            db.createObjectStore('device', { keyPath: 'key' });
          }
        };
        
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  static async storeInIndexedDB(key, value) {
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction(['device'], 'readwrite');
      const store = transaction.objectStore('device');
      
      store.put({ 
        key, 
        value, 
        timestamp: Date.now(),
        checksum: this.simpleHash(value)
      });
      
      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      // Silently fail - not critical
    }
  }

  static async getFromIndexedDB(key) {
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction(['device'], 'readonly');
      const store = transaction.objectStore('device');
      const request = store.get(key);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          if (result && result.value) {
            // Verify checksum
            const expectedChecksum = this.simpleHash(result.value);
            if (result.checksum === expectedChecksum) {
              resolve(result.value);
            } else {
              resolve(null); // Corrupted data
            }
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Multi-location Storage
  // ═══════════════════════════════════════════════════════════════

  /**
   * Store device ID in ALL available storage locations
   */
  static async storeEverywhere(key, value) {
    const stores = [];

    // 1. IndexedDB (most persistent)
    try {
      await this.storeInIndexedDB(key, value);
      stores.push('indexedDB');
    } catch (e) {}

    // 2. localStorage (main)
    try {
      localStorage.setItem(key, JSON.stringify({
        value,
        timestamp: Date.now(),
        checksum: this.simpleHash(value)
      }));
      stores.push('localStorage');
    } catch (e) {}

    // 3. localStorage (backup key)
    try {
      localStorage.setItem(DEVICE_BACKUP_KEY, value);
      stores.push('localStorage_backup');
    } catch (e) {}

    // 4. Cookie (long expiry)
    try {
      this.setCookie(COOKIE_NAME, value);
      stores.push('cookie');
    } catch (e) {}

    // 5. sessionStorage (temporary, but one more location)
    try {
      sessionStorage.setItem(key, value);
      stores.push('sessionStorage');
    } catch (e) {}

    // 6. Try native Android bridge if available
    if (window.OreyNative) {
      try {
        window.OreyNative.getDeviceId(); // This triggers native storage in background
        stores.push('nativeBridge');
      } catch (e) {}
    }

    return stores;
  }

  /**
   * Retrieve device ID from ALL storage locations
   * Returns first valid value found
   */
  static async retrieveFromEverywhere(key) {
    let value = null;
    let source = null;

    // 1. Try native Android bridge first (best persistence)
    if (window.OreyNative) {
      try {
        value = window.OreyNative.getDeviceId();
        if (value) {
          source = 'nativeBridge';
          console.log('✅ Found in native bridge');
        }
      } catch (e) {}
    }

    // 2. Try IndexedDB
    if (!value) {
      try {
        value = await this.getFromIndexedDB(key);
        if (value) {
          source = 'indexedDB';
          console.log('✅ Found in IndexedDB');
        }
      } catch (e) {}
    }

    // 3. Try localStorage main key
    if (!value) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          const expectedChecksum = this.simpleHash(parsed.value);
          if (parsed.value && parsed.checksum === expectedChecksum) {
            value = parsed.value;
            source = 'localStorage';
            console.log('✅ Found in localStorage');
          }
        }
      } catch (e) {}
    }

    // 4. Try backup key
    if (!value) {
      try {
        const backup = localStorage.getItem(DEVICE_BACKUP_KEY);
        if (backup) {
          value = backup;
          source = 'localStorage_backup';
          console.log('✅ Found in localStorage backup');
        }
      } catch (e) {}
    }

    // 5. Try cookie
    if (!value) {
      try {
        const cookieValue = this.getCookie(COOKIE_NAME);
        if (cookieValue) {
          value = cookieValue;
          source = 'cookie';
          console.log('✅ Found in cookie');
        }
      } catch (e) {}
    }

    // 6. Try sessionStorage (last resort)
    if (!value) {
      try {
        const session = sessionStorage.getItem(key);
        if (session) {
          value = session;
          source = 'sessionStorage';
          console.log('✅ Found in sessionStorage');
        }
      } catch (e) {}
    }

    // If found, restore to all missing locations
    if (value) {
      await this.restoreToAllStores(key, value, source);
    }

    return value;
  }

  /**
   * Restore found value to all missing storage locations
   */
  static async restoreToAllStores(key, value, foundInSource) {
    const restored = [];

    // Restore to IndexedDB
    if (foundInSource !== 'indexedDB') {
      try {
        await this.storeInIndexedDB(key, value);
        restored.push('indexedDB');
      } catch (e) {}
    }

    // Restore to localStorage
    if (foundInSource !== 'localStorage') {
      try {
        localStorage.setItem(key, JSON.stringify({
          value,
          timestamp: Date.now(),
          checksum: this.simpleHash(value)
        }));
        restored.push('localStorage');
      } catch (e) {}
    }

    // Restore backup
    if (foundInSource !== 'localStorage_backup') {
      try {
        localStorage.setItem(DEVICE_BACKUP_KEY, value);
        restored.push('localStorage_backup');
      } catch (e) {}
    }

    // Restore cookie
    if (foundInSource !== 'cookie') {
      try {
        this.setCookie(COOKIE_NAME, value);
        restored.push('cookie');
      } catch (e) {}
    }

    if (restored.length > 0) {
      console.log('🔄 Restored to:', restored.join(', '));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get or create permanent device ID
   * This is the main function to call
   */
  static async getOrCreateDeviceId() {
    try {
      // Try to retrieve existing ID from all locations
      let deviceId = await this.retrieveFromEverywhere(DEVICE_ID_KEY);

      if (!deviceId) {
        // Generate new permanent ID
        deviceId = this.generateDeviceId();
        
        // Store everywhere
        await this.storeEverywhere(DEVICE_ID_KEY, deviceId);
        
        console.log('📱 New device ID created:', deviceId.substring(0, 16) + '...');
      } else {
        console.log('📱 Existing device ID found:', deviceId.substring(0, 16) + '...');
      }

      return deviceId;

    } catch (error) {
      console.error('Failed to get/create device ID:', error);
      
      // Ultimate fallback - generate temporary ID in localStorage only
      const fallbackId = this.generateDeviceId();
      try {
        localStorage.setItem(DEVICE_ID_KEY, JSON.stringify({
          value: fallbackId,
          timestamp: Date.now(),
          checksum: this.simpleHash(fallbackId)
        }));
      } catch (e) {}
      
      return fallbackId;
    }
  }

  /**
   * Check if device is banned (local check)
   */
  static async isDeviceBanned() {
    try {
      // Check IndexedDB first
      let banData = await this.getFromIndexedDB(DEVICE_BAN_KEY);
      
      // Fallback to localStorage
      if (!banData) {
        try {
          const stored = localStorage.getItem(DEVICE_BAN_KEY);
          if (stored) {
            banData = typeof stored === 'string' ? JSON.parse(stored) : stored;
          }
        } catch (e) {}
      }

      // Check native bridge
      if (window.OreyNative) {
        try {
          const nativeBanned = window.OreyNative.isBanned();
          if (nativeBanned) {
            return true;
          }
        } catch (e) {}
      }

      if (banData) {
        // Check if temporary ban expired
        if (banData.expiresAt && Date.now() > banData.expiresAt) {
          await this.clearBan();
          return false;
        }
        return true;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get ban info
   */
  static async getBanInfo() {
    try {
      let banData = await this.getFromIndexedDB(DEVICE_BAN_KEY);
      
      if (!banData) {
        try {
          const stored = localStorage.getItem(DEVICE_BAN_KEY);
          if (stored) {
            banData = typeof stored === 'string' ? JSON.parse(stored) : stored;
          }
        } catch (e) {}
      }

      return banData || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Store ban information locally
   */
  static async storeBan(banInfo) {
    const banData = {
      reason: banInfo.reason || 'Violation of terms of service',
      timestamp: banInfo.timestamp || new Date().toISOString(),
      expiresAt: banInfo.expiresAt || null,
      permanent: !banInfo.expiresAt
    };

    try {
      // Store in IndexedDB
      await this.storeInIndexedDB(DEVICE_BAN_KEY, JSON.stringify(banData));
      
      // Store in localStorage
      localStorage.setItem(DEVICE_BAN_KEY, JSON.stringify(banData));
      
      // Store via native bridge
      if (window.OreyNative) {
        try {
          window.OreyNative.setBanned(
            banData.reason,
            banData.permanent ? 0 : 8760 // hours
          );
        } catch (e) {}
      }

      console.log('🚫 Ban stored locally');
    } catch (error) {
      console.warn('Failed to store ban locally:', error);
    }
  }

  /**
   * Clear ban status from all locations
   */
  static async clearBan() {
    try {
      localStorage.removeItem(DEVICE_BAN_KEY);
      
      // Remove from IndexedDB
      try {
        const db = await this.openDatabase();
        const transaction = db.transaction(['device'], 'readwrite');
        const store = transaction.objectStore('device');
        store.delete(DEVICE_BAN_KEY);
      } catch (e) {}

      // Clear native ban
      if (window.OreyNative) {
        try {
          window.OreyNative.clearBan();
        } catch (e) {}
      }

      console.log('✅ Ban cleared locally');
    } catch (error) {
      console.warn('Failed to clear ban:', error);
    }
  }

  /**
   * Verify data integrity across all storage locations
   */
  static async verifyIntegrity() {
    const deviceId = await this.retrieveFromEverywhere(DEVICE_ID_KEY);
    
    if (deviceId) {
      console.log('🔍 Device ID integrity verified');
      return { valid: true, deviceId };
    }
    
    console.warn('⚠️ Device ID integrity check failed');
    return { valid: false, deviceId: null };
  }

  /**
   * Delete all stored device data (for testing/privacy)
   */
  static async deleteAllData() {
    try {
      // Clear localStorage
      localStorage.removeItem(DEVICE_ID_KEY);
      localStorage.removeItem(DEVICE_BACKUP_KEY);
      localStorage.removeItem(DEVICE_BAN_KEY);
      
      // Clear cookie
      this.setCookie(COOKIE_NAME, '', -1);
      
      // Clear sessionStorage
      sessionStorage.removeItem(DEVICE_ID_KEY);
      
      // Clear IndexedDB
      try {
        const db = await this.openDatabase();
        const transaction = db.transaction(['device'], 'readwrite');
        const store = transaction.objectStore('device');
        store.delete(DEVICE_ID_KEY);
        store.delete(DEVICE_BAN_KEY);
      } catch (e) {}

      // Clear native
      if (window.OreyNative) {
        try {
          window.OreyNative.clearBan();
        } catch (e) {}
      }

      console.log('🗑️ All device data deleted');
    } catch (error) {
      console.error('Failed to delete all data:', error);
    }
  }
}

export default DeviceIdentity;
