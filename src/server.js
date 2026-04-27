const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);
app.use('/admin/', apiLimiter);

app.use(express.json());

// ─── Socket.IO Setup ────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── Configuration ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const OREY_ID_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_SEARCH_DELAY_MS = 5000;

const API_KEY = process.env.API_KEY || 'oryx_2024_secure_key_change_this';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_secret_change_this';

const VIDEO_QUALITY = {
  low: { maxBitrate: 150000, scaleResolutionDownBy: 4, maxFramerate: 15 },
  medium: { maxBitrate: 500000, scaleResolutionDownBy: 2, maxFramerate: 24 },
  high: { maxBitrate: 1500000, scaleResolutionDownBy: 1, maxFramerate: 30 },
  hd: { maxBitrate: 4000000, scaleResolutionDownBy: 1, maxFramerate: 30 },
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

// ─── In-Memory State ────────────────────────────────────────────────────────
const oreyIds = new Map();
const rooms = new Map();
const randomQueue = [];
const autoSearchTimers = new Map();

let notifications = [
  {
    id: 1,
    title: "🎉 Welcome to Orey!",
    message: "Start video calling with friends using Orey-ID. Swipe to discover new people!",
    type: "info",
    priority: "normal",
    timestamp: new Date().toISOString(),
    actionUrl: "/welcome",
    icon: "🎉",
    isRead: false,
    expiresIn: 30
  },
  {
    id: 2,
    title: "📹 HD Video Available!",
    message: "Update your app to enjoy HD video quality calls with better clarity.",
    type: "feature",
    priority: "high",
    timestamp: new Date().toISOString(),
    actionUrl: "/settings/quality",
    icon: "📹",
    isRead: false,
    expiresIn: 14
  }
];

let appConfig = {
  android: {
    versionCode: 1,
    versionName: "1.0.0",
    updateType: "flexible",
    updatePriority: 2,
    updateMessage: "New features available! Update for better experience.",
    updateTitle: "Update Available",
    whatsNew: [
      "HD Video quality support",
      "Push notifications",
      "Improved connection stability",
      "Bug fixes"
    ],
    forceUpdateMinVersion: 1,
    downloadUrl: "https://play.google.com/store/apps/details?id=com.orey.app",
    changelog: "https://orey.app/changelog"
  },
  maintenance: {
    enabled: false,
    message: "We're improving Orey. Back soon!"
  },
  videoQuality: {
    default: "medium",
    autoAdjust: true,
    maxBitrate: 1500000
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateOreyId() {
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
      if (peers.size === 0) rooms.delete(roomId);
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
  if (randomQueue.length < 2) return;

  const idxSelf = randomQueue.indexOf(newSocketId);
  if (idxSelf === -1) return;

  let partnerIdx = -1;
  for (let i = 0; i < randomQueue.length; i++) {
    if (i !== idxSelf) { partnerIdx = i; break; }
  }
  if (partnerIdx === -1) return;

  const [selfId, partnerId] = [randomQueue[idxSelf], randomQueue[partnerIdx]];
  const highIdx = Math.max(idxSelf, partnerIdx);
  const lowIdx = Math.min(idxSelf, partnerIdx);
  randomQueue.splice(highIdx, 1);
  randomQueue.splice(lowIdx, 1);

  const roomId = generateRoomId();
  rooms.set(roomId, new Map());

  const selfSocket = io.sockets.sockets.get(selfId);
  const partnerSocket = io.sockets.sockets.get(partnerId);

  if (!selfSocket || !partnerSocket) return;

  selfSocket.join(roomId);
  partnerSocket.join(roomId);

  const selfData = { 
    userName: selfSocket.data.userName || 'Anonymous', 
    oreyId: selfSocket.data.oreyId || null 
  };
  const partnerData = { 
    userName: partnerSocket.data.userName || 'Anonymous', 
    oreyId: partnerSocket.data.oreyId || null 
  };

  rooms.get(roomId).set(selfId, selfData);
  rooms.get(roomId).set(partnerId, partnerData);

  const qualityConfig = appConfig.videoQuality;
  const roomData = { 
    roomId, 
    videoQuality: qualityConfig,
    iceServers: ICE_SERVERS,
    autoMatched: true 
  };

  selfSocket.emit('room-joined', { 
    ...roomData,
    peers: [{ socketId: partnerId, ...partnerData }]
  });
  partnerSocket.emit('room-joined', { 
    ...roomData,
    peers: [{ socketId: selfId, ...selfData }]
  });

  selfSocket.emit('incoming-call', { 
    fromName: partnerData.userName, 
    fromOreyId: partnerData.oreyId, 
    autoMatched: true 
  });
  partnerSocket.emit('incoming-call', { 
    fromName: selfData.userName, 
    fromOreyId: selfData.oreyId, 
    autoMatched: true 
  });
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────

const verifyApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  if (apiKey !== API_KEY) return res.status(403).json({ error: 'Invalid API key' });
  next();
};

const verifyAdminKey = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey) return res.status(401).json({ error: 'Admin key required' });
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Invalid admin key' });
  next();
};

// ─── Public REST Endpoints ──────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeConnections: io.engine.clientsCount,
    memory: process.memoryUsage().heapUsed / 1024 / 1024
  });
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

