const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;
const OREY_ID_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const AUTO_SEARCH_DELAY_MS = 5000;

// ─── In-memory state ────────────────────────────────────────────────────────
/** @type {Map<string, { expiresAt: number, socketId: string, userName: string }>} */
const oreyIds = new Map();

/** @type {Map<string, Map<string, { userName: string, oreyId: string | null }>>} */
const rooms = new Map();

/** @type {string[]} FIFO queue of socket IDs waiting for random match */
const randomQueue = [];

/** @type {Map<string, ReturnType<typeof setTimeout>>} socketId → auto-search timer */
const autoSearchTimers = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateOreyId() {
  // 8-char alphanumeric, uppercase
  return uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
}

function generateRoomId() {
  return uuidv4().replace(/-/g, '').substring(0, 8).toLowerCase();
}

function cleanExpiredOreyIds() {
  const now = Date.now();
  for (const [id, data] of oreyIds.entries()) {
    if (data.expiresAt < now) oreyIds.delete(id);
  }
}

function removeFromQueue(socketId) {
  const idx = randomQueue.indexOf(socketId);
  if (idx !== -1) randomQueue.splice(idx, 1);
}

function removeSocketFromRooms(socketId) {
  for (const [roomId, peers] of rooms.entries()) {
    if (peers.has(socketId)) {
      peers.delete(socketId);
      if (peers.size === 0) {
        rooms.delete(roomId);
      }
      return { roomId, peers };
    }
  }
  return null;
}

function scheduleAutoSearch(socket, delay = AUTO_SEARCH_DELAY_MS) {
  cancelAutoSearch(socket.id);
  const timer = setTimeout(() => {
    autoSearchTimers.delete(socket.id);
    randomQueue.push(socket.id);
    attemptMatch(socket.id);
  }, delay);
  autoSearchTimers.set(socket.id, timer);
  socket.emit('auto-search-scheduled', { delay });
}

function cancelAutoSearch(socketId) {
  const timer = autoSearchTimers.get(socketId);
  if (timer) {
    clearTimeout(timer);
    autoSearchTimers.delete(socketId);
  }
}

function attemptMatch(newSocketId) {
  // Need at least 2 people in queue
  if (randomQueue.length < 2) return;

  // Pull the two earliest waiters (avoid matching socket with itself)
  const idxSelf = randomQueue.indexOf(newSocketId);
  if (idxSelf === -1) return;

  // Find a partner that is not us
  let partnerIdx = -1;
  for (let i = 0; i < randomQueue.length; i++) {
    if (i !== idxSelf) { partnerIdx = i; break; }
  }
  if (partnerIdx === -1) return;

  const [selfId, partnerId] = [randomQueue[idxSelf], randomQueue[partnerIdx]];
  // Remove both from queue (remove higher index first)
  const highIdx = Math.max(idxSelf, partnerIdx);
  const lowIdx = Math.min(idxSelf, partnerIdx);
  randomQueue.splice(highIdx, 1);
  randomQueue.splice(lowIdx, 1);

  const roomId = generateRoomId();
  rooms.set(roomId, new Map());

  const selfSocket = io.sockets.sockets.get(selfId);
  const partnerSocket = io.sockets.sockets.get(partnerId);

  if (!selfSocket || !partnerSocket) return;

  // Both join the Socket.IO room
  selfSocket.join(roomId);
  partnerSocket.join(roomId);

  const selfData = { userName: selfSocket.data.userName || 'Anonymous', oreyId: selfSocket.data.oreyId || null };
  const partnerData = { userName: partnerSocket.data.userName || 'Anonymous', oreyId: partnerSocket.data.oreyId || null };

  rooms.get(roomId).set(selfId, selfData);
  rooms.get(roomId).set(partnerId, partnerData);

  // Notify both
  selfSocket.emit('room-joined', { roomId, peers: [{ socketId: partnerId, ...partnerData }], autoMatched: true });
  partnerSocket.emit('room-joined', { roomId, peers: [{ socketId: selfId, ...selfData }], autoMatched: true });

  selfSocket.emit('incoming-call', { fromName: partnerData.userName, fromOreyId: partnerData.oreyId, autoMatched: true });
  partnerSocket.emit('incoming-call', { fromName: selfData.userName, fromOreyId: selfData.oreyId, autoMatched: true });
}

