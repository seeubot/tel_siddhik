import { io } from 'socket.io-client'

// FIX 1: autoConnect: false — connect explicitly after register-orey-id is ready.
// Connecting at import time means socket.data.oreyId is null for the first
// few events, which breaks identity-dependent handlers on the server.
export const socket = io({
  autoConnect: false,
  // FIX 4: Skip the long-poll upgrade dance — go straight to WebSocket.
  // Polling introduces ordering unpredictability for offer/answer/ICE sequences.
  transports: ['websocket'],
  // Reconnect with a short backoff ceiling so skips/partner-leaves recover fast
  reconnectionDelay: 1000,
  reconnectionDelayMax: 4000,
})

// FIX 2: STUN + TURN so symmetric-NAT users (corporate, mobile carrier) can connect.
// Two Google STUN entries are redundant — they resolve to the same servers.
// Replace the TURN credentials with your actual coturn / Twilio / Metered values.
export const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turn:your-turn-server.example.com:3478',
        'turns:your-turn-server.example.com:5349', // TLS fallback for port-blocked networks
      ],
      username: import.meta.env.VITE_TURN_USER,
      credential: import.meta.env.VITE_TURN_PASS,
    },
  ],
}