app.get('/api/get-key-hash', (_req, res) => {
  const hash = crypto.createHash('sha256').update(API_KEY).digest('hex');
  res.json({ hash: hash.substring(0, 32) });
});

// ─── App API Endpoints (Require API Key) ────────────────────────────────────

app.get('/api/version', (req, res) => {
  const platform = req.query.platform || 'android';
  const clientVersion = parseInt(req.query.version) || 0;
  
  const platformConfig = appConfig[platform];
  if (!platformConfig) return res.status(400).json({ error: 'Invalid platform' });
  
  if (clientVersion < platformConfig.versionCode) {
    res.json({ updateAvailable: true, ...platformConfig });
  } else {
    res.json({ updateAvailable: false, currentVersion: platformConfig.versionName });
  }
});

app.get('/api/notifications', (req, res) => {
  const lastId = parseInt(req.query.after_id) || 0;
  
  let filtered = notifications.filter(n => n.id > lastId);
  
  const now = new Date();
  filtered = filtered.filter(n => {
    if (n.expiresIn) {
      const expiry = new Date(n.timestamp);
      expiry.setDate(expiry.getDate() + n.expiresIn);
      return now <= expiry;
    }
    return true;
  });
  
  res.json({
    notifications: filtered,
    total: notifications.length,
    unread: notifications.filter(n => !n.isRead).length,
    lastSync: new Date().toISOString()
  });
});

app.get('/api/config', (req, res) => {
  const clientVersion = parseInt(req.query.version) || 0;
  
  res.json({
    features: {
      videoCall: true,
      hdVideo: clientVersion >= 2,
      groupCall: false,
      screenShare: clientVersion >= 3
    },
    videoQuality: appConfig.videoQuality,
    iceServers: ICE_SERVERS,
    urls: {
      mainApp: process.env.MAIN_APP_URL || "https://parallel-elsi-seeutech-50a3ab2e.koyeb.app/",
      help: "https://orey.app/help"
    },
    maintenance: appConfig.maintenance
  });
});

// ─── Admin Endpoints (Require Admin Key) ────────────────────────────────────

app.get('/admin/notifications', verifyAdminKey, (_req, res) => {
  res.json({ 
    notifications, 
    total: notifications.length,
    active: notifications.filter(n => {
      if (n.expiresIn) {
        const expiry = new Date(n.timestamp);
        expiry.setDate(expiry.getDate() + n.expiresIn);
        return new Date() <= expiry;
      }
      return true;
    }).length
  });
});

app.post('/admin/notifications', verifyAdminKey, (req, res) => {
  const { title, message, type, priority, actionUrl, icon, expiresIn } = req.body;
  
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required' });
  }
  
  const newId = notifications.length > 0 
    ? Math.max(...notifications.map(n => n.id)) + 1 
    : 1;
    
  const newNotification = {
    id: newId,
    title,
    message,
    type: type || 'info',
    priority: priority || 'normal',
    timestamp: new Date().toISOString(),
    actionUrl: actionUrl || '/',
    icon: icon || '📢',
    isRead: false,
    expiresIn: expiresIn || 30
  };
  
  notifications.push(newNotification);
  
  io.emit('new-notification', newNotification);
  
  console.log(`📢 Notification sent: "${title}" to ${io.engine.clientsCount} clients`);
  
  res.json({ 
    success: true, 
    notification: newNotification,
    activeClients: io.engine.clientsCount
  });
});

