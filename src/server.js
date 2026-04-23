const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Generate a new Orey-ID for a user
app.get("/generate-orey-id", (req, res) => {
  const id = generateOreyId();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  oreyIds.set(id, { expiresAt, socketId: null });
  res.json({ oreyId: id, expiresAt });
});

// Create a private room (for ID-based reconnection)
app.get("/create-room", (req, res) => {
  const roomId = uuidv4().substring(0, 8).toUpperCase();
  res.json({ roomId });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ── Data structures ──────────────────────────────────────────────────────────

// oreyId → { expiresAt, socketId, autoReconnect }
const oreyIds = new Map();

// roomId → Map<socketId, { userName, oreyId }>
const rooms = new Map();

// Queue of sockets waiting for a random match
const randomQueue = [];

// Store users who want auto-reconnect after disconnect
const autoReconnectQueue = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateOreyId() {
  // Format: Orey-XXXX-XXXX  (uppercase alphanumeric, no ambiguous chars)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `Orey-${seg(4)}-${seg(4)}`;
}

function cleanExpiredIds() {
  const now = Date.now();
  for (const [id, meta] of oreyIds) {
    if (meta.expiresAt < now) oreyIds.delete(id);
  }
}

// Run cleanup every 10 minutes
setInterval(cleanExpiredIds, 10 * 60 * 1000);

// Auto-reconnect timer for finding new partners (5 seconds delay)
function attemptAutoReconnect(socket, wasIntentional = false) {
  // Only auto-reconnect if not intentional leave and user is still connected
  if (!wasIntentional && socket.connected && socket.data.autoReconnectEnabled) {
    setTimeout(() => {
      if (socket.connected && socket.data.autoReconnectEnabled) {
        // Add to random queue for new match
        addToRandomQueue(socket);
        socket.emit("auto-reconnecting", { 
          message: "Looking for a new partner...",
          delay: 3000 
        });
      }
    }, 3000); // 3 second delay before searching
  }
}

function addToRandomQueue(socket) {
  // Remove stale entries from queue
  const validQueue = randomQueue.filter((s) => io.sockets.sockets.has(s.id));
  randomQueue.length = 0;
  randomQueue.push(...validQueue);

  if (randomQueue.length > 0) {
    const partner = randomQueue.shift();
    const roomId = uuidv4().substring(0, 8).toUpperCase();

    joinRoom(socket, roomId);
    joinRoom(partner, roomId);

    // Clear auto-reconnect flag for both users
    socket.data.autoReconnectEnabled = false;
    partner.data.autoReconnectEnabled = false;

    socket.emit("room-joined", {
      roomId,
      peers: [{ socketId: partner.id, userName: partner.data.userName }],
      autoReconnected: true
    });
    partner.emit("room-joined", {
      roomId,
      peers: [{ socketId: socket.id, userName: socket.data.userName }],
      autoReconnected: true
    });
    
    partner.emit("incoming-call", {
      fromName: socket.data.userName,
      fromOreyId: socket.data.oreyId,
      autoReconnected: true
    });
  } else {
    randomQueue.push(socket);
    socket.emit("waiting-for-match", { autoReconnectMode: true });
  }

  socket.data.inRandomQueue = true;
}

// ── Socket.IO ────────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);
  
  // Initialize auto-reconnect flag
  socket.data.autoReconnectEnabled = false;

  // ── Register / re-register an Orey-ID with this socket ──────────────────
  socket.on("register-orey-id", ({ oreyId, userName }) => {
    cleanExpiredIds();
    if (!oreyIds.has(oreyId)) {
      socket.emit("orey-id-invalid");
      return;
    }
    const meta = oreyIds.get(oreyId);
    if (meta.expiresAt < Date.now()) {
      oreyIds.delete(oreyId);
      socket.emit("orey-id-expired");
      return;
    }
    meta.socketId = socket.id;
    socket.data.oreyId = oreyId;
    socket.data.userName = userName;
    socket.emit("orey-id-registered", { oreyId, expiresAt: meta.expiresAt });
  });

  // ── Connect to another user by their Orey-ID ────────────────────────────
  socket.on("connect-by-orey-id", ({ targetOreyId }) => {
    cleanExpiredIds();
    const meta = oreyIds.get(targetOreyId);
    if (!meta || meta.expiresAt < Date.now()) {
      socket.emit("orey-id-not-found");
      return;
    }
    const targetSocket = io.sockets.sockets.get(meta.socketId);
    if (!targetSocket) {
      socket.emit("orey-id-offline");
      return;
    }

    // Create a private room for both
    const roomId = uuidv4().substring(0, 8).toUpperCase();
    joinRoom(socket, roomId);
    joinRoom(targetSocket, roomId);

    socket.emit("room-joined", {
      roomId,
      peers: [{ socketId: targetSocket.id, userName: targetSocket.data.userName }],
    });
    targetSocket.emit("room-joined", {
      roomId,
      peers: [{ socketId: socket.id, userName: socket.data.userName }],
    });
    targetSocket.emit("incoming-call", {
      fromName: socket.data.userName,
      fromOreyId: socket.data.oreyId,
    });
  });

  // ── Random match ─────────────────────────────────────────────────────────
  socket.on("join-random", ({ autoReconnect = false } = {}) => {
    // Set auto-reconnect flag if this is for auto-reconnection
    if (autoReconnect) {
      socket.data.autoReconnectEnabled = true;
    }
    
    // Remove stale entries from queue
    const validQueue = randomQueue.filter((s) => io.sockets.sockets.has(s.id));
    randomQueue.length = 0;
    randomQueue.push(...validQueue);

    if (randomQueue.length > 0) {
      const partner = randomQueue.shift();
      const roomId = uuidv4().substring(0, 8).toUpperCase();

      joinRoom(socket, roomId);
      joinRoom(partner, roomId);
      
      // Clear auto-reconnect flags
      socket.data.autoReconnectEnabled = false;
      partner.data.autoReconnectEnabled = false;

      socket.emit("room-joined", {
        roomId,
        peers: [{ socketId: partner.id, userName: partner.data.userName }],
        autoReconnected: autoReconnect
      });
      partner.emit("room-joined", {
        roomId,
        peers: [{ socketId: socket.id, userName: socket.data.userName }],
        autoReconnected: false
      });
      
      if (!autoReconnect) {
        partner.emit("incoming-call", {
          fromName: socket.data.userName,
          fromOreyId: socket.data.oreyId,
        });
      }
    } else {
      randomQueue.push(socket);
      socket.emit("waiting-for-match", { autoReconnectMode: autoReconnect });
    }

    socket.data.inRandomQueue = true;
  });

  socket.on("cancel-random", () => {
    removeFromQueue(socket);
    socket.data.autoReconnectEnabled = false;
    socket.emit("random-cancelled");
  });

  // ── User intentionally leaves the chat ───────────────────────────────────
  socket.on("leave-chat", ({ roomId, willAutoReconnect = false } = {}) => {
    // If user wants to auto-reconnect after leaving
    if (willAutoReconnect && roomId) {
      socket.data.autoReconnectEnabled = true;
      
      // Leave current room
      if (roomId && rooms.has(roomId)) {
        const room = rooms.get(roomId);
        const userName = socket.data.userName;
        room.delete(socket.id);
        
        if (room.size === 0) {
          rooms.delete(roomId);
        } else {
          socket.to(roomId).emit("user-left", { 
            socketId: socket.id, 
            userName,
            autoReconnecting: true 
          });
          // Notify the remaining user that partner is looking for new match
          socket.to(roomId).emit("partner-auto-reconnecting", {
            message: "Your partner is looking for a new match..."
          });
        }
      }
      
      // Remove from socket room
      if (roomId) {
        socket.leave(roomId);
        delete socket.data.roomId;
      }
      
      // Add to random queue for new match
      addToRandomQueue(socket);
      socket.emit("auto-reconnect-started", { 
        message: "Finding a new partner..." 
      });
    } else {
      // Normal leave - disable auto-reconnect
      socket.data.autoReconnectEnabled = false;
      
      if (roomId && rooms.has(roomId)) {
        const room = rooms.get(roomId);
        const userName = socket.data.userName;
        room.delete(socket.id);
        
        if (room.size === 0) {
          rooms.delete(roomId);
        } else {
          socket.to(roomId).emit("user-left", { 
            socketId: socket.id, 
            userName,
            autoReconnecting: false 
          });
        }
      }
      
      if (roomId) {
        socket.leave(roomId);
        delete socket.data.roomId;
      }
      
      socket.emit("left-chat-confirmed");
    }
  });

  // ── Join specific room ───────────────────────────────────────────────────
  socket.on("join-room", ({ roomId, userName }) => {
    const room = rooms.get(roomId) || new Map();
    if (room.size >= 2) {
      socket.emit("room-full");
      return;
    }
    socket.data.userName = userName;
    joinRoom(socket, roomId);

    const existingPeers = [...room.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([id, data]) => ({ socketId: id, userName: data.userName }));

    socket.emit("room-joined", { roomId, peers: existingPeers });
    socket.to(roomId).emit("user-joined", { socketId: socket.id, userName });
  });

  // ── WebRTC signalling ────────────────────────────────────────────────────
  socket.on("offer", ({ targetId, offer }) => {
    io.to(targetId).emit("offer", { offer, fromId: socket.id, fromName: socket.data.userName });
  });

  socket.on("answer", ({ targetId, answer }) => {
    io.to(targetId).emit("answer", { answer, fromId: socket.id });
  });

  socket.on("ice-candidate", ({ targetId, candidate }) => {
    io.to(targetId).emit("ice-candidate", { candidate, fromId: socket.id });
  });

  // ── Media state ──────────────────────────────────────────────────────────
  socket.on("media-state", ({ roomId, audioEnabled, videoEnabled }) => {
    socket.to(roomId).emit("peer-media-state", {
      socketId: socket.id,
      audioEnabled,
      videoEnabled,
    });
  });

  // ── ID sharing (both must consent) ──────────────────────────────────────
  socket.on("share-id-request", ({ roomId }) => {
    socket.to(roomId).emit("share-id-request", { fromId: socket.id, fromName: socket.data.userName });
  });

  socket.on("share-id-accept", ({ roomId, targetId }) => {
    const myOreyId = socket.data.oreyId || null;
    const targetOreyId = io.sockets.sockets.get(targetId)?.data?.oreyId || null;
    // Send each party the other's ID
    socket.emit("share-id-reveal", { oreyId: targetOreyId, userName: io.sockets.sockets.get(targetId)?.data?.userName });
    io.to(targetId).emit("share-id-reveal", { oreyId: myOreyId, userName: socket.data.userName });
  });

  socket.on("share-id-decline", ({ roomId }) => {
    socket.to(roomId).emit("share-id-declined");
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const { roomId, userName, oreyId, autoReconnectEnabled } = socket.data;
    removeFromQueue(socket);

    if (oreyId && oreyIds.has(oreyId)) {
      const meta = oreyIds.get(oreyId);
      if (meta.socketId === socket.id) meta.socketId = null;
    }

    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.delete(socket.id);
      
      if (room.size === 0) {
        rooms.delete(roomId);
      } else {
        // Notify remaining user that partner disconnected
        socket.to(roomId).emit("user-disconnected", { 
          socketId: socket.id, 
          userName,
          willAutoReconnect: autoReconnectEnabled 
        });
        
        // If auto-reconnect is enabled, notify the remaining user
        if (autoReconnectEnabled) {
          socket.to(roomId).emit("waiting-for-reconnect", {
            message: "Your partner disconnected but will try to reconnect..."
          });
        }
      }
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function joinRoom(socket, roomId) {
  const room = rooms.get(roomId) || new Map();
  room.set(socket.id, { userName: socket.data.userName, oreyId: socket.data.oreyId });
  rooms.set(roomId, room);
  socket.join(roomId);
  socket.data.roomId = roomId;
}

function removeFromQueue(socket) {
  const idx = randomQueue.indexOf(socket);
  if (idx !== -1) randomQueue.splice(idx, 1);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🎥 Orey server running on port ${PORT}`);
});
