import { io } from 'socket.io-client';

export const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
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

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socketInstance;
}

export default getSocket;