app.delete('/admin/notifications/:id', verifyAdminKey, (req, res) => {
  const id = parseInt(req.params.id);
  const index = notifications.findIndex(n => n.id === id);
  
  if (index === -1) return res.status(404).json({ error: 'Notification not found' });
  
  const deleted = notifications.splice(index, 1)[0];
  res.json({ success: true, deleted });
});

app.put('/api/version', verifyAdminKey, (req, res) => {
  const { platform, versionCode, versionName, updateType, updateMessage, downloadUrl, whatsNew } = req.body;
  
  if (!platform || !versionCode) {
    return res.status(400).json({ error: 'Platform and versionCode required' });
  }
  
  if (!appConfig[platform]) appConfig[platform] = {};
  
  Object.assign(appConfig[platform], { 
    versionCode, 
    versionName: versionName || `v${versionCode}`,
    updateType: updateType || 'flexible',
    updateMessage: updateMessage || 'New update available!',
    downloadUrl: downloadUrl || appConfig[platform].downloadUrl
  });
  
  if (whatsNew) appConfig[platform].whatsNew = whatsNew;
  
  io.emit('update-available', appConfig[platform]);
  
  res.json({ success: true, config: appConfig[platform] });
});

app.post('/admin/maintenance', verifyAdminKey, (req, res) => {
  const { enabled, message } = req.body;
  appConfig.maintenance = { 
    enabled: enabled || false, 
    message: message || '' 
  };
  
  io.emit('maintenance-mode', appConfig.maintenance);
  
  console.log(`🔧 Maintenance ${enabled ? 'ENABLED' : 'DISABLED'}`);
  
  res.json({ success: true, maintenance: appConfig.maintenance });
});

app.put('/admin/video-quality', verifyAdminKey, (req, res) => {
  const { default: def, autoAdjust, maxBitrate } = req.body;
  
  if (def && VIDEO_QUALITY[def]) appConfig.videoQuality.default = def;
  if (autoAdjust !== undefined) appConfig.videoQuality.autoAdjust = autoAdjust;
  if (maxBitrate) appConfig.videoQuality.maxBitrate = maxBitrate;
  
  io.emit('video-quality-update', appConfig.videoQuality);
  
  res.json({ success: true, videoQuality: appConfig.videoQuality });
});

app.get('/admin/stats', verifyAdminKey, (_req, res) => {
  res.json({
    activeConnections: io.engine.clientsCount,
    totalOreyIds: oreyIds.size,
    activeRooms: rooms.size,
    queueLength: randomQueue.length,
    totalNotifications: notifications.length,
    uptime: process.uptime(),
    memoryMB: process.memoryUsage().heapUsed / 1024 / 1024
  });
});

