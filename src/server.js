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

// Serve static frontend files
app.use(express.static(path.join(__dirname, "../public")));

// Health check endpoint for Koyeb
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Room creation endpoint
app.get("/create-room", (req, res) => {
  const roomId = uuidv4().substring(0, 8).toUpperCase();
  res.json({ roomId });
});

// Catch-all: serve frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Track active rooms and their participants
const rooms = new Map();

io.on("connection", (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // User joins a room
  socket.on("join-room", ({ roomId, userName }) => {
    const room = rooms.get(roomId) || new Map();

    // Omegle-style: max 2 people per room
    if (room.size >= 2) {
      socket.emit("room-full");
      return;
    }

    room.set(socket.id, { userName, socketId: socket.id });
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userName = userName;

    // Tell the joining user who is already in the room
    const existingPeers = [...room.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([id, data]) => ({ socketId: id, userName: data.userName }));

    socket.emit("room-joined", { roomId, peers: existingPeers });

    // Notify others in the room
    socket.to(roomId).emit("user-joined", {
      socketId: socket.id,
      userName,
    });

    console.log(
      `[Room ${roomId}] ${userName} joined. Total: ${room.size} users`
    );
  });

  // WebRTC Offer
  socket.on("offer", ({ targetId, offer }) => {
    io.to(targetId).emit("offer", {
      offer,
      fromId: socket.id,
      fromName: socket.data.userName,
    });
  });

  // WebRTC Answer
  socket.on("answer", ({ targetId, answer }) => {
    io.to(targetId).emit("answer", { answer, fromId: socket.id });
  });

  // ICE Candidate
  socket.on("ice-candidate", ({ targetId, candidate }) => {
    io.to(targetId).emit("ice-candidate", { candidate, fromId: socket.id });
  });

  // Toggle media state (mute/video off)
  socket.on("media-state", ({ roomId, audioEnabled, videoEnabled }) => {
    socket.to(roomId).emit("peer-media-state", {
      socketId: socket.id,
      audioEnabled,
      videoEnabled,
    });
  });

  // Chat message
  socket.on("chat-message", ({ roomId, message }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit("chat-message", {
      socketId: socket.id,
      userName: socket.data.userName,
      message,
      timestamp: new Date().toISOString(),
    });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const { roomId, userName } = socket.data;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.delete(socket.id);
      if (room.size === 0) {
        rooms.delete(roomId);
        console.log(`[Room ${roomId}] Empty — removed`);
      } else {
        rooms.set(roomId, room);
        socket.to(roomId).emit("user-left", { socketId: socket.id, userName });
        console.log(
          `[Room ${roomId}] ${userName} left. Remaining: ${room.size}`
        );
      }
    }
    console.log(`[-] Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🎥 VideoChat server running on port ${PORT}`);
});
