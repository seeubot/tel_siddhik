import { io } from 'socket.io-client';

export const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Replace with your TURN credentials for production:
    // {
    //   urls: [
    //     'turn:your-turn-server.example.com:3478',
    //     'turns:your-turn-server.example.com:5349',
    //   ],
    //   username: import.meta.env.VITE_TURN_USER,
    //   credential: import.meta.env.VITE_TURN_PASS,
    // },
  ],
};

let socketInstance = null;

/**
 * Get or create the singleton Socket.IO connection.
 * 
 * The socket is created once and reused across the app.
 * Device registration must be done separately in the app logic.
 */
export function getSocket() {
  if (!socketInstance) {
    const serverUrl = window.location.origin;
    
    socketInstance = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      // Send device ID as auth data on connection
      auth: (cb) => {
        // Try to get device ID from storage
        try {
          const stored = localStorage.getItem('orey_device_identity');
          if (stored) {
            const parsed = JSON.parse(stored);
            cb({ deviceId: parsed.value || null });
          } else {
            cb({ deviceId: null });
          }
        } catch (e) {
          cb({ deviceId: null });
        }
      }
    });

    // ── Connection Events ─────────────────────────────────────────
    
    socketInstance.on('connect', () => {
      console.log(`🔌 Socket connected: ${socketInstance.id}`);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${reason}`);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Socket reconnected after ${attemptNumber} attempts`);
    });

    socketInstance.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Reconnect attempt ${attemptNumber}...`);
    });

    socketInstance.on('reconnect_error', (error) => {
      console.error('❌ Reconnect error:', error.message);
    });

    socketInstance.on('reconnect_failed', () => {
      console.error('❌ Failed to reconnect after all attempts');
    });
  }
  
  return socketInstance;
}

/**
 * Register device ID with the socket connection
 * Call this after the device ID is obtained
 * 
 * @param {string} deviceId - Permanent device ID
 */
export function registerDevice(deviceId) {
  const socket = getSocket();
  if (socket && deviceId) {
    // Update auth data
    socket.auth = { deviceId };
    
    // If already connected, emit registration
    if (socket.connected) {
      socket.emit('register-device', { deviceId });
    }
    
    console.log(`📱 Device registered on socket: ${deviceId.substring(0, 12)}...`);
  }
}

/**
 * Check if socket is connected
 */
export function isSocketConnected() {
  return socketInstance?.connected || false;
}

/**
 * Get current socket ID
 */
export function getSocketId() {
  return socketInstance?.id || null;
}

/**
 * Disconnect the socket
 */
export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
    console.log('🔌 Socket disconnected and cleared');
  }
}

export default getSocket;