// ─── Admin Panel Routes (NO AUTH REQUIRED for the page itself) ────────────────
// IMPORTANT: These must be BEFORE the static file serving and catch-all route

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/admin.html', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// ─── Static Files & SPA ─────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  // Serve static files from public directory
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    index: false // Don't auto-serve index.html
  }));
  
  // Catch-all for React SPA - but skip API and Admin routes
  app.get('*', (req, res) => {
    // Don't interfere with API or admin routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    // Don't serve admin page as SPA
    if (req.path === '/admin' || req.path === '/admin.html') {
      return res.status(404).json({ error: 'Not found' });
    }
    // Serve React app for all other routes
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
}

// ─── Socket.IO Events ───────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id} (Total: ${io.engine.clientsCount})`);

  // Send config on connect
  socket.emit('video-quality-config', {
    quality: appConfig.videoQuality,
    servers: ICE_SERVERS
  });

  // Check for active maintenance
  if (appConfig.maintenance.enabled) {
    socket.emit('maintenance-mode', appConfig.maintenance);
  }

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

    const roomData = { 
      roomId, 
      videoQuality: appConfig.videoQuality,
      iceServers: ICE_SERVERS 
    };

    socket.emit('room-joined', { ...roomData, peers: [{ socketId: entry.socketId, ...calleeData }] });
    targetSocket.emit('room-joined', { ...roomData, peers: [{ socketId: socket.id, ...callerData }] });
    targetSocket.emit('incoming-call', { fromName: callerData.userName, fromOreyId: callerData.oreyId });
  });

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

  socket.on('join-room', ({ roomId, userName }) => {
    socket.data.userName = userName || 'Anonymous';
    const room = rooms.get(roomId);
    if (!room) rooms.set(roomId, new Map());
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
    
    socket.emit('room-joined', { 
      roomId, 
      peers,
      videoQuality: appConfig.videoQuality,
      iceServers: ICE_SERVERS
    });
    socket.to(roomId).emit('user-joined', { socketId: socket.id, userName: socket.data.userName });
  });

  socket.on('request-quality-change', ({ roomId, quality }) => {
    if (VIDEO_QUALITY[quality]) {
      socket.to(roomId).emit('quality-change-requested', { 
        fromId: socket.id, 
        quality, 
        config: VIDEO_QUALITY[quality] 
      });
    }
  });

  socket.on('accept-quality-change', ({ roomId, quality }) => {
    if (VIDEO_QUALITY[quality]) {
      socket.to(roomId).emit('quality-change-accepted', { 
        quality, 
        config: VIDEO_QUALITY[quality] 
      });
    }
  });

  socket.on('offer', ({ targetId, offer }) => {
    io.to(targetId).emit('offer', { offer, fromId: socket.id, fromName: socket.data.userName });
  });

  socket.on('answer', ({ targetId, answer }) => {
    io.to(targetId).emit('answer', { answer, fromId: socket.id });
  });

  socket.on('ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice-candidate', { candidate, fromId: socket.id });
  });

  socket.on('media-state', ({ roomId, audioEnabled, videoEnabled }) => {
    socket.to(roomId).emit('peer-media-state', { 
      socketId: socket.id, 
      audioEnabled, 
      videoEnabled 
    });
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
          partnerSocket.emit('partner-left', { 
            socketId: socket.id, 
            userName: socket.data.userName, 
            reason: 'skip' 
          });
          scheduleAutoSearch(partnerSocket);
        }
      });
      room.delete(socket.id);
      socket.leave(roomId);
      if (room.size === 0) rooms.delete(roomId);
    }
    socket.emit('skip-confirmed');
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
          partnerSocket.emit('partner-left', { 
            socketId: socket.id, 
            userName: socket.data.userName, 
            reason: 'left' 
          });
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

  socket.on('share-id-request', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const partnerIds = [...room.keys()].filter(id => id !== socket.id);
    partnerIds.forEach(pid => {
      io.to(pid).emit('share-id-request', { 
        fromId: socket.id, 
        fromName: socket.data.userName 
      });
    });
  });

  socket.on('share-id-accept', ({ roomId, targetId }) => {
    const myOreyId = socket.data.oreyId || null;
    io.to(targetId).emit('share-id-reveal', { 
      oreyId: myOreyId, 
      userName: socket.data.userName 
    });
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      socket.emit('share-id-reveal', { 
        oreyId: targetSocket.data.oreyId || null, 
        userName: targetSocket.data.userName 
      });
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

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id} (Total: ${io.engine.clientsCount})`);
    removeFromQueue(socket.id);
    cancelAutoSearch(socket.id);

    if (socket.data.oreyId) {
      const entry = oreyIds.get(socket.data.oreyId);
      if (entry && entry.socketId === socket.id) {
        entry.socketId = null;
      }
    }

    const result = removeSocketFromRooms(socket.id);
    if (result) {
      const { roomId, peers } = result;
      for (const [pid] of peers.entries()) {
        const partnerSocket = io.sockets.sockets.get(pid);
        if (partnerSocket) {
          partnerSocket.emit('partner-left', { 
            socketId: socket.id, 
            userName: socket.data.userName, 
            reason: 'disconnect' 
          });
          scheduleAutoSearch(partnerSocket);
        }
      }
      if (peers.size === 0) rooms.delete(roomId);
    }
  });
});

// ─── Start Server ────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Orey Server Running');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 URL:        http://localhost:${PORT}`);
  console.log(`👥 Socket.IO:  Active`);
  console.log(`📹 Quality:    ${Object.keys(VIDEO_QUALITY).join(', ')}`);
  console.log(`🔑 API Key:    ${API_KEY.substring(0, 8)}...`);
  console.log(`🛡️ Admin Key:  ${ADMIN_KEY.substring(0, 8)}...`);
  console.log(`🖥️  Admin Page: http://localhost:${PORT}/admin`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
