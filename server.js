const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", (_req, res) =>
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() })
);

app.get("/generate-orey-id", (_req, res) => {
  const id = generateOreyId();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  oreyIds.set(id, { expiresAt, socketId: null });
  res.json({ oreyId: id, expiresAt });
});

app.get("/create-room", (_req, res) => {
  res.json({ roomId: uuidv4().substring(0, 8).toUpperCase() });
});

app.get("*", (_req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

// ── Data structures ───────────────────────────────────────────────────────────

/** oreyId → { expiresAt, socketId } */
const oreyIds = new Map();

/** roomId → Map<socketId, { userName, oreyId }> */
const rooms = new Map();

/** Sockets waiting for a random match */
const randomQueue = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateOreyId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n) =>
    Array.from({ length: n }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  return `Orey-${seg(4)}-${seg(4)}`;
}

function cleanExpiredIds() {
  const now = Date.now();
  for (const [id, meta] of oreyIds)
    if (meta.expiresAt < now) oreyIds.delete(id);
}
setInterval(cleanExpiredIds, 10 * 60 * 1000);

/** Remove disconnected sockets from the random queue (mutates in place). */
function cleanQueue() {
  const live = randomQueue.filter((s) => io.sockets.sockets.has(s.id));
  randomQueue.length = 0;
  randomQueue.push(...live);
}

/** Remove a specific socket from the random queue. */
function removeFromQueue(socket) {
  const idx = randomQueue.indexOf(socket);
  if (idx !== -1) randomQueue.splice(idx, 1);
  socket.data.inRandomQueue = false;
}

/** Join a socket to a room, updating all relevant state. */
function joinRoom(socket, roomId) {
  const room = rooms.get(roomId) ?? new Map();
  room.set(socket.id, {
    userName: socket.data.userName,
    oreyId: socket.data.oreyId,
  });
  rooms.set(roomId, room);
  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.inRandomQueue = false;
}

/**
 * Remove a socket from its current room.
 * Notifies remaining peers with `reason` ('left' | 'skipped' | 'disconnected').
 * Returns the roomId that was cleaned up (or null).
 */
function leaveRoom(socket, reason = "left") {
  const roomId = socket.data.roomId;
  if (!roomId || !rooms.has(roomId)) return null;

  const room = rooms.get(roomId);
  const userName = socket.data.userName;
  room.delete(socket.id);

  if (room.size === 0) {
    rooms.delete(roomId);
  } else {
    socket.to(roomId).emit("partner-left", {
      socketId: socket.id,
      userName,
      reason, // 'left' | 'skipped' | 'disconnected'
    });
  }

  socket.leave(roomId);
  delete socket.data.roomId;
  return roomId;
}

/**
 * Put a socket into the random queue or match it immediately.
 * Emits `room-joined` + `incoming-call` to both sides on a match,
 * or `waiting-for-match` if queued.
 */
function requeueSocket(socket) {
  // Prevent double-queuing
  if (socket.data.inRandomQueue) return;

  cleanQueue();

  if (randomQueue.length > 0) {
    const partner = randomQueue.shift();
    partner.data.inRandomQueue = false;

    const roomId = uuidv4().substring(0, 8).toUpperCase();
    joinRoom(socket, roomId);
    joinRoom(partner, roomId);

    socket.emit("room-joined", {
      roomId,
      peers: [{ socketId: partner.id, userName: partner.data.userName }],
      autoMatched: true,
    });
    partner.emit("room-joined", {
      roomId,
      peers: [{ socketId: socket.id, userName: socket.data.userName }],
      autoMatched: true,
    });
    partner.emit("incoming-call", {
      fromName: socket.data.userName,
      fromOreyId: socket.data.oreyId,
      autoMatched: true,
    });
  } else {
    randomQueue.push(socket);
    socket.data.inRandomQueue = true;
    socket.emit("waiting-for-match", {});
  }
}

/**
 * Auto-search: when a partner leaves/disconnects, queue the remaining user
 * after AUTO_SEARCH_DELAY ms (they can cancel with 'cancel-auto-search').
 */
const AUTO_SEARCH_DELAY = 3000; // ms

function scheduleAutoSearch(socket) {
  if (!socket.connected) return;

  // Let the client show a countdown / cancel button
  socket.emit("auto-search-scheduled", { delay: AUTO_SEARCH_DELAY });

  const timer = setTimeout(() => {
    if (socket.connected && socket.data.autoSearchTimer) {
      delete socket.data.autoSearchTimer;
      requeueSocket(socket);
    }
  }, AUTO_SEARCH_DELAY);

  socket.data.autoSearchTimer = timer;
}

function cancelAutoSearch(socket) {
  if (socket.data.autoSearchTimer) {
    clearTimeout(socket.data.autoSearchTimer);
    delete socket.data.autoSearchTimer;
    socket.emit("auto-search-cancelled", {});
  }
}

// ── Socket.IO ─────────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Register / re-register an Orey-ID ──────────────────────────────────
  socket.on("register-orey-id", ({ oreyId, userName }) => {
    cleanExpiredIds();
    const meta = oreyIds.get(oreyId);
    if (!meta) { socket.emit("orey-id-invalid"); return; }
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

  // ── Connect by Orey-ID ──────────────────────────────────────────────────
  socket.on("connect-by-orey-id", ({ targetOreyId }) => {
    cleanExpiredIds();
    const meta = oreyIds.get(targetOreyId);
    if (!meta || meta.expiresAt < Date.now()) {
      socket.emit("orey-id-not-found"); return;
    }
    const targetSocket = io.sockets.sockets.get(meta.socketId);
    if (!targetSocket) { socket.emit("orey-id-offline"); return; }

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

  // ── Random match ────────────────────────────────────────────────────────
  socket.on("join-random", () => {
    cancelAutoSearch(socket);
    requeueSocket(socket);
  });

  socket.on("cancel-random", () => {
    removeFromQueue(socket);
    socket.emit("random-cancelled");
  });

  // ── Skip current partner → instantly queue for next ─────────────────────
  // Client emits: { roomId }
  socket.on("skip", ({ roomId } = {}) => {
    cancelAutoSearch(socket);
    leaveRoom(socket, "skipped");  // notifies partner with reason='skipped'
    requeueSocket(socket);         // immediately search for next partner
    socket.emit("skip-confirmed"); // optional ack
  });

  // ── Cancel auto-search (client shows countdown, user clicks cancel) ─────
  socket.on("cancel-auto-search", () => {
    cancelAutoSearch(socket);
  });

  // ── Intentional leave ───────────────────────────────────────────────────
  socket.on("leave-chat", ({ roomId } = {}) => {
    cancelAutoSearch(socket);
    leaveRoom(socket, "left");
    socket.emit("left-chat-confirmed");
  });

  // ── Join specific room ──────────────────────────────────────────────────
  socket.on("join-room", ({ roomId, userName }) => {
    const room = rooms.get(roomId) ?? new Map();
    if (room.size >= 2) { socket.emit("room-full"); return; }

    socket.data.userName = userName;
    joinRoom(socket, roomId);

    const peers = [...room.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([id, d]) => ({ socketId: id, userName: d.userName }));

    socket.emit("room-joined", { roomId, peers });
    socket.to(roomId).emit("user-joined", { socketId: socket.id, userName });
  });

  // ── WebRTC signalling ───────────────────────────────────────────────────
  socket.on("offer", ({ targetId, offer }) =>
    io.to(targetId).emit("offer", { offer, fromId: socket.id, fromName: socket.data.userName })
  );
  socket.on("answer", ({ targetId, answer }) =>
    io.to(targetId).emit("answer", { answer, fromId: socket.id })
  );
  socket.on("ice-candidate", ({ targetId, candidate }) =>
    io.to(targetId).emit("ice-candidate", { candidate, fromId: socket.id })
  );

  // ── Media state ─────────────────────────────────────────────────────────
  socket.on("media-state", ({ roomId, audioEnabled, videoEnabled }) => {
    socket.to(roomId).emit("peer-media-state", {
      socketId: socket.id,
      audioEnabled,
      videoEnabled,
    });
  });

  // ── ID sharing ──────────────────────────────────────────────────────────
  socket.on("share-id-request", ({ roomId }) => {
    socket.to(roomId).emit("share-id-request", {
      fromId: socket.id,
      fromName: socket.data.userName,
    });
  });
  socket.on("share-id-accept", ({ roomId, targetId }) => {
    const target = io.sockets.sockets.get(targetId);
    socket.emit("share-id-reveal", {
      oreyId: target?.data?.oreyId ?? null,
      userName: target?.data?.userName,
    });
    io.to(targetId).emit("share-id-reveal", {
      oreyId: socket.data.oreyId ?? null,
      userName: socket.data.userName,
    });
  });
  socket.on("share-id-decline", ({ roomId }) => {
    socket.to(roomId).emit("share-id-declined");
  });

  // ── Disconnect ──────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const { oreyId } = socket.data;

    cancelAutoSearch(socket);
    removeFromQueue(socket);

    // Clear Orey-ID socket reference
    if (oreyId && oreyIds.has(oreyId)) {
      const meta = oreyIds.get(oreyId);
      if (meta.socketId === socket.id) meta.socketId = null;
    }

    // Notify partner and schedule auto-search for them
    const roomId = socket.data.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.delete(socket.id);

      if (room.size === 0) {
        rooms.delete(roomId);
      } else {
        // Notify remaining peer
        socket.to(roomId).emit("partner-left", {
          socketId: socket.id,
          userName: socket.data.userName,
          reason: "disconnected",
        });

        // Schedule auto-search for every remaining peer
        for (const [peerId] of room) {
          const peerSocket = io.sockets.sockets.get(peerId);
          if (peerSocket) scheduleAutoSearch(peerSocket);
        }
      }
    }

    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`🎥 Orey server running on port ${PORT}`)
);
