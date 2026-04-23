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

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/create-room", (req, res) => {
  const roomId = uuidv4().substring(0, 8).toUpperCase();
  res.json({ roomId });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const rooms = new Map();
const waitingQueue = []; // Users waiting for random match

io.on("connection", (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // Set user name when they connect
  socket.on("set-user-name", ({ userName }) => {
    socket.data.userName = userName;
  });

  // Find random stranger (Omegle style)
  socket.on("find-stranger", () => {
    const userName = socket.data.userName || "Anonymous";
    
    // Check if user is already in a room
    if (socket.data.roomId) {
      socket.emit("error", { message: "You are already in a chat" });
      return;
    }

    // Look for someone waiting
    if (waitingQueue.length > 0) {
      const partner = waitingQueue.shift();
      
      // Create new room for the pair
      const roomId = uuidv4().substring(0, 8).toUpperCase();
      const room = new Map();
      
      // Add both users to room
      room.set(socket.id, { userName, socketId: socket.id });
      room.set(partner.id, { 
        userName: partner.data.userName || "Anonymous", 
        socketId: partner.id 
      });
      
      rooms.set(roomId, room);
      
      // Join both sockets to the room
      socket.join(roomId);
      partner.join(roomId);
      
      // Set room data
      socket.data.roomId = roomId;
      partner.data.roomId = roomId;
      
      // Notify both users
      socket.emit("matched", {
        roomId,
        peer: {
          socketId: partner.id,
          userName: partner.data.userName || "Anonymous"
        }
      });
      
      partner.emit("matched", {
        roomId,
        peer: {
          socketId: socket.id,
          userName: userName
        }
      });
      
      console.log(`[Match] ${userName} matched with ${partner.data.userName} in room ${roomId}`);
    } else {
      // Add to waiting queue
      waitingQueue.push(socket);
      socket.emit("waiting");
      console.log(`[Wait] ${userName} is waiting for stranger (Queue: ${waitingQueue.length})`);
    }
  });

  // Cancel waiting
  socket.on("cancel-waiting", () => {
    const index = waitingQueue.indexOf(socket);
    if (index > -1) {
      waitingQueue.splice(index, 1);
      socket.emit("waiting-cancelled");
      console.log(`[Wait] ${socket.data.userName} cancelled waiting (Queue: ${waitingQueue.length})`);
    }
  });

  // Skip to next stranger
  socket.on("next-stranger", () => {
    const { roomId, userName } = socket.data;
    
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      
      // Notify partner that user is leaving
      room.forEach((user, socketId) => {
        if (socketId !== socket.id) {
          io.to(socketId).emit("partner-disconnected");
        }
      });
      
      // Clean up current room
      room.delete(socket.id);
      if (room.size === 0) {
        rooms.delete(roomId);
      }
      
      socket.leave(roomId);
      delete socket.data.roomId;
      
      console.log(`[Skip] ${userName} skipped to next stranger`);
    }
    
    // Find new stranger immediately
    socket.emit("finding-next");
  });

  // Join specific room (for sharing links)
  socket.on("join-room", ({ roomId, userName }) => {
    // Check if room exists
    let room = rooms.get(roomId);
    
    if (!room) {
      room = new Map();
      rooms.set(roomId, room);
    }

    // Omegle-style: max 2 people per room
    if (room.size >= 2) {
      socket.emit("room-full");
      return;
    }

    // Clean up any previous room
    if (socket.data.roomId) {
      const oldRoom = rooms.get(socket.data.roomId);
      if (oldRoom) {
        oldRoom.delete(socket.id);
        if (oldRoom.size === 0) {
          rooms.delete(socket.data.roomId);
        }
      }
      socket.leave(socket.data.roomId);
    }

    room.set(socket.id, { userName, socketId: socket.id });
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userName = userName;

    const existingPeers = [...room.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([id, data]) => ({ socketId: id, userName: data.userName }));

    socket.emit("room-joined", { roomId, peers: existingPeers });
    socket.to(roomId).emit("user-joined", { socketId: socket.id, userName });

    console.log(`[Room ${roomId}] ${userName} joined. Total: ${room.size}/2`);
  });

  // WebRTC Signaling
  socket.on("offer", ({ targetId, offer }) => {
    io.to(targetId).emit("offer", {
      offer,
      fromId: socket.id,
      fromName: socket.data.userName,
    });
  });

  socket.on("answer", ({ targetId, answer }) => {
    io.to(targetId).emit("answer", { answer, fromId: socket.id });
  });

  socket.on("ice-candidate", ({ targetId, candidate }) => {
    io.to(targetId).emit("ice-candidate", { candidate, fromId: socket.id });
  });

  // Media state changes
  socket.on("media-state", ({ roomId, audioEnabled, videoEnabled }) => {
    socket.to(roomId).emit("peer-media-state", {
      socketId: socket.id,
      audioEnabled,
      videoEnabled,
    });
  });

  // Chat messages
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

  // Handle disconnection
  socket.on("disconnect", () => {
    const { roomId, userName } = socket.data;
    
    // Remove from waiting queue if present
    const waitingIndex = waitingQueue.indexOf(socket);
    if (waitingIndex > -1) {
      waitingQueue.splice(waitingIndex, 1);
      console.log(`[Wait] ${userName} disconnected from queue`);
    }
    
    // Clean up room if in one
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.delete(socket.id);
      
      if (room.size === 0) {
        rooms.delete(roomId);
        console.log(`[Room ${roomId}] Empty — removed`);
      } else {
        rooms.set(roomId, room);
        socket.to(roomId).emit("user-left", { socketId: socket.id, userName });
        console.log(`[Room ${roomId}] ${userName} left. Remaining: ${room.size}`);
      }
    }
    
    console.log(`[-] Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🎥 Omegle-style VideoChat server running on port ${PORT}`);
  console.log(`📡 Random matching enabled - users can find strangers instantly`);
});