// ─── REST endpoints ───────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/generate-orey-id', (_req, res) => {
  cleanExpiredOreyIds();
  const oreyId = generateOreyId();
  const expiresAt = Date.now() + OREY_ID_TTL_MS;
  oreyIds.set(oreyId, { expiresAt, socketId: null, userName: '' });
  res.json({ oreyId, expiresAt });
});

app.get('/create-room', (_req, res) => {
  const roomId = generateRoomId();
  res.json({ roomId });
});

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
}

// ─── Socket.IO ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Identity ──────────────────────────────────────────────────────────────

  socket.on('register-orey-id', ({ oreyId, userName }) => {
    cleanExpiredOreyIds();
    const entry = oreyIds.get(oreyId);
    if (!entry) {
      socket.emit('orey-id-invalid');
      return;
    }
    if (entry.expiresAt < Date.now()) {
      oreyIds.delete(oreyId);
      socket.emit('orey-id-expired');
      return;
    }
    entry.socketId = socket.id;
    entry.userName = userName || 'Anonymous';
    socket.data.oreyId = oreyId;
    socket.data.userName = userName || 'Anonymous';
    socket.emit('orey-id-registered', { oreyId, expiresAt: entry.expiresAt });
  });

  // ── Direct call by Orey-ID ────────────────────────────────────────────────

  socket.on('connect-by-orey-id', ({ targetOreyId }) => {
    cleanExpiredOreyIds();
    const entry = oreyIds.get(targetOreyId);
    if (!entry) {
      socket.emit('orey-id-not-found');
      return;
    }
    if (entry.expiresAt < Date.now()) {
      oreyIds.delete(targetOreyId);
      socket.emit('orey-id-expired');
      return;
    }
    if (!entry.socketId) {
      socket.emit('orey-id-offline');
      return;
    }

    const targetSocket = io.sockets.sockets.get(entry.socketId);
    if (!targetSocket) {
      entry.socketId = null;
      socket.emit('orey-id-offline');
      return;
    }

    const roomId = generateRoomId();
    rooms.set(roomId, new Map());

    socket.join(roomId);
    targetSocket.join(roomId);

    const callerData = { userName: socket.data.userName || 'Anonymous', oreyId: socket.data.oreyId || null };
    const calleeData = { userName: entry.userName, oreyId: targetOreyId };

    rooms.get(roomId).set(socket.id, callerData);
    rooms.get(roomId).set(entry.socketId, calleeData);

    socket.emit('room-joined', { roomId, peers: [{ socketId: entry.socketId, ...calleeData }] });
    targetSocket.emit('room-joined', { roomId, peers: [{ socketId: socket.id, ...callerData }] });
    targetSocket.emit('incoming-call', { fromName: callerData.userName, fromOreyId: callerData.oreyId });
  });

  // ── Random matching ───────────────────────────────────────────────────────

  socket.on('join-random', () => {
    cancelAutoSearch(socket.id);
    removeFromQueue(socket.id);
    randomQueue.push(socket.id);
    socket.emit('waiting-for-match');
    attemptMatch(socket.id);
  });

  socket.on('cancel-random', () => {
    removeFromQueue(socket.id);
    cancelAutoSearch(socket.id);
    socket.emit('random-cancelled');
  });

  // ── Room management ───────────────────────────────────────────────────────

  socket.on('join-room', ({ roomId, userName }) => {
    socket.data.userName = userName || 'Anonymous';
    const room = rooms.get(roomId);
    if (!room) {
      rooms.set(roomId, new Map());
    }
    const r = rooms.get(roomId);
    if (r.size >= 2) {
      socket.emit('room-full');
      return;
    }
    socket.join(roomId);
    r.set(socket.id, { userName: socket.data.userName, oreyId: socket.data.oreyId || null });
    const peers = [...r.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([socketId, data]) => ({ socketId, ...data }));
    socket.emit('room-joined', { roomId, peers });
    socket.to(roomId).emit('user-joined', { socketId: socket.id, userName: socket.data.userName });
  });

  socket.on('skip', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      const partnerIds = [...room.keys()].filter(id => id !== socket.id);
      partnerIds.forEach(pid => {
        const partnerSocket = io.sockets.sockets.get(pid);
        if (partnerSocket) {
          room.delete(pid);
          partnerSocket.leave(roomId);
          partnerSocket.emit('partner-left', { socketId: socket.id, userName: socket.data.userName, reason: 'skip' });
          scheduleAutoSearch(partnerSocket);
        }
      });
      room.delete(socket.id);
      socket.leave(roomId);
      if (room.size === 0) rooms.delete(roomId);
    }
    socket.emit('skip-confirmed');
    // Re-queue self immediately
    removeFromQueue(socket.id);
    randomQueue.push(socket.id);
    socket.emit('waiting-for-match');
    attemptMatch(socket.id);
  });

  socket.on('leave-chat', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      const partnerIds = [...room.keys()].filter(id => id !== socket.id);
      partnerIds.forEach(pid => {
        const partnerSocket = io.sockets.sockets.get(pid);
        if (partnerSocket) {
          partnerSocket.emit('partner-left', { socketId: socket.id, userName: socket.data.userName, reason: 'left' });
          scheduleAutoSearch(partnerSocket);
        }
      });
      room.delete(socket.id);
      socket.leave(roomId);
      if (room.size === 0) rooms.delete(roomId);
    }
    socket.emit('left-chat-confirmed');
  });

  socket.on('cancel-auto-search', () => {
    cancelAutoSearch(socket.id);
    socket.emit('auto-search-cancelled');
  });

  // ── WebRTC signaling ──────────────────────────────────────────────────────

  socket.on('offer', ({ targetId, offer }) => {
    io.to(targetId).emit('offer', { offer, fromId: socket.id, fromName: socket.data.userName });
  });

  socket.on('answer', ({ targetId, answer }) => {
    io.to(targetId).emit('answer', { answer, fromId: socket.id });
  });

  socket.on('ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice-candidate', { candidate, fromId: socket.id });
  });

  // ── Media state ───────────────────────────────────────────────────────────

  socket.on('media-state', ({ roomId, audioEnabled, videoEnabled }) => {
    socket.to(roomId).emit('peer-media-state', { socketId: socket.id, audioEnabled, videoEnabled });
  });

  // ── ID sharing ────────────────────────────────────────────────────────────

  socket.on('share-id-request', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const partnerIds = [...room.keys()].filter(id => id !== socket.id);
    partnerIds.forEach(pid => {
      io.to(pid).emit('share-id-request', { fromId: socket.id, fromName: socket.data.userName });
    });
  });

  socket.on('share-id-accept', ({ roomId, targetId }) => {
    const myOreyId = socket.data.oreyId || null;
    io.to(targetId).emit('share-id-reveal', { oreyId: myOreyId, userName: socket.data.userName });
    socket.emit('share-id-reveal', { oreyId: oreyIds.get(socket.data.oreyId)?.socketId ? null : null, userName: '' });
    // Also reveal target's ID to requester
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      socket.emit('share-id-reveal', { oreyId: targetSocket.data.oreyId || null, userName: targetSocket.data.userName });
    }
  });

  socket.on('share-id-decline', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const partnerIds = [...room.keys()].filter(id => id !== socket.id);
    partnerIds.forEach(pid => {
      io.to(pid).emit('share-id-declined');
    });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    removeFromQueue(socket.id);
    cancelAutoSearch(socket.id);

    // Unregister Orey-ID
    if (socket.data.oreyId) {
      const entry = oreyIds.get(socket.data.oreyId);
      if (entry && entry.socketId === socket.id) {
        entry.socketId = null;
      }
    }

    // Notify partners
    const result = removeSocketFromRooms(socket.id);
    if (result) {
      const { roomId, peers } = result;
      for (const [pid] of peers.entries()) {
        const partnerSocket = io.sockets.sockets.get(pid);
        if (partnerSocket) {
          partnerSocket.emit('partner-left', { socketId: socket.id, userName: socket.data.userName, reason: 'disconnect' });
          scheduleAutoSearch(partnerSocket);
        }
      }
      if (peers.size === 0) rooms.delete(roomId);
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Orey server running on http://localhost:${PORT}`);
});
